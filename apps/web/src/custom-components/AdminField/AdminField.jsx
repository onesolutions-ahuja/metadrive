/** Shared trusted field renderer. Data writes remain in the authorised administration screen. */
export default function AdminField({label,value='',disabled=false,required=false,placeholder='',helpText='',description='',multiline=false,rows=2,inputType='text',maxLength,minLength,pattern,autoComplete,onChange}) {
 const props={className:'form-control',value,disabled,required,placeholder,maxLength,minLength,pattern,'aria-label':label,
  onChange:event=>onChange?.(event.target.value)};
 return <label className="form-label">
  {label}
  {multiline?<textarea {...props} rows={rows}/>:<input {...props} type={inputType} autoComplete={autoComplete}/>}
  {description?<span className="form-description">{description}</span>:null}
  {helpText?<small className="form-help">{helpText}</small>:null}
 </label>;
}
