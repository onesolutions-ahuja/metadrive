import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { useModalAccessibility } from './useModalAccessibility';
import { createPortal } from 'react-dom';
import { useCallback } from 'react';

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
  const available = useMemo(() => Array.from(new Map(objects.map(item => [item.apiName, item])).values())
    .sort((a, b) => a.pluralLabel.localeCompare(b.pluralLabel)), [objects]);
  const counts = useMemo(() => { const n = new Map<string, number>(); for (const item of available) { const key = item.pluralLabel.trim().toLocaleLowerCase(); n.set(key, (n.get(key) ?? 0) + 1); } return n; }, [available]);
  const displayName = (item: NavigableObject) => counts.get(item.pluralLabel.trim().toLocaleLowerCase())! > 1 ? `${item.pluralLabel} (${item.apiName})` : item.pluralLabel;
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? available.filter(item =>
      `${item.pluralLabel} ${item.label} ${item.apiName}`.toLocaleLowerCase().includes(needle)) : available;
  }, [available, query]);
  const select = (apiName: string) => {
    setOpen(false); setQuery(''); setActiveIndex(0); onSelect(apiName);
  };
  const selectedObject = available.find(item => item.apiName === selected);
  const selectedLabel = selectedObject ? displayName(selectedObject) : undefined;
  return <div className="header-record-picker" ref={wrap}>
    <div className="header-record-picker-control">
      <input role="combobox" aria-label="Find record object" aria-haspopup="listbox"
        aria-autocomplete="list" aria-expanded={open} aria-controls="header-record-object-options"
        aria-activedescendant={open && matches.length ? `header-record-object-${activeIndex}` : undefined}
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
      {matches.map((item, index) => <button id={`header-record-object-${index}`} key={item.apiName} role="option" type="button"
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
  const palette = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); requestId.current++; setBusy(false); }, []);
  useModalAccessibility(open, palette, close);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);
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
  const updateQuery = (value: string) => { setQuery(value); setSearched(false); requestId.current++; setBusy(false); setResults([]); };
  const searchForm = (inPalette: boolean) => <form role="search" onSubmit={event => void performSearch(event)}>
    <button type="submit" className="global-search-submit" aria-label="Search all records"><Search size={18} /></button>
    <input ref={inPalette ? searchInput : undefined} type="search" aria-label="Global record search"
      placeholder="Search accessible records…" value={query} onChange={event => updateQuery(event.target.value)} />
  </form>;
  return <>
    <button type="button" className="global-search global-record-search palette-trigger"
      aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" onClick={() => setOpen(true)}>
      <Search size={16} aria-hidden="true" /><span>Search records and navigation</span><kbd>⌘ K</kbd>
    </button>
    {open && createPortal(<div className="palette-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <div className="palette-dialog" role="dialog" aria-modal="true" aria-label="Global search command palette" ref={palette} tabIndex={-1}>
        <div className="palette-toolbar">{searchForm(true)}<button type="button" className="icon-button" aria-label="Close search" onClick={close}><X size={18}/></button></div>
        <div className="palette-results">
          <h3>Navigation</h3>
          {objects.filter(object => `${object.pluralLabel} ${object.apiName}`.toLowerCase().includes(query.toLowerCase())).slice(0,12).map(object =>
            <button key={object.apiName} type="button" onClick={() => { updateQuery(object.pluralLabel); searchInput.current?.focus(); }}>
              <strong>{object.pluralLabel}</strong><small>{object.apiName} · Search records</small>
            </button>)}
          <h3>Records</h3>
          {query.trim().length < 2 ? <p>Enter at least two characters and press Enter to search.</p> : <>
            <p role="status">{busy ? `Searching ${checked}/${objects.length} objects…` : searched ? `${results.length} matches` : 'Press Enter to search'}</p>
            {results.map(({object,record}) => <button type="button" key={`${object.apiName}:${record.Id}`}
              onClick={() => { close(); onSelect(object.apiName, record.Id); }}>
              <strong>{String(record.Name ?? record.Email ?? record.Id)}</strong><small>{object.pluralLabel}</small>
            </button>)}
            {searched && !busy && !results.length && <p>No matching accessible records.</p>}
            {searched && !busy && failures > 0 && <p>Some objects could not be searched. Server permissions remain enforced.</p>}
          </>}
        </div>
      </div>
    </div>, document.body)}
  </>;
}
