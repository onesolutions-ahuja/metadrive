import { useId, useRef, useState } from 'react';
import { AtSign, Search, X } from 'lucide-react';
import type { FieldMetadata, FlowDefinitionMetadata, ObjectMetadata } from './metadata';
import { flowReferenceChoices, referenceName } from './builders/flowReferenceCatalog';
import './FlowReferenceInput.css';

type Props = {
  value: string;
  onChange: (value:string)=>void;
  flow: FlowDefinitionMetadata;
  elementId: number;
  objects: readonly ObjectMetadata[];
  field?: FieldMetadata;
  ariaLabel: string;
  placeholder?: string;
  multiline?: boolean;
};

/** Shared no-code value editor for Flow conditions, assignments and record filters. */
export default function FlowReferenceInput({value,onChange,flow,elementId,objects,field,ariaLabel,placeholder,multiline=false}:Props) {
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const id=useId();
  const container=useRef<HTMLDivElement>(null);
  const choices=flowReferenceChoices(flow,elementId,objects,field);
  const selected=choices.find(choice=>choice.reference===value);
  const path=referenceName(value);
  const badReference=Boolean(path&&!selected)
    || /^@(?:[A-Za-z_$][A-Za-z0-9_$]*)(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?$/.test(value.trim());
  const groups:FlowReferenceInputGroups= { 'Earlier steps':[], 'Flow inputs and variables':[], 'Trigger record':[] };
  for(const choice of choices)if((choice.label+' '+choice.detail).toLowerCase().includes(search.toLowerCase()))
    groups[choice.category].push(choice);
  return <div className="flow-reference-input" ref={container} onBlur={event=>{
    if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);
  }}>
    <div className={'flow-reference-input-row'+(selected?' is-valid':'')+(badReference?' is-invalid':'')}>
      {multiline ? <textarea className="form-control" rows={4} aria-label={ariaLabel}
          placeholder={placeholder??'Enter text or choose a Flow reference'} value={value}
          onChange={event=>onChange(event.target.value)} aria-invalid={badReference}/>
        : <input className="form-control" aria-label={ariaLabel}
          placeholder={placeholder??'Enter a value or choose a Flow reference'} value={value}
          onChange={event=>onChange(event.target.value)} aria-invalid={badReference}/>} 
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={'Choose reference for '+ariaLabel}
        title="Choose a previous record or Flow variable" onClick={()=>{setSearch('');setOpen(!open)}}>
        <AtSign size={16}/>
      </button>
    </div>
    {selected && <small className="flow-reference-value-hint">Linked: {selected.detail}</small>}
    {badReference && <small className="flow-reference-error" role="status">
      Unknown, incompatible or unavailable Flow reference. Choose from the picker or enter a literal value.
    </small>}
    {open && <div className="flow-reference-dropdown" id={id} role="group" aria-label={ariaLabel+' reference choices'}>
      <label className="flow-reference-search"><Search size={14}/>
        <input autoFocus aria-label={'Search references for '+ariaLabel} value={search}
          onChange={event=>setSearch(event.target.value)} placeholder="Search previous steps, records and variables"/>
        <button type="button" aria-label="Close reference picker" onClick={()=>setOpen(false)}><X size={14}/></button>
      </label>
      <div className="flow-reference-results">
        {(Object.keys(groups) as Array<keyof FlowReferenceInputGroups>).map(group=>groups[group].length
          ? <div key={group}><p className="flow-reference-group">{group}</p>
            {groups[group].map(option=><button type="button" key={option.reference}
              className="flow-reference-option" onClick={()=>{onChange(option.reference);setOpen(false)}}>
              <strong>{option.label}</strong><small>{option.detail}</small>
            </button>)}
          </div>:null)}
        {!Object.values(groups).some(items=>items.length)&&<p className="flow-reference-empty">No compatible references. Add an input resource or connect a Get Records step before this element.</p>}
      </div>
      <div className="flow-reference-foot">References use existing Flow syntax and are checked on activation.</div>
    </div>}
  </div>;
}
type FlowReferenceInputGroups=Record<'Earlier steps'|'Flow inputs and variables'|'Trigger record',
  ReturnType<typeof flowReferenceChoices>>;
