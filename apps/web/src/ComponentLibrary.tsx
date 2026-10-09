import { useState } from 'react';
import { Check, Code2, Grid2X2, Pencil, Plus, Puzzle, Save, Trash2, X } from 'lucide-react';
import type { LibraryComponentMetadata } from './metadata';
import { standardDashboardComponents, standardPageComponents } from './componentCatalog';

type ComponentInput = Pick<LibraryComponentMetadata, 'apiName' | 'label' | 'description' | 'surfaces' | 'jsxSource' | 'cssSource'>;

export default function ComponentLibrary({
  components, canManage, onSave, onDelete
}: {
  components: LibraryComponentMetadata[];
  canManage: boolean;
  onSave: (component: ComponentInput, updating: boolean) => Promise<void>;
  onDelete: (apiName: string) => Promise<void>;
}) {
  const [editingApiName, setEditingApiName] = useState('');
  const [apiName, setApiName] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [surfaces, setSurfaces] = useState<Array<'page' | 'dashboard'>>(['page', 'dashboard']);
  const [jsxSource, setJsxSource] = useState('');
  const [cssSource, setCssSource] = useState('');
  const [jsxFileName, setJsxFileName] = useState('');
  const [cssFileName, setCssFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setEditingApiName('');
    setApiName('');
    setLabel('');
    setDescription('');
    setSurfaces(['page', 'dashboard']);
    setJsxSource('');
    setCssSource('');
    setJsxFileName('');
    setCssFileName('');
    setError('');
  };

  const edit = (component: LibraryComponentMetadata) => {
    setEditingApiName(component.apiName);
    setApiName(component.apiName);
    setLabel(component.label);
    setDescription(component.description);
    setSurfaces(component.surfaces);
    setJsxSource(component.jsxSource);
    setCssSource(component.cssSource);
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
        jsxSource,
        cssSource
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
    setError('');
    try {
      await onDelete(component.apiName);
      if (editingApiName === component.apiName) reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to remove component');
    }
  };

  const toggleSurface = (surface: 'page' | 'dashboard', checked: boolean) => {
    setSurfaces((current) => checked
      ? current.includes(surface) ? current : [...current, surface]
      : current.filter((item) => item !== surface));
  };

  return <div className="component-library-page">
    <div className="page-heading">
      <div><div className="eyebrow">Setup / Platform Tools</div><h1>Global Component Library</h1><p>Browse built-in builder components and register reusable JSX and CSS components for Lightning pages and dashboards.</p></div>
      {canManage && <button className="btn btn-brand" onClick={reset}><Plus size={14} />Register component</button>}
    </div>
    {!canManage && <div className="info-callout component-library-notice">You can use shared components in builders. A user with the <strong>Manage global components</strong> permission is required to register, update, or remove library entries.</div>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="component-library-layout">
      <section className="surface component-library-list">
        <div className="list-view-header"><div><div className="list-view-label">Shared catalog</div><h2>All components</h2><span>{standardPageComponents.length + standardDashboardComponents.length + components.length} components · {standardPageComponents.length + standardDashboardComponents.length} standard · {components.length} custom</span></div></div>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Standard components</h3><span>Built in · Lightning pages</span></div>
          {standardPageComponents.map((component) => <article className="library-component-card" key={component.apiName}>
            <span className="component-option-icon"><Grid2X2 size={16} /></span>
            <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>Standard · Lightning pages</small><p>{component.description}</p></div>
          </article>)}
        </div>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Standard dashboard widgets</h3><span>Built in · Dashboards</span></div>
          {standardDashboardComponents.map((component) => <article className="library-component-card" key={component.apiName}>
            <span className="component-option-icon"><Grid2X2 size={16} /></span>
            <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>Standard · Dashboards</small><p>{component.description}</p></div>
          </article>)}
        </div>
        <div className="component-library-section">
          <div className="component-library-section-heading"><h3>Custom components</h3><span>Registered in this shared library</span></div>
        {components.map((component) => <article className={`library-component-card ${editingApiName === component.apiName ? 'selected' : ''}`} key={component.apiName}>
          <span className="component-option-icon"><Puzzle size={16} /></span>
          <div className="library-component-info"><strong>{component.label}</strong><code>{component.apiName}</code><small>{component.surfaces.map((surface) => surface === 'page' ? 'Lightning pages' : 'Dashboards').join(' · ')} · v{component.version}</small>{component.description && <p>{component.description}</p>}</div>
          {canManage && <div className="library-component-actions"><button className="btn btn-small" onClick={() => edit(component)}><Pencil size={12} />Edit</button><button className="icon-button subtle" aria-label={`Delete ${component.label}`} title="Delete component" onClick={() => void remove(component)}><Trash2 size={14} /></button></div>}
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
        <div className="properties-section-title">Available in</div>
        <label className="checkbox-row property-check"><input type="checkbox" checked={surfaces.includes('page')} onChange={(event) => toggleSurface('page', event.target.checked)} />Lightning page builder</label>
        <label className="checkbox-row property-check"><input type="checkbox" checked={surfaces.includes('dashboard')} onChange={(event) => toggleSurface('dashboard', event.target.checked)} />Dashboard builder</label>
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
          {busy ? 'Compiling and saving…' : editingApiName ? <><Save size={14} />Save new version</> : <><Check size={14} />Compile and register</>}
        </button>
      </section>}
    </div>
  </div>;
}
