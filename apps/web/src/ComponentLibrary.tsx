import { useState } from 'react';
import { Check, Code2, Grid2X2, Pencil, Plus, Puzzle, Save, Trash2, X } from 'lucide-react';
import type { LibraryComponentMetadata } from './metadata';
import { standardDashboardComponents, standardPageComponents } from './componentCatalog';

type ComponentInput = Pick<LibraryComponentMetadata, 'apiName' | 'label' | 'description' | 'surfaces' | 'resize' | 'jsxSource' | 'cssSource'> & {publicationStatus: 'Draft' | 'Published'};

export default function ComponentLibrary({
  components, canManage, onSave, onDelete, onPublish, onRollback
}: {
  components: LibraryComponentMetadata[];
  canManage: boolean;
  onSave: (component: ComponentInput, updating: boolean) => Promise<void>;
  onDelete: (apiName: string) => Promise<void>;
  onPublish: (apiName: string) => Promise<void>;
  onRollback: (apiName: string, version: number) => Promise<void>;
}) {
  const [editingApiName, setEditingApiName] = useState('');
  const [apiName, setApiName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [surfaces, setSurfaces] = useState<Array<'page' | 'dashboard' | 'flow'>>(['page', 'dashboard']);
  const [resize, setResize] = useState<NonNullable<LibraryComponentMetadata['resize']>>({
    defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60
  });
  const [jsxSource, setJsxSource] = useState('');
  const [cssSource, setCssSource] = useState('');
  const [jsxFileName, setJsxFileName] = useState('');
  const [cssFileName, setCssFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [publicationStatus, setPublicationStatus] = useState<'Draft' | 'Published'>('Draft');
  const [restoreVersion, setRestoreVersion] = useState(0);

  const reset = () => {
    setEditingApiName('');
    setApiName('');
    setLabel('');
    setDescription('');
    setSurfaces(['page', 'dashboard']);
    setResize({ defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 });
    setJsxSource('');
    setCssSource('');
    setJsxFileName('');
    setCssFileName('');
    setError('');
    setPublicationStatus('Draft');
    setRestoreVersion(0);
  };

  const edit = (component: LibraryComponentMetadata) => {
    setEditingApiName(component.apiName);
    setApiName(component.apiName);
    const draft = component.pendingDraft;
    setLabel(draft?.label ?? component.label);
    setDescription(draft?.description ?? component.description);
    setSurfaces(draft?.surfaces ?? component.surfaces);
    setResize(draft?.resize ?? component.resize ?? { defaultWidth: 320, defaultHeight: 180, minWidth: 120, minHeight: 60 });
    setJsxSource(draft?.jsxSource ?? component.jsxSource);
    setCssSource(draft?.cssSource ?? component.cssSource);
    setJsxFileName(`${component.apiName}.jsx`);
    setCssFileName(component.cssSource ? `${component.apiName}.css` : '');
    setError('');
  };

  const register = async () => {
    setError('');
    setBusy(true);
    try {
      await onSave({
        apiName,
        label: label.trim(),
        description: description.trim(),
        surfaces,
        resize,
        jsxSource,
        cssSource,
        publicationStatus
      }, Boolean(editingApiName));
      reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to register component');
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async (file: File, kind: 'jsx' | 'css') => {
    const limit = kind === 'jsx' ? 200_000 : 100_000;
    if (file.size > limit) {
      setError(`${kind.toUpperCase()} file must be ${limit / 1000} KB or smaller`);
      return;
    }
    setError('');
    try {
      const source = await file.text();
      if (kind === 'jsx') {
        setJsxSource(source);
        setJsxFileName(file.name);
      } else {
        setCssSource(source);
        setCssFileName(file.name);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : `Unable to read ${kind.toUpperCase()} file`);
    }
  };

  const chooseFiles = async (files: FileList | null) => {
    const inputs = Array.from(files ?? []);
    if (!inputs.length) return;

    const componentFiles = inputs.filter((file) => /\.(jsx|tsx|js|ts)$/i.test(file.name));
    const cssFiles = inputs.filter((file) => /\.css$/i.test(file.name));

    if (componentFiles.length !== 1 || cssFiles.length > 1) {
      setError('Select exactly one component source file (.jsx, .tsx, .js, or .ts) and no more than one .css stylesheet.');
      return;
    }
    const sourceFile = componentFiles[0];
    const cssFile = cssFiles[0];
    if (!sourceFile) {
      setError('A component source file is required. Select one .jsx, .tsx, .js, or .ts file.');
      return;
    }

    if (!editingApiName && !label.trim()) {
      const baseName = sourceFile
        ? sourceFile.name.replace(/\.[^.]+$/, '').replace(/[-_\s]+/g, ' ')
        : cssFile.name.replace(/\.[^.]+$/, '').replace(/[-_\s]+/g, ' ');
      const nextLabel = baseName.trim();
      if (nextLabel) {
        setLabel(nextLabel);
        setApiName(nextLabel.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').replace(/^[^A-Za-z]+/, ''));
      }
    }

    if (sourceFile) await chooseFile(sourceFile, 'jsx');
    if (cssFile) await chooseFile(cssFile, 'css');
  };

  const remove = async (component: LibraryComponentMetadata) => {
    if (!window.confirm(`Remove ${component.label} from the shared registry? Existing page, dashboard and Flow placements in any tenant may stop rendering. This cannot be undone here.`)) return;
    setError('');
    try {
      await onDelete(component.apiName);
      if (editingApiName === component.apiName) reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to remove component');
    }
  };

  const toggleSurface = (surface: 'page' | 'dashboard' | 'flow', checked: boolean) => {
    setSurfaces((current) => checked
      ? current.includes(surface) ? current : [...current, surface]
      : current.filter((item) => item !== surface));
  };

  const matchesSearch = (component: { apiName: string; label: string; description: string }) =>
    [component.apiName, component.label, component.description].join(' ').toLowerCase().includes(catalogSearch.trim().toLowerCase());
  const visibleStandardPages = standardPageComponents.filter(matchesSearch);
  const visibleDashboardWidgets = standardDashboardComponents.filter(matchesSearch);
  const visibleCustomComponents = components.filter(matchesSearch);
  const shownCount = visibleStandardPages.length + visibleDashboardWidgets.length + visibleCustomComponents.length;

  return <div className="component-library-page">
    <div className="page-heading">
      <div><div className="eyebrow">Setup / Platform Tools</div><h1>Global Component Library</h1><p>Browse built-in builder components and register reusable JSX and CSS components for Lightning pages, dashboards, and Flow screens.</p></div>
      {canManage && <button className="btn btn-brand" onClick={reset}><Plus size={14} />Register component</button>}
    </div>
    {!canManage && <div className="info-callout component-library-notice">You can use shared components in builders. A user with the <strong>Manage global components</strong> permission is required to register, update, or remove library entries.</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="component-library-layout">
      <section className="surface component-library-list">
        <div className="list-view-header"><div><div className="list-view-label">Shared catalog</div><h2>All components</h2><span>{standardPageComponents.length + standardDashboardComponents.length + components.length} components · {standardPageComponents.length + standardDashboardComponents.length} standard · {components.length} custom</span></div></div>
        <label className="form-label" htmlFor="component-library-search">Search components
          <input id="component-library-search" className="form-control" type="search" value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search label, API name or description" />
        </label>
        <p className="properties-help">Showing {shownCount} of {standardPageComponents.length + standardDashboardComponents.length + components.length} components</p>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Standard components</h3><span>Built in · Lightning pages</span></div>
          {visibleStandardPages.map((component) => <article className="library-component-card" key={component.apiName}>
            <span className="component-option-icon"><Grid2X2 size={16} /></span>
            <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>Standard · Lightning pages</small><p>{component.description}</p></div>
          </article>)}
        </div>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Standard dashboard widgets</h3><span>Built in · Dashboards</span></div>
          {visibleDashboardWidgets.map((component) => <article className="library-component-card" key={component.apiName}>
            <span className="component-option-icon"><Grid2X2 size={16} /></span>
            <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>Standard · Dashboards</small><p>{component.description}</p></div>
          </article>)}
        </div>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Custom components</h3><span>Registered in this shared library</span></div>
        {visibleCustomComponents.map((component) => <article className={`library-component-card ${editingApiName === component.apiName ? 'selected' : ''}`} key={component.apiName}>
          <span className="component-option-icon"><Puzzle size={16} /></span>
          <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>{component.surfaces.map((surface) => surface === 'page' ? 'Lightning pages' : surface === 'dashboard' ? 'Dashboards' : 'Flow screens').join(' · ')} · v{component.version} · {component.status ?? 'Published'}{component.pendingDraft ? ` · Draft v${component.pendingDraft.version} ready` : ''}</small>{component.description && <p>{component.description}</p>}</div>
          {canManage && <div className="library-component-actions"><button className="btn btn-small" onClick={() => edit(component)}><Pencil size={12} />Edit</button>{(component.status === 'Draft' || component.pendingDraft) && <button className="btn btn-small" disabled={busy} onClick={() => { setBusy(true); void onPublish(component.apiName).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Publish failed')).finally(() => setBusy(false)); }}><Check size={12}/>Publish</button>}<button className="icon-button subtle" aria-label={`Delete ${component.label}`} title="Delete component" onClick={() => void remove(component)}><Trash2 size={14} /></button></div>}
        </article>)}
        {!components.length && <div className="component-library-empty"><Puzzle size={25} /><strong>No custom components registered</strong><span>Standard components are listed above. Register a JSX component to share your own in the builders.</span></div>}
        </div>
      </section>
      {canManage && <section className="surface component-registration-panel">
        <div className="properties-header"><div><div className="list-view-label">{editingApiName ? 'New version' : 'Global catalog'}</div><h2>{editingApiName ? `Update ${label || editingApiName}` : 'Register a component'}</h2></div>{editingApiName && <button className="icon-button subtle" aria-label="Cancel editing" onClick={reset}><X size={15} /></button>}</div>
        <p className="properties-help">Select a self-contained React JSX/TSX component and an optional CSS file. Saving a new version updates every tenant that uses this component.</p>
        <label className="form-label" htmlFor="library-component-label">Label</label>
        <input id="library-component-label" className="form-control" value={label} onChange={(event) => {
          const value = event.target.value;
          setLabel(value);
          if (!editingApiName) setApiName(value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').replace(/^[^A-Za-z]+/, ''));
        }} placeholder="Calendar" />
        <label className="form-label" htmlFor="library-component-api">API Name</label>
        <input id="library-component-api" className="form-control" value={apiName} readOnly={Boolean(editingApiName)} onChange={(event) => setApiName(event.target.value.replace(/[^A-Za-z0-9_]/g, '_'))} placeholder="Calendar" />
        <label className="form-label" htmlFor="library-component-description">Description</label>
        <textarea id="library-component-description" className="form-control" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this component for?" />
        <div className="properties-section-title">Release lifecycle</div>
        <label className="form-label">Save as<select className="form-control" value={publicationStatus} onChange={(event) => setPublicationStatus(event.target.value as 'Draft' | 'Published')}><option value="Draft">Draft — do not change published output</option><option value="Published">Publish immediately</option></select></label>
        {editingApiName && <div className="metadata-component-properties"><div className="properties-section-title">Version history and rollback</div><p className="properties-help">Rollback creates a new published version, preserving the full audit trail.</p><select className="form-control" aria-label="Choose published revision" value={restoreVersion} onChange={(event) => setRestoreVersion(Number(event.target.value))}><option value={0}>Select historical revision…</option>{(components.find((item) => item.apiName === editingApiName)?.revisions ?? []).map((revision) => <option key={revision.version} value={revision.version}>Version {revision.version} · {new Date(revision.updatedAt).toLocaleString()}</option>)}</select><button type="button" className="btn btn-small" disabled={busy || !restoreVersion} onClick={() => { if (!window.confirm('Restore this historical version as a new published version?')) return; setBusy(true); void onRollback(editingApiName, restoreVersion).then(reset).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Rollback failed')).finally(() => setBusy(false)); }}>Rollback selected version</button></div>}
        <div className="properties-section-title">Available in</div>
        <label className="checkbox-row property-check"><input type="checkbox" checked={surfaces.includes('page')} onChange={(event) => toggleSurface('page', event.target.checked)} />Lightning page builder</label>
        <label className="checkbox-row property-check"><input type="checkbox" checked={surfaces.includes('dashboard')} onChange={(event) => toggleSurface('dashboard', event.target.checked)} />Dashboard builder</label>
        <label className="checkbox-row property-check"><input type="checkbox" checked={surfaces.includes('flow')} onChange={(event) => toggleSurface('flow', event.target.checked)} />Flow Builder screens</label>
        <div className="properties-section-title">Resizable canvas defaults (pixels)</div>
        {([
          ['defaultWidth', 'Default width'],
          ['defaultHeight', 'Default height'],
          ['minWidth', 'Minimum width'],
          ['minHeight', 'Minimum height']
        ] as const).map(([key, fieldLabel]) => <label className="form-label" key={key}>{fieldLabel}
          <input className="form-control" type="number" min={1} max={2000} value={resize[key]}
            onChange={(event) => setResize((current) => ({ ...current, [key]: Number(event.target.value) }))} />
        </label>)}
        <div className="properties-section-title">Component source</div>
        <label className="form-label" htmlFor="library-jsx-file">Component source and optional stylesheet</label>
        <input id="library-jsx-file" className="form-control library-file-input" type="file" accept=".jsx,.tsx,.js,.ts,.css" multiple onChange={(event) => {
          void chooseFiles(event.target.files);
          event.target.value = '';
        }} />
        <div className="properties-help">Select exactly one self-contained JSX/TSX/JS/TS component and optionally one CSS file in the same selection.</div>
        {jsxFileName && <div className="library-file-name"><Code2 size={12} />{jsxFileName} · {jsxSource.length.toLocaleString()} characters</div>}
        <label className="form-label" htmlFor="library-css-file">CSS file (optional)</label>
        <input id="library-css-file" className="form-control library-file-input" type="file" accept=".css,text/css" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void chooseFile(file, 'css');
          event.target.value = '';
        }} />
        {cssFileName && <div className="library-file-name"><Code2 size={12} />{cssFileName} · {cssSource.length.toLocaleString()} characters</div>}
        <div className="component-trust-note">Registered code is shared platform code and runs in the signed-in user’s workspace. Assign global component management only to trusted administrators. Components cannot import external modules; CSS selectors are scoped to the component.</div>
        <button className="btn btn-brand btn-full" disabled={busy || !apiName || !label.trim() || !jsxSource || !surfaces.length} onClick={() => void register()}>
          {busy ? 'Compiling and saving…' : editingApiName ? <><Save size={14} />{publicationStatus === 'Draft' ? 'Save draft revision' : 'Publish new version'}</> : <><Check size={14} />{publicationStatus === 'Draft' ? 'Register draft' : 'Compile and publish'}</>}
        </button>
      </section>}
    </div>
  </div>;
}
