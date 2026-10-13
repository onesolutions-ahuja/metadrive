import { useMemo, useState } from 'react';
import type { ObjectMetadata } from './metadata';

type Props = {
  objects: ObjectMetadata[];
  selectedObjectApiName: string;
  onOpenObject: (object: ObjectMetadata) => void;
  onCreateObject: () => void;
  onNewField: () => void;
};

const cardWidth = 232;
const cardHeight = 116;
const columnGap = 72;
const rowGap = 58;
const margin = 32;
const maxZoom = 1.7;
const minZoom = 0.55;

export default function SchemaBuilder({ objects, selectedObjectApiName, onOpenObject, onCreateObject, onNewField }: Props) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'All' | 'Custom' | 'Standard'>('All');
  const [onlyRelated, setOnlyRelated] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [focusedId, setFocusedId] = useState(selectedObjectApiName);
  const focused = objects.find(object => object.apiName === focusedId)
    ?? objects.find(object => object.apiName === selectedObjectApiName);

  const graph = useMemo(() => {
    const all = new Map(objects.map(object => [object.apiName, object]));
    const related = new Set<string>();
    if (onlyRelated && focused) {
      related.add(focused.apiName);
      for (const item of objects) for (const field of item.fields) {
        const target = field.relationship?.targetObject;
        if (target === focused.apiName) related.add(item.apiName);
        if (item.apiName === focused.apiName && target) related.add(target);
      }
    }
    const filtered = objects.filter(object =>
      (kind === 'All' || (kind === 'Custom' ? object.kind === 'Custom Object' : object.kind !== 'Custom Object'))
      && (!onlyRelated || related.has(object.apiName))
      && (!search.trim() || (object.label + ' ' + object.apiName).toLowerCase().includes(search.trim().toLowerCase())))
      .sort((a, b) => a.label.localeCompare(b.label));
    const count = filtered.length;
    const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(count || 1))));
    const rows = Math.ceil(count / columns);
    const width = margin * 2 + columns * cardWidth + (columns - 1) * columnGap;
    const height = margin * 2 + rows * cardHeight + Math.max(0, rows - 1) * rowGap;
    const nodes = filtered.map((object, i) => ({
      object,
      x: margin + (i % columns) * (cardWidth + columnGap),
      y: margin + Math.floor(i / columns) * (cardHeight + rowGap),
    }));
    const byName = new Map(nodes.map(node => [node.object.apiName, node]));
    const edges = nodes.flatMap(node => node.object.fields.flatMap(field => {
      const target = field.relationship?.targetObject;
      const to = target ? byName.get(target) : undefined;
      if (!to) return [];
      return [{ id: node.object.apiName + '.' + field.apiName, from: node, to,
        label: field.label, type: field.relationship?.type ?? 'Lookup' }];
    }));
    const missing = nodes.flatMap(node => node.object.fields.flatMap(field =>
      field.relationship?.targetObject && !all.has(field.relationship.targetObject)
        ? [{ object: node.object.apiName, field: field.apiName, target: field.relationship.targetObject }]
        : []));
    return { nodes, edges, missing, width, height };
  }, [objects, search, kind, onlyRelated, focused?.apiName]);

  const active = focused ? objects.find(object => object.apiName === focused.apiName) : undefined;
  return <section className="surface object-setting-surface" aria-label="Visual Schema Builder">
    <div className="section-toolbar">
      <div><h2>Schema Builder</h2><p>Object relationships and fields are read from saved Object Manager metadata.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn" onClick={onCreateObject}>Create Object</button>
        <button type="button" className="btn btn-brand" onClick={onNewField}>New Field on Current Object</button>
      </div>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <label className="form-label" style={{ flex: '1 1 180px' }}>Find object
        <input className="form-control" value={search} onChange={event => setSearch(event.target.value)}
          placeholder="Object name or API name" aria-label="Find schema object" />
      </label>
      <label className="form-label">Object type
        <select className="form-control" value={kind} onChange={event => setKind(event.target.value as typeof kind)}
          aria-label="Filter schema object type">
          <option value="All">All objects</option><option value="Custom">Custom objects</option>
          <option value="Standard">Standard objects</option>
        </select>
      </label>
      <label className="checkbox-row" style={{ alignSelf: 'end', paddingBottom: 12 }}>
        <input type="checkbox" checked={onlyRelated} onChange={event => setOnlyRelated(event.target.checked)} />
        Connected to selected object
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'end', paddingBottom: 7 }}>
        <button className="btn" type="button" aria-label="Zoom out schema" disabled={zoom <= minZoom}
          onClick={() => setZoom(value => Math.max(minZoom, Math.round((value - .15) * 100) / 100))}>−</button>
        <output aria-label="Schema zoom" style={{ minWidth: 48, textAlign: 'center' }}>{Math.round(zoom * 100)}%</output>
        <button className="btn" type="button" aria-label="Zoom in schema" disabled={zoom >= maxZoom}
          onClick={() => setZoom(value => Math.min(maxZoom, Math.round((value + .15) * 100) / 100))}>+</button>
        <button className="btn" type="button" onClick={() => setZoom(1)}>Reset</button>
      </div>
    </div>
    <div style={{ overflow: 'auto', maxHeight: '60vh', minHeight: 290, border: '1px solid var(--slds-g-color-border-base-1, #d8dde6)', borderRadius: 8, background: 'var(--slds-g-color-neutral-base-100, #fff)' }}>
      <svg role="img" aria-label="Object relationship schema diagram" width={Math.ceil(graph.width * zoom)}
        height={Math.ceil(Math.max(graph.height, 290) * zoom)}
        viewBox={'0 0 ' + graph.width + ' ' + Math.max(graph.height, 290)}
        xmlns="http://www.w3.org/2000/svg">
        <defs><marker id="schema-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3"
          orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#63738a" /></marker></defs>
        {graph.edges.map(edge => {
          const fromX = edge.from.x + cardWidth / 2;
          const fromY = edge.from.y + cardHeight / 2;
          const toX = edge.to.x + cardWidth / 2;
          const toY = edge.to.y + cardHeight / 2;
          return <line key={edge.id} x1={fromX} y1={fromY} x2={toX} y2={toY}
            stroke={edge.type === 'Master-Detail' ? '#9351b8' : '#63738a'}
            strokeWidth={edge.type === 'Master-Detail' ? 2.5 : 1.5}
            strokeDasharray={edge.type === 'Master-Detail' ? undefined : '5 5'}
            markerEnd="url(#schema-arrow)"><title>{edge.from.object.label + ' → ' + edge.to.object.label + ': ' + edge.label + ' (' + edge.type + ')'}</title></line>;
        })}
        {graph.nodes.map(node => {
          const selected = active?.apiName === node.object.apiName;
          const fields = node.object.fields.slice(0, 3);
          return <g key={node.object.apiName} transform={'translate(' + node.x + ',' + node.y + ')'}
            role="button" tabIndex={0} aria-label={'Select ' + node.object.label}
            onClick={() => setFocusedId(node.object.apiName)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setFocusedId(node.object.apiName); } }}
            style={{ cursor: 'pointer' }}>
            <rect x="0" y="0" width={cardWidth} height={cardHeight} rx="8" fill="#fff"
              stroke={selected ? '#0176d3' : '#b9c4d0'} strokeWidth={selected ? 3 : 1.4} />
            <rect x="0" y="0" width={cardWidth} height="37" rx="8" fill={selected ? '#e7f2ff' : '#eef2f7'} />
            <rect x="0" y="30" width={cardWidth} height="7" fill={selected ? '#e7f2ff' : '#eef2f7'} />
            <text x="12" y="23" fontWeight="700" fontSize="14" fill="#16325c">
              {node.object.label.length > 26 ? node.object.label.slice(0, 25) + '…' : node.object.label}</text>
            <text x="12" y="54" fontSize="10" fill="#54698d">{node.object.apiName.slice(0, 34)}</text>
            {fields.map((field, index) => <text key={field.apiName} x="12" y={72 + index * 14}
              fontSize="11" fill="#374151">
              {(field.relationship ? '↗ ' : '• ') + (field.label.length > 27 ? field.label.slice(0, 26) + '…' : field.label)}
            </text>)}
            {node.object.fields.length > 3 && <text x="198" y="108" fontSize="10" fill="#54698d">+{node.object.fields.length - 3}</text>}
          </g>;
        })}
        {!graph.nodes.length && <text x="24" y="70" fontSize="15" fill="#54698d">No matching objects. Clear filters to see your schema.</text>}
      </svg>
    </div>
    <p className="permission-help">Solid purple arrows: master-detail. Dashed arrows: lookups. Select an object to inspect it; use Object Manager to save validated changes.</p>
    {active && <div className="metadata-card" style={{ marginTop: 14 }}>
      <div className="section-toolbar"><div><h3>{active.label}</h3><p>{active.apiName} · {active.fields.length} fields</p></div>
        <button type="button" className="btn btn-brand" onClick={() => onOpenObject(active)}>Edit in Object Manager</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
        {active.fields.filter(field => field.relationship).map(field =>
          <div key={field.apiName} className="metadata-row"><span><strong>{field.label}</strong>
            <small>{field.relationship?.type} → {field.relationship?.targetObject}</small></span></div>)}
        {!active.fields.some(field => field.relationship) && <p>No outgoing relationships defined.</p>}
      </div>
    </div>}
    {graph.missing.length > 0 && <p role="status" className="permission-help">
      {graph.missing.length} relationship target(s) cannot be displayed because their objects are not in available metadata.
    </p>}
  </section>;
}
