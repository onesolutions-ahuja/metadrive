import { useMemo, useState } from 'react';
import type { LightningAppMetadata, LightningPageMetadata, ObjectMetadata } from './metadata';
import { browserRoutePath, listPageRoutes } from './routeDirectory';

export default function PageRouteDirectory({
  apps, pages, objects, initialAppId, basePath, onClose, onNotify
}: {
  apps: LightningAppMetadata[];
  pages: LightningPageMetadata[];
  objects: ObjectMetadata[];
  initialAppId: string;
  basePath: string;
  onClose: () => void;
  onNotify: (message: string) => void;
}) {
  const [appId, setAppId] = useState(initialAppId);
  const [query, setQuery] = useState('');
  const entries = useMemo(
    () => listPageRoutes(apps, objects, pages, appId), [apps, objects, pages, appId]
  );
  const visible = entries.filter(route =>
    (route.appLabel + ' ' + route.kind + ' ' + route.targetLabel + ' ' + route.targetApiName
      + ' ' + route.path).toLowerCase().includes(query.trim().toLowerCase())
  );
  async function copyRoute(path: string) {
    try {
      const relativePath = browserRoutePath(basePath, path);
      await navigator.clipboard.writeText(window.location.origin + relativePath);
      onNotify('Route copied');
    } catch {
      onNotify('Unable to copy route. Check clipboard permissions.');
    }
  }
  return <div className="modal-backdrop" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="page-route-directory-title"
      style={{ width: 'min(960px, 95vw)', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto' }}>
      <div className="modal-header">
        <h2 id="page-route-directory-title">Page routes</h2>
        <button type="button" className="btn btn-small" aria-label="Close page routes"
          onClick={onClose}>Close</button>
      </div>
      <p className="modal-copy">Routes are generated from saved applications, pages and objects.
        A live link still requires the user's permissions. Draft or missing destinations cannot be opened.</p>
      <div className="permission-form-grid">
        <label className="form-label">Application
          <select className="form-control" aria-label="Filter routes by application"
            value={appId} onChange={event => setAppId(event.target.value)}>
            <option value="">All applications</option>
            {apps.map(app => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
          </select>
        </label>
        <label className="form-label">Search routes
          <input className="form-control" type="search" value={query} placeholder="Page, object or URL"
            onChange={event => setQuery(event.target.value)} />
        </label>
      </div>
      <table className="records-table" style={{ width: '100%' }} aria-label="Page route directory">
        <thead><tr><th>Application</th><th>Destination</th><th>Status</th><th>Canonical route</th><th>Actions</th></tr></thead>
        <tbody>
          {visible.map(route => {
            const fullPath = browserRoutePath(basePath, route.path);
            return <tr key={route.key} data-route-key={route.key}>
              <td>{route.appLabel}</td>
              <td><strong>{route.targetLabel}</strong><div className="properties-help">{route.kind} · {route.targetApiName}</div></td>
              <td>{route.available ? 'Ready' : route.reason}</td>
              <td><code style={{ overflowWrap: 'anywhere' }}>{fullPath}</code></td>
              <td>
                {route.available
                  ? <>
                    <a className="btn btn-small" href={fullPath} target="_blank" rel="noopener noreferrer"
                      aria-label={'Open route ' + route.key}>Open</a>{' '}
                    <button className="btn btn-small" type="button"
                      aria-label={'Copy route ' + route.key}
                      onClick={() => void copyRoute(route.path)}>Copy</button>
                  </>
                  : <span className="properties-help">Not published</span>}
              </td>
            </tr>;
          })}
          {!visible.length && <tr><td colSpan={5}>No matching routes.</td></tr>}
        </tbody>
      </table>
    </section>
  </div>;
}
