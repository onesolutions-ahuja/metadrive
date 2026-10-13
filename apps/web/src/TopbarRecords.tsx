import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export type NavigableObject = { apiName: string; label: string; pluralLabel: string };
export type SearchableRecord = { Id: string; Name?: unknown; Email?: unknown; [key: string]: unknown };

export function useDismissOnOutside<T extends HTMLElement>(
  container: React.RefObject<T>, expanded: boolean, dismiss: () => void
) {
  useEffect(() => {
    if (!expanded) return;
    const onOutside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) dismiss();
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onEscape);
    };
  }, [container, expanded, dismiss]);
}

/** Full permission-filtered metadata catalogue; never tied to an app's navigation order. */
export function RecordObjectPicker({
  objects, selected, onSelect
}: { objects: NavigableObject[]; selected: string; onSelect: (apiName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  useDismissOnOutside(wrap, open, () => { setOpen(false); setQuery(''); });
  const available = useMemo(() => [...objects].sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel)), [objects]);
  const counts = useMemo(() => { const n = new Map<string, number>(); for (const item of objects) { const key = item.pluralLabel.trim().toLocaleLowerCase(); n.set(key, (n.get(key) ?? 0) + 1); } return n; }, [objects]);
  const displayName = (item: NavigableObject) => counts.get(item.pluralLabel.trim().toLocaleLowerCase())! > 1 ? `${item.pluralLabel} (${item.apiName})` : item.pluralLabel;
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? available.filter(item =>
      `${item.pluralLabel} ${item.label} ${item.apiName}`.toLocaleLowerCase().includes(needle)) : available;
  }, [available, query]);
  const select = (apiName: string) => {
    setOpen(false); setQuery(''); setActiveIndex(0); onSelect(apiName);
  };
  const selectedObject = objects.find(item => item.apiName === selected);
  const selectedLabel = selectedObject ? displayName(selectedObject) : undefined;
  return <div className="header-record-picker" ref={wrap}>
    <div className="header-record-picker-control">
      <input role="combobox" aria-label="Find record object" aria-haspopup="listbox"
        aria-autocomplete="list" aria-expanded={open} aria-controls="header-record-object-options"
        value={open ? query : selectedLabel ?? ''} placeholder="Find records…"
        onFocus={() => { setOpen(true); setQuery(''); setActiveIndex(0); }}
        onClick={() => { setOpen(true); setQuery(''); setActiveIndex(0); }}
        onChange={event => { setOpen(true); setQuery(event.target.value); setActiveIndex(0); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { setOpen(false); setQuery(''); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex(i => Math.min(i + 1, matches.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(i => Math.max(0, i - 1)); }
          if (event.key === 'Enter' && open && matches.length) { event.preventDefault(); select(matches[Math.min(activeIndex, matches.length - 1)].apiName); }
        }} />
      <ChevronDown size={15} aria-hidden="true" />
    </div>
    {open && <div id="header-record-object-options" className="header-record-picker-options" role="listbox" aria-label="Record objects">
      {matches.map((item, index) => <button key={item.apiName} role="option" type="button"
        aria-selected={item.apiName === selected} className={index === activeIndex ? 'selected' : ''}
        onMouseEnter={() => setActiveIndex(index)} onClick={() => select(item.apiName)}>
        <span>{displayName(item)}</span><small>{item.apiName}</small>
      </button>)}
      {matches.length === 0 && <p className="header-search-empty">No matching objects</p>}
    </div>}
  </div>;
}

/** Explicit global search: never changes the current record-list filter. */
export function GlobalRecordSearch({
  objects, searchObject, onSelect
}: {
  objects: NavigableObject[];
  searchObject: (apiName: string, term: string) => Promise<{ records: SearchableRecord[] }>;
  onSelect: (objectApiName: string, recordId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ object: NavigableObject; record: SearchableRecord }>>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [checked, setChecked] = useState(0);
  const [failures, setFailures] = useState(0);
  const requestId = useRef(0);
  const wrap = useRef<HTMLFormElement>(null);
  useDismissOnOutside(wrap, open, () => setOpen(false));
  useEffect(() => () => { requestId.current++; }, []);

  const performSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) { setOpen(true); setSearched(false); return; }
    const id = ++requestId.current;
    setResults([]); setChecked(0); setFailures(0); setBusy(true); setSearched(true); setOpen(true);
    // Bounded concurrency: a tenant may have hundreds of custom objects.
    let next = 0;
    const worker = async () => {
      while (next < objects.length && requestId.current === id) {
        const object = objects[next++];
        try {
          const payload = await searchObject(object.apiName, term);
          if (requestId.current !== id) return;
          if (payload.records.length) setResults(current => [
            ...current, ...payload.records.map(record => ({ object, record }))
          ]);
        } catch {
          if (requestId.current !== id) return;
          setFailures(count => count + 1); // RBAC remains enforced by the record API.
        } finally {
          if (requestId.current === id) setChecked(count => count + 1);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, objects.length) }, () => worker()));
    if (requestId.current === id) setBusy(false);
  };
  return <form className="global-search global-record-search" role="search" onSubmit={event => void performSearch(event)} ref={wrap}>
    <button type="submit" className="global-search-submit" aria-label="Search all records"><Search size={16} /></button>
    <input type="search" aria-label="Global search across objects" placeholder="Global search (Enter)…"
      value={query} onChange={event => { setQuery(event.target.value); setSearched(false); setOpen(false); requestId.current++; setBusy(false); }} />
    {open && <div className="global-record-search-results" role="region" aria-label="Global search results">
      {query.trim().length < 2
        ? <p className="header-search-empty">Enter at least two characters.</p>
        : <>
          <div className="global-search-results-heading">
            <strong>All records</strong><span>{busy ? `Searching ${checked}/${objects.length} objects…` : `${results.length} matches`}</span>
          </div>
          {results.map(({ object, record }) => <button type="button" key={`${object.apiName}:${record.Id}`}
            onClick={() => { setOpen(false); onSelect(object.apiName, record.Id); }}>
            <strong>{String(record.Name ?? record.Email ?? record.Id)}</strong><small>{object.pluralLabel}</small>
          </button>)}
          {searched && !busy && !results.length && <p className="header-search-empty">No matching accessible records.</p>}
          {searched && !busy && failures > 0 && <p className="header-search-empty">Some objects could not be searched. Access permissions are enforced by the server.</p>}
        </>}
    </div>}
  </form>;
}
