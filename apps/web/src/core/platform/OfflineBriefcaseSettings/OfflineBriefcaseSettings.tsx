import { useEffect, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import './OfflineBriefcaseSettings.css';

type Selection = { objectApi: string; recordIds: string[] };
type DraftSelection = { objectApi: string; recordIdsText: string };
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

const toDraft = (selection: Selection): DraftSelection => ({
  objectApi: selection.objectApi,
  recordIdsText: selection.recordIds.join('\n')
});

export default function OfflineBriefcaseSettings({ request, permitted }: {
  request: Request;
  permitted: boolean;
}) {
  const [selections, setSelections] = useState<DraftSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    setLoading(true);
    setError('');
    void request<{ briefcase: { selections: Selection[] } }>('/tenant/offline-briefcase')
      .then(({ briefcase }) => {
        if (active) setSelections((briefcase?.selections ?? []).map(toDraft));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load offline briefcase settings');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, permitted, revision]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const normalized = selections.map(({ objectApi, recordIdsText }) => ({
        objectApi: objectApi.trim(),
        recordIds: recordIdsText.split(/[\s,]+/).map(id => id.trim()).filter(Boolean)
      })).filter(selection => selection.objectApi || selection.recordIds.length);
      const { briefcase } = await request<{ briefcase: { selections: Selection[] } }>('/tenant/offline-briefcase', {
        method: 'PUT',
        body: JSON.stringify({ selections: normalized })
      });
      setSelections(briefcase.selections.map(toDraft));
      setNotice('Offline briefcase selections saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save offline briefcase settings');
    } finally { setSaving(false); }
  };

  if (!permitted) return null;
  const selectedCount = selections.reduce((count, selection) =>
    count + selection.recordIdsText.split(/[\s,]+/).filter(Boolean).length, 0);
  return <section className="offline-briefcase surface permission-section" aria-label="Mobile offline briefcase">
    <header><div><h2>Mobile offline briefcase</h2>
      <p>Choose up to 100 records that signed-in users can sync for read-only offline access.</p></div>
      <button type="button" className="btn" disabled={loading || saving}
        onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} /> Refresh</button>
    </header>
    {loading && <p role="status">Loading offline briefcase settings…</p>}
    {error && <p className="offline-briefcase-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <form onSubmit={event => void save(event)}>
      {selections.map((selection, index) => <fieldset className="offline-briefcase-selection" key={index}>
        <legend>Object selection {index + 1}</legend>
        <label>Object API name
          <input required maxLength={128} value={selection.objectApi}
            placeholder="Account" onChange={event => setSelections(value => value.map((item, itemIndex) =>
              itemIndex === index ? { ...item, objectApi: event.target.value } : item))} />
        </label>
        <label>Record IDs
          <textarea required rows={4} value={selection.recordIdsText}
            placeholder="One record UUID per line"
            onChange={event => setSelections(value => value.map((item, itemIndex) =>
              itemIndex === index ? { ...item, recordIdsText: event.target.value } : item))} />
        </label>
        <button type="button" className="btn btn-secondary" onClick={() =>
          setSelections(value => value.filter((_, itemIndex) => itemIndex !== index))}>
          Remove object
        </button>
      </fieldset>)}
      <p className="offline-briefcase-count" aria-live="polite">{selectedCount} of 100 records selected</p>
      <div className="offline-briefcase-actions">
        <button type="button" className="btn btn-secondary" disabled={selections.length >= 20 || saving}
          onClick={() => setSelections(value => [...value, { objectApi: '', recordIdsText: '' }])}>
          Add object
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading || saving}>
          {saving ? 'Saving…' : 'Save selections'}
        </button>
      </div>
    </form>
  </section>;
}
