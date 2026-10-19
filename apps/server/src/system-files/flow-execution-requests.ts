import {createHash} from 'node:crypto';
import type {SqlPersistence} from './sql-persistence.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Claim={owner:true}|{owner:false;value:unknown};
type Row={input_hash:string;state:string;result_payload:unknown;run_id:string|null};

/** Durable request deduplication for any Flow called with a requestId.
 * It deliberately never interprets app-specific payment or commerce metadata.
 * A failed or in-flight request cannot be silently replayed. */
export class FlowExecutionRequests {
  constructor(private readonly db:SqlPersistence) {}
  static hash(input:Record<string,unknown>){
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }
  static key(input:Record<string,unknown>){
    if(!Object.hasOwn(input,'requestId'))return null;
    if(typeof input.requestId!=='string'||!uuid.test(input.requestId))
      throw new Error('Invalid Flow requestId: expected a UUID');
    return input.requestId;
  }
  async claim(tenant:string,actor:string,flow:string,requestId:string,input:Record<string,unknown>):Promise<Claim>{
    const hash=FlowExecutionRequests.hash(input);
    const inserted=await this.db.query(`INSERT INTO md_flow_execution_requests
      (tenant_id,actor_id,flow_api,request_id,input_hash)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(tenant_id,actor_id,flow_api,request_id) DO NOTHING RETURNING request_id`,
      [tenant,actor,flow,requestId,hash]);
    if(inserted.rowCount)return {owner:true};
    const {rows}=await this.db.query<Row>(`SELECT input_hash,state,result_payload,run_id
      FROM md_flow_execution_requests
      WHERE tenant_id=$1 AND actor_id=$2 AND flow_api=$3 AND request_id=$4`,
      [tenant,actor,flow,requestId]);
    const existing=rows[0];
    if(!existing)throw new Error('Flow request conflict');
    if(existing.input_hash!==hash)
      throw new Error('Flow requestId was reused with different inputs');
    if(existing.state==='failed')
      throw new Error('Previous Flow request failed; start a new request to retry');
    if(existing.state==='completed' && existing.result_payload &&
      typeof existing.result_payload==='object')return {owner:false,value:existing.result_payload};
    return {owner:false,value:{id:existing.run_id??'',status:'pending',completed:false}};
  }
  async started(tenant:string,actor:string,flow:string,key:string,runId:string){
    await this.db.query(`UPDATE md_flow_execution_requests SET run_id=$5,updated_at=now()
      WHERE tenant_id=$1 AND actor_id=$2 AND flow_api=$3 AND request_id=$4
        AND state='pending'`,[tenant,actor,flow,key,runId]);
  }
  async completed(tenant:string,actor:string,flow:string,key:string,result:unknown){
    const encoded=JSON.stringify(result);
    if(!encoded||encoded.length>262144)throw new Error('Flow result exceeds idempotency limit');
    await this.db.query(`UPDATE md_flow_execution_requests
      SET state='completed',result_payload=$5::jsonb,updated_at=now()
      WHERE tenant_id=$1 AND actor_id=$2 AND flow_api=$3 AND request_id=$4
        AND state='pending'`,[tenant,actor,flow,key,encoded]);
  }
  async failed(tenant:string,actor:string,flow:string,key:string){
    await this.db.query(`UPDATE md_flow_execution_requests
      SET state='failed',error_code='FLOW_EXECUTION_FAILED',updated_at=now()
      WHERE tenant_id=$1 AND actor_id=$2 AND flow_api=$3 AND request_id=$4
        AND state='pending'`,[tenant,actor,flow,key]);
  }
}
