import { useOneInputs, css, fire, list, normalizeChoice } from "../shared/OneInputs.jsx";
export default function OneInput(props) {
  const p={...props,kind:props.kind||"Input"};
  const {kind,root,local,setLocal,filter,setFilter,current,set,label,wrap,options}=useOneInputs(p);
  const generatedId=React.useId();
  const typ=p.inputType||"text";
  const acceptedTypes=["text","email","password","number","currency","percent","date","time","datetime-local","tel","url","search","barcode"];
  const htmlType=typ==="currency"||typ==="percent"?"number":typ==="barcode"?"text":acceptedTypes.includes(typ)?typ:"text";
  const inputValue=e=>set(["number","currency","percent"].includes(typ)?e.target.value===""?(p.emptyNumberAsUndefined?undefined:""):Number(e.target.value):e.target.value);
  const errorId=p.validationMessage?(String(p.inputId||generatedId).replace(/[^A-Za-z0-9_-]/g,"")+"-error"):undefined;
  const describedBy=[p.helpId,errorId].filter(Boolean).join(" ")||undefined;
  const constraints={value:current??"",required:p.required===true,disabled:p.disabled===true,minLength:p.minLength,maxLength:p.maxLength,pattern:p.pattern,id:p.inputId,"aria-describedby":describedBy,"aria-invalid":p.validationMessage?"true":undefined,"aria-errormessage":errorId,autoComplete:p.autoComplete,onChange:inputValue};
  return wrap(<>{p.multiline===true?<textarea className="one-control" placeholder={p.placeholder||""} rows={Math.max(1,Math.min(20,Number(p.rows)||2))} {...constraints}/>:<input className="one-control" type={htmlType} placeholder={p.placeholder||""} min={p.min} max={p.max} step={p.step} title={p.validationMessage} {...constraints}/>}
    {p.validationMessage&&<small id={errorId} className="one-error" role="alert">{String(p.validationMessage)}</small>}</>);
}