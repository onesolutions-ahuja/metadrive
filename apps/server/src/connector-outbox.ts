import { randomUUID } from 'node:crypto';

/** SQL-only, tenant-scoped delivery queue. Callers must encrypt payloads before enqueue. */
export type SqlClient = { query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> };
export type DeliveryInput = { tenantId: string; credentialId: string; operationKey: string;
  method: string; path: string; encryptedRequest: string; maxAttempts?: number };
export type ClaimedDelivery = { id: string; tenantId: string; credentialId: string;
  operationKey: string; method: string; path: string; encryptedRequest: string;
  attempts: number; maxAttempts: number };
const bounded = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
export class IntegrationOutbox {
  constructor(private readonly db: SqlClient) {}
  /** An unapplied additive migration must not interrupt unrelated scheduled Flows. */
  async ready(): Promise<boolean> {
    const result = await this.db.query("SELECT to_regclass('md_integration_outbox') IS NOT NULL AS installed");
    return result.rows[0]?.installed === true;
  }
  async enqueue(input: DeliveryInput): Promise<string> {
    if (!input.tenantId || !input.credentialId || !input.operationKey || input.operationKey.length > 200 ||
      !/^[A-Z]+$/.test(input.method) || !input.path.startsWith('/') || input.path.startsWith('//') ||
      !input.encryptedRequest.startsWith('enc:') || !bounded(input.maxAttempts ?? 3, 1, 10))
      throw new Error('INVALID_OUTBOX_INPUT');
    const values = [randomUUID(),input.tenantId,input.credentialId,input.operationKey,input.method,input.path,input.encryptedRequest,input.maxAttempts ?? 3];
    const added = await this.db.query(`INSERT INTO md_integration_outbox
      (id,tenant_id,credential_id,operation_key,method,request_path,encrypted_request,max_attempts)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (tenant_id,credential_id,operation_key) DO NOTHING RETURNING id`,values);
    const existing = added.rows[0] || (await this.db.query(`SELECT id FROM md_integration_outbox
      WHERE tenant_id=$1 AND credential_id=$2 AND operation_key=$3`,[input.tenantId,input.credentialId,input.operationKey])).rows[0];
    if (typeof existing?.id !== 'string') throw new Error('OUTBOX_INSERT_FAILED');
    return existing.id;
  }
  /** Claim is atomic across replica workers via SKIP LOCKED, including after a crash. */
  async claim(tenantId: string, workerId: string, limit = 20, leaseMs = 60_000): Promise<ClaimedDelivery[]> {
    if (!tenantId || !workerId || !bounded(limit,1,50) || !bounded(leaseMs,1000,300000))
      throw new Error('INVALID_OUTBOX_CLAIM');
    // A worker crashing on its final permitted attempt must not strand a lease forever.
    await this.db.query(`UPDATE md_integration_outbox SET status='dead',lease_owner=NULL,
      lease_until=NULL,encrypted_request='',error_code='LEASE_EXHAUSTED',updated_at=now()
      WHERE tenant_id=$1 AND status='leased' AND lease_until<now() AND attempts>=max_attempts`,[tenantId]);
    const result = await this.db.query(`WITH picked AS (
      SELECT id FROM md_integration_outbox WHERE tenant_id=$1 AND next_attempt_at<=now()
        AND (status='pending' OR (status='leased' AND lease_until<now()))
        AND attempts<max_attempts ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED
    ) UPDATE md_integration_outbox o SET status='leased',lease_owner=$3,
      lease_until=now()+($4::integer * interval '1 millisecond'), attempts=o.attempts+1, updated_at=now()
      FROM picked WHERE o.id=picked.id AND o.tenant_id=$1 RETURNING o.*`,[tenantId,limit,workerId,leaseMs]);
    return result.rows.map(row=>({ id:String(row.id),tenantId:String(row.tenant_id),credentialId:String(row.credential_id),
      operationKey:String(row.operation_key),method:String(row.method),path:String(row.request_path),
      encryptedRequest:String(row.encrypted_request),attempts:Number(row.attempts),maxAttempts:Number(row.max_attempts) }));
  }
  async complete(tenantId:string,workerId:string,id:string,statusCode:number): Promise<void> {
    if (!tenantId || !workerId || !id || !bounded(statusCode,200,399)) throw new Error('INVALID_OUTBOX_COMPLETION');
    const result=await this.db.query(`UPDATE md_integration_outbox SET status='succeeded',lease_owner=NULL,lease_until=NULL,
      encrypted_request='',response_status=$4,updated_at=now() WHERE id=$1 AND tenant_id=$2
      AND lease_owner=$3 AND status='leased' AND lease_until>now() RETURNING id`,[id,tenantId,workerId,statusCode]);
    if (!result.rows.length) throw new Error('OUTBOX_LEASE_LOST');
  }
  async fail(tenantId:string,workerId:string,id:string,errorCode:string,delayMs:number,permanent=false):Promise<void> {
    if (!tenantId || !workerId || !id || !/^[A-Z][A-Z0-9_]{1,63}$/.test(errorCode) ||
      !bounded(delayMs,0,3600000)) throw new Error('INVALID_OUTBOX_FAILURE');
    const result=await this.db.query(`UPDATE md_integration_outbox SET
      status=CASE WHEN attempts>=max_attempts OR $6::boolean THEN 'dead' ELSE 'pending' END,
      encrypted_request=CASE WHEN attempts>=max_attempts OR $6::boolean THEN '' ELSE encrypted_request END,
      lease_owner=NULL,lease_until=NULL,next_attempt_at=now()+($5::integer*interval '1 millisecond'),
      error_code=$4,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3
      AND status='leased' RETURNING id`,[id,tenantId,workerId,errorCode,delayMs,permanent]);
    if (!result.rows.length) throw new Error('OUTBOX_LEASE_LOST');
  }
}
