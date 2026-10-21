import { appearanceNumberFields, appearanceColorFields, appearanceChoiceFields } from '../../metadata/Definitions/metadataAppearanceSchema';
import { normalizeVisualProperties, type VisualProperties } from '../../pages/TemplatePageRuntime/pageComponentLayout';

/** Visual-first metadata editor used by the shared Page Builder inspector.
 * Presets and exact inputs update the same published visualStyle fields. */
export default function PageComponentVisualEditor({ value, onChange }: {
  value: unknown; onChange: (next: VisualProperties) => void;
}) {
  const visual = normalizeVisualProperties(value);
  const set = <K extends keyof VisualProperties>(key: K, next: VisualProperties[K]) =>
    onChange({ ...visual, [key]: next });
  const setNumber = (key: keyof VisualProperties, next: number) => set(key, next as never);
  const number = (name: keyof VisualProperties, label: string, min: number, max: number) =>
    <label className="form-label" key={name}>{label}
      <input className="form-control" type="number" min={min} max={max}
        value={visual[name] as number}
        onChange={event => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) setNumber(name, Math.max(min, Math.min(max, next)));
        }} />
    </label>;
  const color = (name: 'backgroundColor' | 'color' | 'borderColor', label: string) =>
    <label className="form-label" key={name}>{label}
      <input className="form-control" type="text" placeholder="#ffffff or transparent"
        value={visual[name]} onChange={event => {
          const next = event.target.value;
          if (next === '' || /^(?:#[0-9a-f]{0,8}|[a-z]*)$/i.test(next)) set(name, next);
        }} />
    </label>;
  const numericPresets: Array<{key:'borderRadius'|'padding'|'gap'|'borderWidth';label:string;values:number[];labels:string[]}> = [
    {key:'borderRadius',label:'Corners',values:[0,6,14,28,64],labels:['Square','Small','Round','Soft','Pill']},
    {key:'padding',label:'Inside spacing',values:[0,8,16,24,32],labels:['None','Tight','Normal','Roomy','Wide']},
    {key:'gap',label:'Element spacing',values:[0,4,8,16,24],labels:['None','Tiny','Small','Medium','Large']},
    {key:'borderWidth',label:'Border',values:[0,1,2,4],labels:['None','Hairline','Normal','Bold']}
  ];
  const alignmentPresets: Array<{key:'align'|'justify';label:string;values:readonly string[]}> = [
    {key:'align',label:'Align items',values:['start','center','end','stretch']},
    {key:'justify',label:'Content position',values:['start','center','end','space-between']}
  ];
  const swatches = ['transparent','#ffffff','#f8fafc','#e0e7ff','#dbeafe','#dcfce7','#fee2e2','#111827'];
  return <fieldset className="metadata-component-visual-editor">
    <legend className="properties-section-title">Appearance & responsive layout</legend>
    <p className="properties-help">Choose a style visually. Use Advanced controls for exact measurements.</p>
    {numericPresets.map(preset => <div className="visual-preset-section" key={preset.key}>
      <div className="visual-preset-heading">{preset.label}<small>{visual[preset.key]} px</small></div>
      <div className="visual-preset-grid" role="group" aria-label={preset.label}>
        {preset.values.map((n,index) => <button type="button" key={n}
          className={visual[preset.key] === n ? 'visual-preset active' : 'visual-preset'}
          aria-label={`${preset.label}: ${preset.labels[index]} (${n} pixels)`}
          aria-pressed={visual[preset.key] === n}
          onClick={() => setNumber(preset.key,n)}>
          <span className="visual-preset-sample" aria-hidden="true">
            {preset.key === 'borderRadius' ? <span className="visual-corner-example" style={{borderRadius:`${n}px`}}/> :
              preset.key === 'borderWidth' ? <span className="visual-border-example" style={{borderWidth:`${n}px`}}/> :
              <span className="visual-space-example" style={{padding:preset.key === 'padding' ? n/3 : 3}}>
                <i/><i style={{marginLeft:preset.key === 'gap' ? n/2 : 2}}/>
              </span>}
          </span>
          <span>{preset.labels[index]}</span>
        </button>)}
      </div>
    </div>)}
    {alignmentPresets.map(preset => <div className="visual-preset-section" key={preset.key}>
      <div className="visual-preset-heading">{preset.label}</div>
      <div className="visual-preset-grid" role="group" aria-label={preset.label}>
        {preset.values.map(alignment => <button type="button" key={alignment}
          className={visual[preset.key] === alignment ? 'visual-preset active' : 'visual-preset'}
          aria-label={`${preset.label}: ${alignment}`} aria-pressed={visual[preset.key] === alignment}
          onClick={() => set(preset.key,alignment as VisualProperties[typeof preset.key])}>
          <span className={`visual-alignment-example visual-align-${alignment}`} aria-hidden="true"><i/><i/><i/></span>
          <span>{alignment === 'space-between' ? 'Spread' : alignment[0].toUpperCase()+alignment.slice(1)}</span>
        </button>)}
      </div>
    </div>)}
    <div className="visual-preset-section">
      <div className="visual-preset-heading">Background colour</div>
      <div className="visual-swatch-grid" role="group" aria-label="Background colour presets">
        {swatches.map(swatch => <button type="button" key={swatch}
          style={{background:swatch === 'transparent' ? 'repeating-conic-gradient(#e6eaf0 0% 25%,white 0% 50%) 50%/12px 12px' : swatch}}
          className={visual.backgroundColor.toLowerCase() === swatch ? 'visual-swatch active' : 'visual-swatch'}
          title={swatch} aria-label={`Background ${swatch}`}
          aria-pressed={visual.backgroundColor.toLowerCase() === swatch}
          onClick={() => set('backgroundColor',swatch)} />)}
      </div>
    </div>
    <details className="visual-advanced-properties">
      <summary>Advanced · Exact values and responsive layout</summary>
      <div className="visual-advanced-grid">
        {appearanceNumberFields.map(({key,label,min,max}) => number(key,label,min,max))}
        {appearanceColorFields.map(({key,label}) => color(key,label))}
        {appearanceChoiceFields.map(({key,label,options}) =>
          <label className="form-label" key={key}>{label}
            <select className="form-control" value={visual[key]}
              onChange={event => set(key,event.target.value as VisualProperties[typeof key])}>
              {options.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>)}
      </div>
    </details>
    <button type="button" className="btn btn-small" onClick={() => onChange(normalizeVisualProperties(null))}>Reset appearance to defaults</button>
  </fieldset>;
}
