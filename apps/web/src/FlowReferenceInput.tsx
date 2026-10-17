import { useId, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import type { FieldMetadata, FlowDefinitionMetadata, ObjectMetadata } from './metadata';
import { compatibleFlowValue, flowReferenceChoices, referenceName } from './builders/flowReferenceCatalog';
import ReferenceBrowser, { type ReferenceGroup, type ReferenceOption } from './ReferenceBrowser';
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
  const groups=new Map<string,ReferenceGroup>();
  const directOptions:ReferenceOption[]=[];
  for(const choice of catalog){
    const token=referenceName(choice.reference);
    if(!token)continue;
    const parts=token.split('.');
    const compatible=compatibleFlowValue(choice,field,targetObjectApiName);
    const option:ReferenceOption={
      reference:choice.reference,
      label:parts.length>1?choice.label.split(' → ').slice(1).join(' → ')||parts.at(-1)!:choice.label,
      detail:choice.detail,
      dataType:choice.dataType,
      disabled:!compatible||Boolean(choice.unavailableReason),
      reason:choice.unavailableReason||(!compatible?'Incompatible with the selected target field type or relationship.':undefined)
    };
    if(parts.length===1){directOptions.push(option);continue;}
    const root=parts[0];
    if(!groups.has(root)){
      const stepName=choice.label.split(' → ')[0];
      groups.set(root,{path:root,label:root,detail:stepName===root
        ?choice.category:stepName+' · '+choice.category,options:[]});
    }
    groups.get(root)!.options.push(option);
  }
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
    {open && <ReferenceBrowser id={id} groups={[...groups.values()]}
      directOptions={directOptions} query={search} onQueryChange={setSearch}
      onChoose={pick} onClose={()=>setOpen(false)}
      emptyHint="No matching available resource. Check the Loop collection, selected Object, relationship metadata and Get Records fields to store."/>}
  </div>;
}
