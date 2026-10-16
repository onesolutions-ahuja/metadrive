import type { validateRouteAliasInput } from "../../route-aliases.mjs";
import type { Request, Response } from "express";
import type { AppsRouteAliasRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerAppsRouteAliasRoutes(deps: AppsRouteAliasRoutesDependencies): void {
  deps.app.get('/api/metadata/route-aliases', deps.requirePermission('metadata:read'), async (_req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const pool = deps.getRouteAliasPool();
    if (!pool) return deps.aliasDatabaseUnavailable(res);
    try {
      const entries = await pool.query(
        'SELECT app_api_name,slug,target_kind,target_api_name,status,version,updated_at ' +
        'FROM md_route_aliases WHERE tenant_id=$1 ORDER BY app_api_name,slug LIMIT 1001',
        [principal.tenantId]
      );
      const aliases = entries.rows.map(deps.rowToRouteAlias).filter((item) => deps.canOpenApp(principal,tenant,item.appId));
      return res.json({ aliases: aliases.slice(0,1000), truncated: entries.rows.length > 1000 });
    } catch {
      return deps.aliasDatabaseUnavailable(res);
    }
  });
  deps.app.put('/api/metadata/route-aliases/:appId/:slug',
    deps.requireAnyPermission('metadata:write','pages:manage'), async (req: Request,res: Response) => {
    let alias: ReturnType<typeof validateRouteAliasInput>;
    try { alias = deps.validateRouteAliasInput(req.body); }
    catch { return res.status(400).json({error:'Invalid route alias metadata'}); }
    if (alias.appId !== deps.routeParam(req,'appId') || alias.slug !== deps.routeParam(req,'slug'))
      return res.status(400).json({error:'Route alias identity cannot be changed'});
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    if (!deps.routeAliasDestination({...alias,status:'Active',version:1}, deps.aliasContext(principal,tenant)))
      return res.status(400).json({error:'Select an existing, active, permitted destination in this application'});
    const pool = deps.getRouteAliasPool();
    if (!pool) return deps.aliasDatabaseUnavailable(res);
    let client: Awaited<ReturnType<typeof pool.connect>> | null = null;
    let begun = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      begun = true;
      const prior = await client.query(
        'SELECT version FROM md_route_aliases WHERE tenant_id=$1 AND app_api_name=$2 AND slug=$3 FOR UPDATE',
        [principal.tenantId,alias.appId,alias.slug]
      );
      const previousVersion = prior.rows.length ? Number(prior.rows[0].version) : 0;
      if (previousVersion !== alias.expectedVersion) {
        await client.query('ROLLBACK'); begun = false;
        return res.status(409).json({error:'Route alias changed. Reload before saving.'});
      }
      const version = previousVersion+1;
      if (previousVersion === 0) {
        await client.query(
          'INSERT INTO md_route_aliases (tenant_id,app_api_name,slug,target_kind,target_api_name,status,version) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [principal.tenantId,alias.appId,alias.slug,alias.kind,alias.targetApiName,alias.status,version]
        );
      } else {
        await client.query(
          'UPDATE md_route_aliases SET target_kind=$4,target_api_name=$5,status=$6,version=$7,updated_at=now() ' +
          'WHERE tenant_id=$1 AND app_api_name=$2 AND slug=$3',
          [principal.tenantId,alias.appId,alias.slug,alias.kind,alias.targetApiName,alias.status,version]
        );
      }
      await client.query(
        'INSERT INTO md_route_alias_revisions ' +
        '(tenant_id,app_api_name,slug,version,target_kind,target_api_name,status,changed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [principal.tenantId,alias.appId,alias.slug,version,alias.kind,alias.targetApiName,alias.status,principal.userId]
      );
      await client.query('COMMIT'); begun=false;
      return res.json({alias:{appId:alias.appId,slug:alias.slug,kind:alias.kind,
        targetApiName:alias.targetApiName,status:alias.status,version}});
    } catch (error) {
      if (begun && client) await client.query('ROLLBACK').catch(()=>undefined);
      if ((error as {code?:string}).code === '23505')
        return res.status(409).json({error:'Route alias already exists. Reload before saving.'});
      return deps.aliasDatabaseUnavailable(res);
    } finally { client?.release(); }
  });
  deps.app.delete('/api/metadata/route-aliases/:appId/:slug',
    deps.requireAnyPermission('metadata:write','pages:manage'), async (req: Request,res: Response) => {
    const appId=deps.routeParam(req,'appId'), slug=deps.routeParam(req,'slug');
    const expectedVersion=req.body?.expectedVersion;
    if (!deps.validRouteIdentifier(appId) || !deps.validAliasSlug(slug)
        || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
      return res.status(400).json({error:'Invalid route alias identity/version'});
    const principal=deps.getPrincipal(res), tenant=deps.tenantData(principal.tenantId)!;
    if (!tenant.apps.some((item)=>item.apiName===appId) || !deps.canOpenApp(principal,tenant,appId))
      return res.status(404).json({error:'Route alias not found'});
    const pool=deps.getRouteAliasPool();
    if (!pool) return deps.aliasDatabaseUnavailable(res);
    let client: Awaited<ReturnType<typeof pool.connect>> | null=null, begun=false;
    try {
      client=await pool.connect(); await client.query('BEGIN'); begun=true;
      const prior=await client.query(
        'SELECT version,target_kind,target_api_name FROM md_route_aliases ' +
        'WHERE tenant_id=$1 AND app_api_name=$2 AND slug=$3 FOR UPDATE',
        [principal.tenantId,appId,slug]
      );
      if (!prior.rows.length) {await client.query('ROLLBACK');begun=false;return res.status(404).json({error:'Route alias not found'});}
      if (Number(prior.rows[0].version)!==expectedVersion) {
        await client.query('ROLLBACK');begun=false;
        return res.status(409).json({error:'Route alias changed. Reload before disabling.'});
      }
      const version=expectedVersion+1;
      await client.query('UPDATE md_route_aliases SET status=$4,version=$5,updated_at=now() ' +
        'WHERE tenant_id=$1 AND app_api_name=$2 AND slug=$3',
        [principal.tenantId,appId,slug,'Disabled',version]);
      await client.query('INSERT INTO md_route_alias_revisions ' +
        '(tenant_id,app_api_name,slug,version,target_kind,target_api_name,status,changed_by) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [principal.tenantId,appId,slug,version,prior.rows[0].target_kind,prior.rows[0].target_api_name,'Disabled',principal.userId]);
      await client.query('COMMIT');begun=false;
      return res.json({status:'Disabled',version});
    } catch {
      if (begun&&client) await client.query('ROLLBACK').catch(()=>undefined);
      return deps.aliasDatabaseUnavailable(res);
    } finally { client?.release(); }
  });
  // End users need no metadata edit permission to follow an alias, but access
  // to the target still goes through current tenant/app/tab/page metadata checks.
  deps.app.get('/api/routes/resolve/:appId/:slug', deps.accessAuthentication, async (req: Request,res: Response) => {
    const appId=deps.routeParam(req,'appId'), slug=deps.routeParam(req,'slug');
    if (!deps.validRouteIdentifier(appId) || !deps.validAliasSlug(slug))
      return res.status(404).json({error:'Route alias not found'});
    const principal=deps.getPrincipal(res),tenant=deps.tenantData(principal.tenantId);
    if (!tenant || !deps.canOpenApp(principal,tenant,appId))
      return res.status(404).json({error:'Route alias not found'});
    const pool=deps.getRouteAliasPool();
    if (!pool) return deps.aliasDatabaseUnavailable(res);
    try {
      const records=await pool.query(
        'SELECT app_api_name,slug,target_kind,target_api_name,status,version,updated_at FROM md_route_aliases ' +
        'WHERE tenant_id=$1 AND app_api_name=$2 AND slug=$3 AND status=$4',
        [principal.tenantId,appId,slug,'Active']
      );
      if (!records.rows.length) return res.status(404).json({error:'Route alias not found'});
      const destination=deps.routeAliasDestination(deps.rowToRouteAlias(records.rows[0]),deps.aliasContext(principal,tenant));
      if (!destination) return res.status(404).json({error:'Route alias destination is not available'});
      return res.json({path:destination});
    } catch {
      return deps.aliasDatabaseUnavailable(res);
    }
  });
}
