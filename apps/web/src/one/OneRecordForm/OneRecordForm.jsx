import { css, records, view, title, fire, columns } from "../shared/OneData.jsx";
function Form({p,rows}) {
  const fields=Array.isArray(p.fields)?p.fields:columns(p,rows);
  const [values,setValues]=React.useState(p.value&&typeof p.value==="object"?p.value:rows[0]||{});
  const errors=p.errors&&typeof p.errors==="object"?p.errors:{};
  return <form className="one-surface one-stack" style={{flexDirection:"column"}} onSubmit={e=>{e.preventDefault();fire(p,"submit",values);}}>
    <h3 className="one-heading">{p.title||"Details"}</h3>
    {fields.map((f,i)=>{
      const key=f.apiName||f.key||f.name||String(f), name=f.label||key, type=f.inputType||f.type||"text";
      const error=String(errors[key]??f.validationMessage??f.error??"");
      const safeKey=String(key).replace(/[^A-Za-z0-9_-]/g,"-"), fieldId="one-record-form-field-"+safeKey, errorId="one-record-form-error-"+safeKey;
      return <div key={key||i} className="one-field"><label htmlFor={fieldId} className="one-label">{name}</label>
        <input id={fieldId} className="one-control" type={["number","date","email","tel","url","time","password"].includes(type)?type:"text"} value={values[key]??""} disabled={p.disabled===true||f.readOnly===true} required={f.required===true} aria-invalid={error?"true":undefined} aria-describedby={error?errorId:undefined} aria-errormessage={error?errorId:undefined} onChange={e=>setValues(v=>({...v,[key]:type==="number"?(e.target.value===""?"":Number(e.target.value)):e.target.value}))}/>
        {error&&<small id={errorId} className="one-error" role="alert">{error}</small>}
      </div>;
    })}
    <button type="submit" className="one-btn one-btn--primary" disabled={p.disabled===true}>{p.submitLabel||"Save"}</button>
  </form>;
}
export default function OneRecordForm(p){const root=css(p),rows=records(p);return <div {...root}><Form p={p} rows={rows}/></div>;}