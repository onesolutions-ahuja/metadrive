import { normalizeVisualProperties, type VisualProperties } from './pageComponentLayout';

export default function PageComponentVisualEditor({ value, onChange }: {
  value: unknown; onChange: (next: VisualProperties) => void;
}) {
  const visual = normalizeVisualProperties(value);
  const set = <K extends keyof VisualProperties>(key: K, next: VisualProperties[K]) => onChange({ ...visual, [key]: next });
  const number = (name: keyof VisualProperties, label: string, min: number, max: number) =>
    <label className="form-label" key={name}>{label}
      <input className="form-control" type="number" min={min} max={max}
        value={visual[name] as number}
        onChange={(event) => set(name, Math.max(min, Math.min(max, Number(event.target.value) || 0)) as never)} />
    </label>;
  const color = (name: 'backgroundColor' | 'color' | 'borderColor', label: string) =>
    <label className="form-label" key={name}>{label}
      <input className="form-control" type="text" placeholder="#ffffff or transparent"
        value={visual[name]} onChange={(event) => {
          const next = event.target.value;
          if (next === '' || /^(?:#[0-9a-f]{0,8}|[a-z]*)$/i.test(next)) set(name, next);
        }} />
    </label>;
  return <fieldset className="metadata-component-visual-editor">
    <legend className="properties-section-title">Appearance & responsive layout</legend>
    {number('padding', 'Padding (px)', 0, 128)}
    {number('margin', 'Margin (px)', 0, 128)}
    {number('gap', 'Child spacing (px)', 0, 128)}
    {number('borderWidth', 'Border width (px)', 0, 16)}
    {number('borderRadius', 'Corner radius (px)', 0, 128)}
    {color('backgroundColor', 'Background colour')}
    {color('color', 'Text colour')}
    {color('borderColor', 'Border colour')}
    <label className="form-label">Align items
      <select className="form-control" value={visual.align} onChange={(event) => set('align', event.target.value as VisualProperties['align'])}>
        {['start','center','end','stretch'].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    <label className="form-label">Justify content
      <select className="form-control" value={visual.justify} onChange={(event) => set('justify', event.target.value as VisualProperties['justify'])}>
        {['start','center','end','space-between'].map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
    </label>
    {number('desktopColumns', 'Desktop grid columns', 1, 12)}
    {number('tabletColumns', 'Tablet grid columns', 1, 12)}
    {number('mobileColumns', 'Phone grid columns', 1, 12)}
    <button type="button" className="btn btn-small" onClick={() => onChange(normalizeVisualProperties(null))}>Reset appearance to defaults</button>
  </fieldset>;
}
