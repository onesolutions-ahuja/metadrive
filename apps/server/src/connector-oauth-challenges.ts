import type { OAuthChallenge, OAuthChallengeStore, OAuthScope } from './connector-oauth.js';

export type OAuthSql = { query(sql:string, params?:unknown[]):Promise<{rows:Record<string,unknown>[]}> };
export type SealedChallenge = { keyId:string; iv:string; authTag:string; ciphertext:string };
export type ChallengeCipher = {
  seal(tenantId:string, digest:string, verifier:string):SealedChallenge;
  open(tenantId:string, digest:string, sealed:SealedChallenge):string;
};
/** PostgreSQL-backed single-use challenge registry for multi-instance OAuth callbacks. */
export class SqlOAuthChallengeStore implements OAuthChallengeStore {
  constructor(private readonly db: OAuthSql, private readonly cipher: ChallengeCipher) {}
  private assertDigest(stateDigest:string) {
    if(!/^[a-f0-9]{64}$/.test(stateDigest))throw new Error('INVALID_OAUTH_STATE');
  }
  async create(stateDigest:string, challenge:OAuthChallenge):Promise<void> {
    this.assertDigest(stateDigest);
    if (!challenge.scope.tenantId || !challenge.scope.credentialId ||
      !challenge.verifier || challenge.verifier.length>200 ||
      !challenge.redirectUri.startsWith('https://') ||
      !Number.isFinite(challenge.expiresAtMs)) throw new Error('INVALID_OAUTH_CHALLENGE');
    const sealed=this.cipher.seal(challenge.scope.tenantId,stateDigest,challenge.verifier);
    await this.db.query(`INSERT INTO md_integration_oauth_challenges
      (state_digest,tenant_id,credential_id,redirect_uri,key_id,iv,auth_tag,ciphertext,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::double precision / 1000))`,[
        stateDigest,challenge.scope.tenantId,challenge.scope.credentialId,challenge.redirectUri,
        sealed.keyId,sealed.iv,sealed.authTag,sealed.ciphertext,challenge.expiresAtMs
      ]);
  }
  async findScope(stateDigest:string):Promise<OAuthScope|null> {
    this.assertDigest(stateDigest);
    const found=await this.db.query(`SELECT tenant_id,credential_id FROM md_integration_oauth_challenges
      WHERE state_digest=$1 AND expires_at>now()`,[stateDigest]);
    const row=found.rows[0];
    return row ? { tenantId:String(row.tenant_id), credentialId:String(row.credential_id) } : null;
  }
  async consume(stateDigest:string):Promise<OAuthChallenge|null> {
    this.assertDigest(stateDigest);
    const found=await this.db.query(`DELETE FROM md_integration_oauth_challenges
      WHERE state_digest=$1 AND expires_at>now()
      RETURNING tenant_id,credential_id,redirect_uri,key_id,iv,auth_tag,ciphertext,
        (extract(epoch FROM expires_at)*1000)::bigint AS expires_at_ms`,[stateDigest]);
    const row=found.rows[0];
    if(!row)return null;
    const tenantId=String(row.tenant_id);
    const verifier=this.cipher.open(tenantId,stateDigest,{
      keyId:String(row.key_id),iv:String(row.iv),authTag:String(row.auth_tag),ciphertext:String(row.ciphertext)
    });
    if(!verifier)throw new Error('INVALID_OAUTH_CHALLENGE');
    return {scope:{tenantId,credentialId:String(row.credential_id)},verifier,
      redirectUri:String(row.redirect_uri),expiresAtMs:Number(row.expires_at_ms)};
  }
  async cleanup():Promise<void> {
    await this.db.query('DELETE FROM md_integration_oauth_challenges WHERE expires_at<=now()');
  }
}
