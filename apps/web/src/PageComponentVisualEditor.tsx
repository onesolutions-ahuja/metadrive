import {appearanceNumberFields,appearanceColorFields,appearanceChoiceFields} from './metadataAppearanceSchema';
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
    {appearanceNumberFields.map(({key,label,min,max}) => number(key,label,min,max))}
    {appearanceColorFields.map(({key,label}) => color(key,label))}
    {appearanceChoiceFields.map(({key,label,options}) =>
      <label className="form-label" key={key}>{label}
        <select className="form-control" value={visual[key]} onChange={(event) => set(key,event.target.value as VisualProperties[typeof key])}>
          {options.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
    )}
    <button type="button" className="btn btn-small" onClick={() => onChange(normalizeVisualProperties(null))}>Reset appearance to defaults</button>
  </fieldset>;
}
