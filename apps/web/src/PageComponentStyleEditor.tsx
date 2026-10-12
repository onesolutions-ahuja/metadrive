import { useState } from 'react';
import {
  layoutSettings,
  updateLayoutSettings,
  validateLayoutSetting,
  type LayoutDevice,
  type LayoutSettingKey
} from './pageComponentLayout';

type Mode = 'Base' | LayoutDevice;
const numeric: Array<[LayoutSettingKey, string, number, number]> = [
  ['padding', 'Padding', 0, 160],
  ['margin', 'Margin', 0, 160],
  ['borderWidth', 'Border width', 0, 24],
  ['borderRadius', 'Corner radius', 0, 160],
  ['gap', 'Spacing / gap', 0, 160],
  ['opacity', 'Opacity (%)', 0, 100]
];
const alignments: Array<[LayoutSettingKey, string, string[]]> = [
  ['alignItems', 'Cross-axis alignment', ['stretch', 'flex-start', 'center', 'flex-end']],
  ['justifyContent', 'Main-axis alignment', ['flex-start', 'center', 'flex-end', 'space-between', 'space-around']]
];

export default function PageComponentStyleEditor({
  properties, onChange, disabled = false
}: {
  properties: Record<string, unknown>;
  onChange: (properties: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('Base');
  const [error, setError] = useState('');
  const base = properties.layoutStyle && typeof properties.layoutStyle === 'object'
    ? properties.layoutStyle as Record<string, unknown> : {};
  const overrides = properties.layoutResponsive && typeof properties.layoutResponsive === 'object'
    ? properties.layoutResponsive as Record<string, Record<string, unknown>> : {};
  const current = mode === 'Base' ? base : overrides[mode] ?? {};
  const inherited = layoutSettings(properties, mode === 'Base' ? 'Desktop' : mode);
  const change = (key: LayoutSettingKey, value: string | number | boolean | null) => {
    if (disabled) return;
    const validation = value === null ? '' : validateLayoutSetting(key, value);
    if (validation) { setError(`${key}: ${validation}`); return; }
    setError('');
    onChange(updateLayoutSettings(properties, mode, key, value));
  };
  const inheritedCaption = mode === 'Base' ? 'Default' : 'Inherit base';
  return <section className="page-component-style-editor" aria-label="Advanced layout and responsive properties">
    <div className="properties-section-title">Advanced appearance and layout</div>
    <p className="properties-help">All values are stored with the page. Desktop, tablet and phone overrides inherit the base values until changed.</p>
    <label className="form-label">Edit breakpoint
      <select className="form-control" aria-label="Edit layout breakpoint" disabled={disabled} value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
        <option value="Base">Base / default</option>
        <option value="Desktop">Desktop override</option>
        <option value="Tablet">Tablet override</option>
        <option value="Phone">Phone override</option>
      </select>
    </label>
    {numeric.map(([key, label, min, max]) => <label className="form-label" key={key}>{label} (px{key === 'opacity' ? ' or %' : ''})
      <input className="form-control" type="number" disabled={disabled} min={min} max={max} step={1}
        aria-label={label}
        placeholder={String(inherited[key] ?? inheritedCaption)}
        value={typeof current[key] === 'number' ? current[key] as number : ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) return change(key, null);
          const value = Number(raw);
          if (Number.isFinite(value)) change(key, value);
        }} />
    </label>)}
    {(['backgroundColor', 'borderColor'] as const).map((key) => {
      const chosen = String(current[key] ?? inherited[key] ?? '#ffffff');
      const transparent = chosen === 'transparent';
      return <div className="metadata-array-property" key={key}>
        <label className="form-label">{key === 'backgroundColor' ? 'Background colour' : 'Border colour'}
          <input className="form-control" type="color" disabled={disabled}
            aria-label={key === 'backgroundColor' ? 'Background colour picker' : 'Border colour picker'}
            value={/^#[0-9a-f]{6}$/i.test(chosen) ? chosen : '#ffffff'}
            onChange={(event) => change(key, event.target.value)} />
        </label>
        <label className="checkbox-row"><input type="checkbox" disabled={disabled} checked={transparent}
          onChange={(event) => change(key, event.target.checked ? 'transparent' : '#ffffff')} />Transparent</label>
        {mode !== 'Base' && <button className="btn btn-small" type="button" disabled={disabled}
          onClick={() => change(key, null)}>Inherit base colour</button>}
      </div>;
    })}
    {alignments.map(([key, label, options]) => <label className="form-label" key={key}>{label}
      <select className="form-control" disabled={disabled} value={String(current[key] ?? '')}
        onChange={(event) => change(key, event.target.value || null)}>
        <option value="">{inheritedCaption}</option>
        {options.map((item) => <option key={item} value={item}>{item.replace('-', ' ')}</option>)}
      </select>
    </label>)}
    <label className="form-label">Visibility on {mode === 'Base' ? 'all devices' : mode}
      <select className="form-control" disabled={disabled} aria-label="Component visibility"
        value={current.hidden === true ? 'hidden' : current.hidden === false ? 'visible' : 'inherit'}
        onChange={(event) => change('hidden', event.target.value === 'inherit' ? null : event.target.value === 'hidden')}>
        <option value="inherit">{mode === 'Base' ? 'Visible by default' : 'Inherit base visibility'}</option>
        <option value="visible">Visible</option>
        <option value="hidden">Hidden</option>
      </select>
    </label>
    {error && <div className="auth-error" role="alert">{error}</div>}
    <div className="properties-help">Reset a numeric field by clearing it. Values outside the accepted ranges cannot be saved.</div>
  </section>;
}
