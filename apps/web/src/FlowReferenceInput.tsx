import { useId, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import type { FieldMetadata, FlowDefinitionMetadata, ObjectMetadata } from './metadata';
import { compatibleFlowValue, flowReferenceChoices, referenceName } from './builders/flowReferenceCatalog';
import { flowReferenceBrowserGroups } from './builders/flowReferenceBrowserModel';
import ReferenceBrowser from './ReferenceBrowser';
import './FlowReferenceInput.css';

type Props = {
  value: string;
  onChange: (value:string)=>void;
  flow: FlowDefinitionMetadata;
  elementId: number;
  objects: readonly ObjectMetadata[];
  field?: FieldMetadata;
  targetObjectApiName?: string;
  ariaLabel: string;
  placeholder?: string;
  multiline?: boolean;
};

/** Flow values use the existing {!Resource.Field} runtime syntax; @ is only the no-code entry point. */
export default function FlowReferenceInput({
  value,onChange,flow,elementId,objects,field,targetObjectApiName,ariaLabel,placeholder,multiline=false
}:Props) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const id=useId();
  const container=useRef<HTMLDivElement>(null);
  // Always browse the full Object metadata. Keep incompatible fields visible with a reason.
  const catalog=flowReferenceChoices(flow,elementId,objects);
  const selected=catalog.find(choice=>choice.reference===value &&
    compatibleFlowValue(choice,field,targetObjectApiName) && !choice.unavailableReason);
  const path=referenceName(value);
  const badReference=Boolean(path&&!selected) ||
    (!open && /^@[A-Za-z_$][A-Za-z0-9_$.]*$/.test(value.trim()));
  const {groups,directOptions}=flowReferenceBrowserGroups(flow,elementId,objects,field,targetObjectApiName);
  const pick=(reference:string)=>{onChange(reference);setOpen(false);setSearch('')};
  const update=(next:string)=>{
    onChange(next);
    if(next.trim().startsWith('@')){setSearch(next.trim().slice(1));setOpen(true);}
  };
  return <div className="flow-reference-input" ref={container}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
    <div className={'flow-reference-input-row'+(selected?' is-valid':'')+(badReference?' is-invalid':'')}>
      {multiline
        ?<textarea className="form-control" rows={4} aria-label={ariaLabel}
          placeholder={placeholder??'Enter text or type @ for a reference'} value={value}
          onChange={event=>update(event.target.value)} aria-invalid={badReference}/>
        :<input className="form-control" aria-label={ariaLabel}
          placeholder={placeholder??'Enter a value or type @ for a reference'} value={value}
          onChange={event=>update(event.target.value)} aria-invalid={badReference}/>}
      <button type="button" aria-expanded={open} aria-controls={id}
        aria-label={'Choose reference for '+ariaLabel} title="Browse Flow records and Object fields"
        onClick={()=>{setSearch('');setOpen(!open)}}><AtSign size={16}/></button>
    </div>
    {selected && <small className="flow-reference-value-hint">Linked: {selected.detail}</small>}
    {badReference && <small className="flow-reference-error" role="status">
      Unknown, incompatible or unavailable reference. Browse @ to select a valid record field.
    </small>}
    {open && <ReferenceBrowser id={id} groups={groups}
      directOptions={directOptions} query={search} onQueryChange={setSearch}
      onChoose={pick} onClose={()=>setOpen(false)}
      emptyHint="No matching available resource. Check the Loop collection, selected Object, relationship metadata and Get Records fields to store."/>}
  </div>;
}
