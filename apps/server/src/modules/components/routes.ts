import { scopeLibraryCss } from './component-source.js';
import { compileLibraryComponent } from './component-compiler.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { libraryRevision, nextLibraryRevision, libraryHistory } from '../metadata/component-revisions.mjs';
import { registerMetadataPublicationRoute } from '../metadata/offline-publication-route.mjs';
import { libraryComponentVisible, libraryComponentEditable } from '../../component-scope.mjs';
import type { LibraryComponent, LibraryComponentRevision, PlatformState } from '../../index.js';

// Type-only dependency contract preserves the exact server security and persistence signatures.
type Runtime = typeof import('../../index.js');
type Dependencies = Pick<Runtime, 'app' | 'libraryComponentInputSchema' | 'persistState' | 'tenantData' | 'getPrincipal' | 'requirePermission' | 'canOpenApp' | 'canOpenTab' | 'routeParam' | 'findLibraryComponentUsages' | 'ownedComponentIndex' | 'componentNameTaken' | 'usageBlockerDetails' | 'syncBundledLibraryComponents'> & {
  getState: () => PlatformState;
  setState: (next: PlatformState) => void;
};

export function registerComponentLibraryRoutes(deps: Dependencies): void {
  const { app, libraryComponentInputSchema, persistState, tenantData, getPrincipal, requirePermission, canOpenApp, canOpenTab, routeParam, findLibraryComponentUsages, ownedComponentIndex, componentNameTaken, usageBlockerDetails, syncBundledLibraryComponents, getState, setState } = deps;
registerMetadataPublicationRoute(app,requirePermission('metadata:read'),{
 sync:syncBundledLibraryComponents,principal:getPrincipal,tenant:tenantData,
 canOpenApp,canOpenTab,visible:libraryComponentVisible,state:()=>getState()
});
app.get('/api/component-library', requirePermission('metadata:read'), async (_req: Request, res: Response) => {
  try {
    await syncBundledLibraryComponents();
  } catch (error) {
    console.error('Unable to register bundled custom components', error);
    return res.status(500).json({ error: `Unable to register bundled custom components: ${error instanceof Error ? error.message : String(error)}` });
  }
  const principal = getPrincipal(res);
  res.json({
    components: getState().libraryComponents.filter((component) =>
      libraryComponentVisible(component, principal.tenantId, Object.keys(getState().tenants))),
    canManage: principal.permissions.includes('components:manage')
  });
});
app.post('/api/component-library', requirePermission('components:manage'), async (req: Request, res: Response) => {
  // Reserve bundled component names before any tenant can register an override.
  // Never allow a private, user-authored component to shadow a trusted primitive.
  try { await syncBundledLibraryComponents(); }
  catch (error) {
    console.error('Bundled component registration failed', error);
    return res.status(503).json({ error: 'Component registry unavailable' });
  }
  const parsed = libraryComponentInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid custom component metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  if (componentNameTaken(parsed.data.apiName, principal.tenantId)) {
    return res.status(409).json({ error: `A library component named "${parsed.data.apiName}" already exists` });
  }
  try {
    const compiled = await compileLibraryComponent(parsed.data.jsxSource, parsed.data.apiName);
    if ('error' in compiled) return res.status(400).json({ error: compiled.error });
    const scopedCss = scopeLibraryCss(parsed.data.cssSource, parsed.data.apiName);
    const component: LibraryComponent = {
      ...parsed.data,
      tenantId: principal.tenantId,
      compiledJs: compiled.code,
      scopedCss,
      version: 1,
      updatedAt: new Date().toISOString(),
      status: parsed.data.publicationStatus,
      publishedVersion: parsed.data.publicationStatus === 'Published' ? 1 : 0,
      revisions: [], trustedBundled: false
    };
    // JSX compilation yields; another request can register the name meanwhile.
    if (componentNameTaken(parsed.data.apiName, principal.tenantId))
      return res.status(409).json({ error: 'Component API name was registered concurrently' });
    const nextState = { ...getState(), libraryComponents: [...getState().libraryComponents, component] };
    persistState(nextState);
    setState(nextState);
    return res.status(201).json({ component });
  } catch (error) {
    return res.status(400).json({ error: `Unable to compile component: ${error instanceof Error ? error.message : String(error)}` });
  }
});
app.put('/api/component-library/:apiName', requirePermission('components:manage'), async (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const parsed = libraryComponentInputSchema.safeParse({ ...req.body, apiName });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid custom component metadata', details: parsed.error.flatten() });
  const principal = getPrincipal(res);
  const existingIndex = ownedComponentIndex(apiName, principal.tenantId);
  if (existingIndex < 0) return res.status(404).json({ error: 'Library component was not found' });
  const existing = getState().libraryComponents[existingIndex];
  if (!libraryComponentEditable(existing, principal.tenantId, Object.keys(getState().tenants)))
    return res.status(404).json({ error: 'Library component was not found' });
  const usages = findLibraryComponentUsages(getState(), apiName, principal.tenantId);
  const unavailableSurfaces = existing.surfaces.filter((surface) =>
    surface !== 'platform' && !parsed.data.surfaces.includes(surface) && usages.some((usage) => usage.surface === surface));
  if (unavailableSurfaces.length) {
    const blockers = usageBlockerDetails(usages.filter((usage) => unavailableSurfaces.includes(usage.surface)), principal.tenantId);
    return res.status(409).json({
      error: `Cannot remove ${unavailableSurfaces.join(', ')} surface${unavailableSurfaces.length === 1 ? '' : 's'} while components are in use: ${blockers.join('; ')}`,
      dependencies: blockers
    });
  }
  try {
    const compiled = await compileLibraryComponent(parsed.data.jsxSource, apiName);
    if ('error' in compiled) return res.status(400).json({ error: compiled.error });
    const compiledRevision: LibraryComponentRevision = {
      version: nextLibraryRevision(existing), label: parsed.data.label, description: parsed.data.description,
      surfaces: parsed.data.surfaces, resize: parsed.data.resize, propertyDefinitions: parsed.data.propertyDefinitions ?? existing.propertyDefinitions,
      jsxSource: parsed.data.jsxSource, cssSource: parsed.data.cssSource,
      compiledJs: compiled.code, scopedCss: scopeLibraryCss(parsed.data.cssSource, apiName),
      updatedAt: new Date().toISOString()
    };
    const component: LibraryComponent = parsed.data.publicationStatus === 'Draft'
      ? { ...existing, pendingDraft: compiledRevision }
      : { ...existing, ...compiledRevision, propertyDefinitions: parsed.data.propertyDefinitions ?? existing.propertyDefinitions, status: 'Published', trustedBundled: false,
        publishedVersion: compiledRevision.version,
        revisions: [...(existing.revisions ?? []), ...(existing.status === 'Draft' ? [] : [libraryRevision(existing)])].slice(-100),
        pendingDraft: undefined };
    component.tenantId = principal.tenantId;
    // Reject stale writes after an asynchronous compiler pass.
    if (getState().libraryComponents[existingIndex] !== existing)
      return res.status(409).json({ error: 'Component changed while compiling; reload and retry' });
    const libraryComponents = [...getState().libraryComponents];
    libraryComponents[existingIndex] = component;
    const nextState = { ...getState(), libraryComponents };
    persistState(nextState);
    setState(nextState);
    return res.json({ component });
  } catch (error) {
    return res.status(400).json({ error: `Unable to compile component: ${error instanceof Error ? error.message : String(error)}` });
  }
});
app.get('/api/component-library/:apiName/history', requirePermission('components:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const component=getState().libraryComponents[ownedComponentIndex(routeParam(req,'apiName'), principal.tenantId)];
  if (!component || !libraryComponentVisible(component, principal.tenantId, Object.keys(getState().tenants)))
    return res.status(404).json({error:'Library component was not found'});
  return res.json({apiName:component.apiName,history:libraryHistory(component)});
});
app.post('/api/component-library/:apiName/publish', requirePermission('components:manage'), (req: Request, res: Response) => {
  const apiName=routeParam(req,'apiName'),index=ownedComponentIndex(apiName,getPrincipal(res).tenantId);
  if(index<0)return res.status(404).json({error:'Library component was not found'});
  const existing=getState().libraryComponents[index],draft=existing.pendingDraft;
  const principal=getPrincipal(res);
  if (!libraryComponentEditable(existing,principal.tenantId,Object.keys(getState().tenants)))
    return res.status(404).json({error:'Library component was not found'});
  if(!draft && existing.status!=='Draft')return res.status(409).json({error:'There is no draft to publish'});
  const next:LibraryComponent=draft
    ? {...existing,...draft,status:'Published',publishedVersion:draft.version,trustedBundled:false,
      revisions:[...(existing.revisions??[]),...(existing.status==='Draft'?[]:[libraryRevision(existing)])].slice(-100),pendingDraft:undefined}
    : {...existing,status:'Published',publishedVersion:existing.version};
  next.tenantId = principal.tenantId;
  const libraryComponents=[...getState().libraryComponents];libraryComponents[index]=next;
  const nextState={...getState(),libraryComponents};persistState(nextState);setState(nextState);
  return res.json({component:next});
});
app.post('/api/component-library/:apiName/rollback', requirePermission('components:manage'), (req: Request, res: Response) => {
  const apiName=routeParam(req,'apiName'),index=ownedComponentIndex(apiName,getPrincipal(res).tenantId);
  if(index<0)return res.status(404).json({error:'Library component was not found'});
  const parsed=z.object({version:z.number().int().positive()}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Select a published historical version'});
  const existing=getState().libraryComponents[index];
  const principal=getPrincipal(res);
  if (!libraryComponentEditable(existing,principal.tenantId,Object.keys(getState().tenants)))
    return res.status(404).json({error:'Library component was not found'});
  const previous=(existing.revisions??[]).find((item)=>item.version===parsed.data.version);
  if(!previous)return res.status(404).json({error:'Published revision not found'});
  const usages=findLibraryComponentUsages(getState(),apiName,principal.tenantId);
  const removed=existing.surfaces.filter((surface)=>!previous.surfaces.includes(surface)&&usages.some((usage)=>usage.surface===surface));
  if(removed.length)return res.status(409).json({error:'Rollback would remove surfaces still in use',dependencies:usageBlockerDetails(usages.filter((u)=>removed.includes(u.surface)),getPrincipal(res).tenantId)});
  const nextVersion=nextLibraryRevision(existing);
  const next:LibraryComponent={...existing,...previous,version:nextVersion,updatedAt:new Date().toISOString(),status:'Published',trustedBundled:false,
    publishedVersion:nextVersion,pendingDraft:undefined,revisions:[...(existing.revisions??[]),libraryRevision(existing)].slice(-100)};
  next.tenantId=principal.tenantId;
  const libraryComponents=[...getState().libraryComponents];libraryComponents[index]=next;
  const nextState={...getState(),libraryComponents};persistState(nextState);setState(nextState);
  return res.json({component:next,restoredFrom:parsed.data.version});
});
app.delete('/api/component-library/:apiName', requirePermission('components:manage'), (req: Request, res: Response) => {
  const apiName = routeParam(req, 'apiName');
  const principal = getPrincipal(res);
  const componentIndex=ownedComponentIndex(apiName, principal.tenantId);
  const component=getState().libraryComponents[componentIndex];
  if (!libraryComponentEditable(component,principal.tenantId,Object.keys(getState().tenants)))
    return res.status(404).json({ error: 'Library component was not found' });
  const usages = findLibraryComponentUsages(getState(), apiName, principal.tenantId);
  if (usages.length) {
    const dependencies = usageBlockerDetails(usages, principal.tenantId);
    return res.status(409).json({
      error: `This component is still used by ${dependencies.join('; ')}. Remove those references before deleting it.`,
      dependencies
    });
  }
  const nextState = { ...getState(), libraryComponents: getState().libraryComponents.filter((_, index) => index !== componentIndex) };
  persistState(nextState);
  setState(nextState);
  return res.status(204).end();
});
}
