import { useState } from 'react';
import { Copy, Pencil, Search } from 'lucide-react';
import type { LightningAppMetadata } from './metadata';
import './AppManagerList.css';

type Props = {
  apps: LightningAppMetadata[];
  busy: boolean;
  onEdit: (app: LightningAppMetadata) => void;
  onClone: (app: LightningAppMetadata) => void;
};

export default function AppManagerList({apps, busy, onEdit, onClone}: Props) {
  const [search, setSearch] = useState('');
  const filtered = apps.filter(app =>
    (app.label + ' ' + app.apiName + ' ' + app.description)
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ).sort((a, b) => a.label.localeCompare(b.label));
  return <section className="app-manager-list surface" aria-label="Existing applications">
    <div className="app-manager-list-head">
      <div><h2>Existing Apps <span>{apps.length}</span></h2>
        <p>Select the pencil to edit an app or clone its configuration.</p>
      </div>
      <label className="app-manager-list-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" value={search} aria-label="Search apps"
          onChange={event => setSearch(event.target.value)} placeholder="Search apps…"/>
      </label>
    </div>
    <div className="app-manager-list-scroll">
      <table className="app-manager-list-table">
        <thead><tr>
          <th scope="col">App</th>
          <th scope="col">Developer Name</th>
          <th scope="col">Navigation Items</th>
          <th scope="col">App Pages</th>
          <th scope="col">Actions</th>
        </tr></thead>
        <tbody>{filtered.map(app => <tr key={app.apiName}>
          <td><div className="app-manager-list-name">
            <span className="app-manager-list-color" style={{backgroundColor:app.brandColor}} aria-hidden="true"/>
            <span><strong>{app.label}</strong>
              {app.description && <small>{app.description}</small>}
            </span>
          </div></td>
          <td><code>{app.apiName}</code></td>
          <td>{app.navigationItems.length}</td>
          <td>{app.navigationPageApiNames.length}</td>
          <td><div className="app-manager-list-actions">
            <button type="button" className="btn btn-small" disabled={busy}
              aria-label={'Edit ' + app.label} onClick={() => onEdit(app)} title={'Edit ' + app.label}>
              <Pencil size={14} aria-hidden="true"/> Edit
            </button>
            <button type="button" className="btn btn-small" disabled={busy}
              aria-label={'Clone ' + app.label} onClick={() => onClone(app)} title={'Clone ' + app.label}>
              <Copy size={14} aria-hidden="true"/> Clone
            </button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!filtered.length && <div className="app-manager-list-empty">
      {apps.length ? 'No apps match your search.' : 'No apps created yet. Select New App to get started.'}
    </div>}
  </section>;
}
