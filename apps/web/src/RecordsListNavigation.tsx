import { Database, RefreshCw, Search } from 'lucide-react';
import { RecordObjectPicker } from './TopbarRecords';
import type { ObjectMetadata } from './metadata';

/** Shared Records heading; no tenant-specific or app-specific routing. */
export function RecordsListPageHeading({label,onRefresh}:{label:string;onRefresh:()=>void}) {
  return <div className="records-page-heading">
    <div className="record-object-icon"><Database size={18} /></div>
    <div><div className="eyebrow">OBJECT</div><h1>{label}</h1></div>
    <div className="records-heading-actions">
      <button className="btn" type="button" onClick={onRefresh}><RefreshCw size={14} />Refresh</button>
    </div>
  </div>;
}

/** Local object picker and search live on the Records page, not in global navigation. */
export function RecordsListSearchControls({
  objects, selected, label, search, onObjectSelect, onSearchChange
}: {
  objects: ObjectMetadata[];
  selected: string;
  label: string;
  search: string;
  onObjectSelect: (apiName: string) => void;
  onSearchChange: (value: string) => void;
}) {
  return <div className="records-list-context">
    <RecordObjectPicker objects={objects} selected={selected} onSelect={onObjectSelect} />
    <label className="records-search">
      <Search size={15} aria-hidden="true" />
      <input type="search" aria-label={`Search ${label} records`}
        placeholder={`Search ${label}…`} value={search}
        onChange={(event) => onSearchChange(event.target.value)} />
    </label>
  </div>;
}
