
function css(p){const s={'--one-accent':p.accentColor||'#3176cc','--one-radius':Math.max(0,Number(p.radius??16))+'px','--one-pad':Math.max(0,Number(p.padding??16))+'px','--one-gap':Math.max(0,Number(p.gap??12))+'px','--one-blur':Math.min(20,Math.max(0,Number(p.glassBlur??8)))+'px',width:p.width||'100%'};if(p.backgroundColor)s['--one-bg']=p.backgroundColor;if(p.textColor)s['--one-fg']=p.textColor;if(p.borderColor)s['--one-border']=p.borderColor;return {className:'one-ui one-ui--'+(p.theme||'glass')+' one-ui--'+(p.size||'medium')+(p.hideOnPhone?' one-hidden-mobile':''),style:s};}
function fire(p,event,value){if(typeof p.onChange==='function')p.onChange(value);if(typeof p.onAction==='function')p.onAction({event,value});}
const list=v=>Array.isArray(v)?v:typeof v==='string'?v.split(',').map(s=>s.trim()).filter(Boolean):[];
function normalizeChoice(o){return typeof o==='object'&&o!==null?{label:String(o.label??o.name??o.value??''),value:String(o.value??o.id??o.Id??o.label??'')}:{label:String(o),value:String(o)};}
export default function OneInputs(p){
 const kind=p.kind||'Input',root=css(p),[local,setLocal]=React.useState(p.value??p.defaultValue??(kind==='Toggle'?false:'')),[filter,setFilter]=React.useState('');
 const current=p.value!==undefined?p.value:local;
 const set=value=>{setLocal(value);fire(p,'change',value)};
 const label=p.label||kind;
 const wrap=child=><div {...root}><label className="one-label">{label}{child}{p.helpText&&<small>{p.helpText}</small>}</label></div>;
 const options=list(p.options||p.choices).map(normalizeChoice);
 if(kind==='Input'){const typ=p.inputType||'text';const htmlType=typ==='currency'||typ==='percent'?'number':typ==='barcode'?'text':typ;return wrap(<input className="one-control" type={htmlType} placeholder={p.placeholder||''} value={current??''} required={p.required===true} disabled={p.disabled===true} min={p.min} max={p.max} step={p.step} onChange={e=>set(['number','currency','percent'].includes(typ)?(e.target.value===''?'':Number(e.target.value)):e.target.value)}/>);}
 if(kind==='Toggle')return <div {...root}><label className="one-row"><input role="switch" type="checkbox" checked={Boolean(current)} disabled={p.disabled===true} onChange={e=>set(e.target.checked)}/>{label}</label></div>;
 if(kind==='Slider')return wrap(<div className="one-row"><input style={{flex:1,accentColor:'var(--one-accent)'}} type="range" min={p.min??0} max={p.max??100} step={p.step??1} value={Number(current)||0} disabled={p.disabled===true} onChange={e=>set(Number(e.target.value))}/><output>{String(current??0)}</output></div>);
 if(kind==='Choice'){
  const mode=p.mode||'select',chosen=Array.isArray(current)?current.map(String):current==null?'':String(current);
  const toggle=v=>set(Array.isArray(chosen)?chosen.includes(v)?chosen.filter(x=>x!==v):[...chosen,v]:v);
  if(mode==='multiple')return wrap(<select className="one-control" multiple value={Array.isArray(chosen)?chosen:[]} onChange={e=>set(Array.from(e.target.selectedOptions,x=>x.value))}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>);
  if(mode==='select')return wrap(<select className="one-control" value={typeof chosen==='string'?chosen:''} onChange={e=>set(e.target.value)}><option value="">Select</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>);
  return <fieldset {...root} style={{...root.style,border:0,padding:0}}><legend>{label}</legend><div className="one-row">{options.map(o=><label className={mode==='segmented'?'one-btn':'one-row'} key={o.value}><input type={mode==='checkbox'?'checkbox':'radio'} name={p.name||label} value={o.value} checked={Array.isArray(chosen)?chosen.includes(o.value):chosen===o.value} onChange={()=>toggle(o.value)}/>{o.label}</label>)}</div></fieldset>;
 }
 if(kind==='Lookup'){
  const all=list(p.records||p.options),filtered=all.filter(v=>String(typeof v==='object'?(v.Name??v.name??v.label??''):v).toLowerCase().includes(filter.toLowerCase())).slice(0,50);
  return <div {...root}><label className="one-label">{label}<input className="one-control" type="search" placeholder={p.placeholder||'Find record'} value={filter} onChange={e=>setFilter(e.target.value)} /></label><div role="listbox" className="one-surface" style={{maxHeight:180,overflowY:'auto',marginTop:6}}>{filtered.map((v,i)=>{const id=String(typeof v==='object'?(v.Id??v.id??v.value??i):v),txt=String(typeof v==='object'?(v.Name??v.name??v.label??id):v);return <button key={id} className="one-btn one-btn--ghost" type="button" role="option" aria-selected={current===id} style={{width:'100%',justifyContent:'start'}} onClick={()=>{set(id);setFilter(txt)}}>{txt}</button>})}{filtered.length===0&&<span className="one-muted">No matches</span>}</div></div>;
 }
 if(kind==='FileUpload')return wrap(<input className="one-control" type="file" accept={p.accept||undefined} multiple={p.multiple===true} disabled={p.disabled===true} onChange={e=>{const files=Array.from(e.target.files||[]).map(f=>({name:f.name,size:f.size,type:f.type}));setLocal(files);if(typeof p.onAction==='function')p.onAction({event:'fileSelected',value:files});}}/>);
 if(kind==='Repeater'){
  const rows=Array.isArray(current)?current:[];
  return <div {...root}><div className="one-row" style={{justifyContent:'space-between'}}><strong>{label}</strong><button className="one-btn" type="button" onClick={()=>set([...rows,''])}>+ Add</button></div><div className="one-stack" style={{flexDirection:'column',marginTop:8}}>{rows.map((item,i)=><div className="one-row" key={i}><input className="one-control" style={{flex:1}} value={typeof item==='string'?item:JSON.stringify(item)} onChange={e=>set(rows.map((r,j)=>j===i?e.target.value:r))}/><button className="one-btn" aria-label={'Remove row '+(i+1)} onClick={()=>set(rows.filter((_,j)=>j!==i))}>×</button></div>)}</div></div>;
 }
 return null;
}
