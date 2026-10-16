
function css(p){const s={'--one-accent':p.accentColor||'#3176cc','--one-radius':Math.max(0,Number(p.radius??16))+'px','--one-pad':Math.max(0,Number(p.padding??16))+'px','--one-gap':Math.max(0,Number(p.gap??12))+'px','--one-blur':Math.min(20,Math.max(0,Number(p.glassBlur??8)))+'px',width:p.width||'100%'};if(p.backgroundColor)s['--one-bg']=p.backgroundColor;if(p.textColor)s['--one-fg']=p.textColor;if(p.borderColor)s['--one-border']=p.borderColor;if(p.height&&p.height!=='auto')s.height=p.height;return {className:'one-ui one-ui--'+(p.theme||'glass')+' one-ui--'+(p.size||'medium')+(p.hideOnPhone?' one-hidden-mobile':''),style:s};}
const records=p=>Array.isArray(p.records)?p.records:Array.isArray(p.items)?p.items:Array.isArray(p.data)?p.data:[];
const view=v=>v==null?'':typeof v==='object'?JSON.stringify(v):String(v);
const title=r=>view(r?.label??r?.title??r?.Name??r?.name??r?.id??'Record');
function fire(p,event,value){if(typeof p.onAction==='function')return p.onAction({event,value});}
function columns(p,rows){const choices=Array.isArray(p.columns)?p.columns:typeof p.columns==='string'?p.columns.split(',').map(s=>s.trim()).filter(Boolean):[];return choices.length?choices.map(v=>typeof v==='string'?{key:v,label:v}:{key:v.key??v.apiName??v.fieldApiName,label:v.label??v.key??v.apiName}):Object.keys(rows[0]||{}).filter(x=>!x.startsWith('_')).slice(0,8).map(k=>({key:k,label:k}));}
function Table({p,rows}){
 const [sort,setSort]=React.useState(''),[dir,setDir]=React.useState(1),[page,setPage]=React.useState(1),[local,setLocal]=React.useState('');
 const cols=columns(p,rows),size=Math.max(1,Math.min(200,Number(p.pageSize)||25));
 const sorted=sort?[...rows].sort((a,b)=>view(a[sort]).localeCompare(view(b[sort]),undefined,{numeric:true})*dir):rows;
 const max=Math.max(1,Math.ceil(sorted.length/size)),multi=p.multiselect===true,selectable=p.selectionMode===true;
 const selected=selectable?(Array.isArray(p.value)?p.value.map(String):p.value?[String(p.value)]:[]):[String(local)];
 const choose=(row)=>{const id=String(row.Id??row.id??'');if(!id)return;
  if(selectable){const value=multi?(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]):(selected.includes(id)?'':id);p.onChange?.(value);fire(p,'selectionChange',value);}
  else{setLocal(id);fire(p,'rowSelect',row);}
 };
 return <div className="one-surface"><div className="one-table-wrapper"><table className="one-table"><thead><tr>{selectable&&<th scope="col">Select</th>}{cols.map(c=><th key={c.key} scope="col"><button type="button" className="one-btn one-btn--ghost" style={{padding:2,minHeight:0}} onClick={()=>{setDir(sort===c.key?-dir:1);setSort(c.key)}}>{c.label} {sort===c.key?(dir===1?'↑':'↓'):''}</button></th>)}</tr></thead><tbody>{sorted.slice((Math.min(page,max)-1)*size,Math.min(page,max)*size).map((row,i)=>{const id=String(row.Id??row.id??'');return <tr key={id||i} data-selected={selected.includes(id)} onClick={!selectable?()=>choose(row):undefined}>{selectable&&<td><input type={multi?'checkbox':'radio'} name={multi?undefined:p.inputId} aria-label={'Select '+title(row)} aria-required={p.required===true} required={p.required===true&&!multi} checked={selected.includes(id)} disabled={!id} onChange={()=>choose(row)}/></td>}{cols.map(c=><td key={c.key}>{view(row[c.key])}</td>)}</tr>})}</tbody></table></div>{rows.length===0&&<div className="one-empty">No records</div>}{rows.length>size&&<div className="one-row" style={{justifyContent:'flex-end',paddingTop:10}}><button type="button" className="one-btn" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><span>{Math.min(page,max)} / {max}</span><button type="button" className="one-btn" disabled={page>=max} onClick={()=>setPage(page+1)}>Next</button></div>}</div>;
}
function Form({p,rows}){const fields=Array.isArray(p.fields)?p.fields:columns(p,rows);const [values,setValues]=React.useState(p.value&&typeof p.value==='object'?p.value:rows[0]||{});return <form className="one-surface one-stack" style={{flexDirection:'column'}} onSubmit={e=>{e.preventDefault();fire(p,'submit',values)}}><h3 className="one-heading">{p.title||'Details'}</h3>{fields.map((f,i)=>{const key=f.apiName||f.key||f.name||String(f),name=f.label||key,type=f.inputType||f.type||'text';return <label key={key||i} className="one-label">{name}<input className="one-control" type={['number','date','email','tel','url','time','password'].includes(type)?type:'text'} value={values[key]??''} disabled={p.disabled===true||f.readOnly===true} required={f.required===true} onChange={e=>setValues(v=>({...v,[key]:type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value}))}/></label>})}<button type="submit" className="one-btn one-btn--primary" disabled={p.disabled===true}>{p.submitLabel||'Save'}</button></form>}
function Chart({p,rows}){const entries=rows.slice(0,16).map((r,i)=>({name:view(r.label??r.name??r.Name??r.x??i+1),n:Number(r.value??r.count??r.y??0)||0}));const max=Math.max(1,...entries.map(x=>Math.abs(x.n))),type=p.chartType||'bar';if(!entries.length)return <div className="one-empty">No chart data</div>;if(type==='donut'){const total=entries.reduce((s,x)=>s+Math.max(0,x.n),0)||1;let acc=0;const circles=entries.map((e,i)=>{const pct=100*Math.max(0,e.n)/total,offset=-acc;acc+=pct;return <circle key={i} cx="50" cy="50" r="36" fill="none" stroke={i%2?'#83bbdc':'var(--one-accent)'} strokeWidth="18" strokeDasharray={pct+' '+(100-pct)} strokeDashoffset={offset} pathLength="100" transform="rotate(-90 50 50)"/>});return <svg width="100%" viewBox="0 0 100 100" role="img" aria-label={p.label||'Donut chart'}>{circles}<text x="50" y="53" textAnchor="middle" fontSize="10" fill="currentColor">{view(p.title||'Total')}</text></svg>;}
 const points=entries.map((x,i)=>[(i+.5)*320/entries.length,170-Math.max(0,x.n)*145/max]);return <svg viewBox="0 0 320 210" width="100%" role="img" aria-label={p.label||'Data chart'}>{type==='line'?<polyline fill="none" stroke="var(--one-accent)" strokeWidth="3" points={points.map(q=>q.join(',')).join(' ')}/>:entries.map((x,i)=><rect key={i} x={i*320/entries.length+3} y={points[i][1]} width={Math.max(3,320/entries.length-6)} height={170-points[i][1]} rx="3" fill="var(--one-accent)"/>)}{entries.map((e,i)=><text key={i} x={(i+.5)*320/entries.length} y="192" textAnchor="middle" fontSize="8" fill="currentColor">{e.name.slice(0,12)}</text>)}</svg>}
function Calendar({p,rows}){
 const [date,setDate]=React.useState(()=>new Date());
 const [selected,setSelected]=React.useState('');
 const y=date.getFullYear(),m=date.getMonth(),days=new Date(y,m+1,0).getDate(),first=new Date(y,m,1).getDay();
 const startKey=p.startFieldApiName||p.dateFieldApiName||'date';
 const endKey=p.endFieldApiName||'end';
 const titleKey=p.titleFieldApiName||'Name';
 const zone=p.timeZone||undefined;
 const keyOf=value=>{
  if(value==null||value==='')return '';
  const raw=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const parsed=new Date(raw);
  if(!Number.isFinite(parsed.getTime()))return /^\d{4}-\d{2}-\d{2}/.test(raw)?raw.slice(0,10):'';
  try{
   const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed);
   const part=k=>parts.find(x=>x.type===k)?.value;
   return part('year')+'-'+part('month')+'-'+part('day');
  }catch{return raw.slice(0,10)}
 };
 const eventDate=row=>keyOf(row[startKey]??row.StartDateTime??row.start??row.date);
 const eventTitle=row=>view(row[titleKey]??row.Name??row.label??row.title??'Appointment');
 const all=rows.filter(row=>Boolean(eventDate(row)));
 const eventsFor=day=>all.filter(row=>eventDate(row)===day);
 const monthKey=n=>y+'-'+String(m+1).padStart(2,'0')+'-'+String(n).padStart(2,'0');
 const active=selected&&selected.startsWith(y+'-'+String(m+1).padStart(2,'0')+'-')?selected:monthKey(date.getDate()>days?days:date.getDate());
 const viewMode=['month','week','day','agenda'].includes(p.view)?p.view:'month';
 const move=n=>{setDate(new Date(y,m+n,1));setSelected('')};
 const select=day=>{setSelected(day);fire(p,'dateSelect',{date:day,events:eventsFor(day)})};
 const formatTime=value=>{
  const parsed=new Date(value);
  if(!Number.isFinite(parsed.getTime()))return '';
  try{return new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',timeZone:zone}).format(parsed)}
  catch{return ''}
 };
 const dayRows=(day)=>eventsFor(day).map((event,i)=><button type="button" key={String(event.Id??event.id??i)}
   className="one-btn one-btn--ghost" style={{display:'flex',width:'100%',textAlign:'left',gap:10,justifyContent:'start'}}
   onClick={()=>fire(p,'eventSelect',event)}>
    <span>{formatTime(event[startKey]??event.StartDateTime??event.start)}</span>
    <span>{eventTitle(event)}</span>
    {event[endKey]!=null&&<span className="one-muted">– {formatTime(event[endKey])}</span>}
   </button>);
 const weekDates=()=>{
  const d=new Date(active+'T12:00:00');const w=d.getDay();d.setDate(d.getDate()-w);
  return Array.from({length:7},(_,i)=>{const t=new Date(d);t.setDate(d.getDate()+i);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0')});
 };
 return <div className="one-surface">
  <div className="one-row" style={{justifyContent:'space-between'}}>
   <button className="one-btn" type="button" onClick={()=>move(-1)} aria-label="Previous month">‹</button>
   <strong>{date.toLocaleString(undefined,{month:'long',year:'numeric'})}</strong>
   <button className="one-btn" type="button" onClick={()=>move(1)} aria-label="Next month">›</button>
  </div>
  {viewMode==='month'&&<div className="one-grid" style={{gridTemplateColumns:'repeat(7,minmax(0,1fr))',gap:4,marginTop:8}}>
   {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><strong key={d} style={{textAlign:'center'}}>{d}</strong>)}
   {Array.from({length:first},(_,i)=><span key={'blank'+i}/>)}
   {Array.from({length:days},(_,i)=>{const ds=monthKey(i+1),events=eventsFor(ds);return <button key={ds}
    type="button" className="one-btn one-btn--ghost" aria-pressed={active===ds}
    style={{minWidth:0,padding:4,display:'flex',flexDirection:'column',background:active===ds?'var(--one-border)':undefined}}
    title={events.map(eventTitle).join(', ')} onClick={()=>select(ds)}>
    <span>{i+1}</span>{events.length>0&&<span className="one-dot" aria-label={events.length+' events'}/>}
   </button>})}
  </div>}
  {(viewMode==='day'||viewMode==='month')&&<div style={{marginTop:12}}>
   <strong>Appointments · {active}</strong>{dayRows(active)}
   {eventsFor(active).length===0&&<div className="one-muted">No scheduled appointments</div>}
  </div>}
  {viewMode==='week'&&<div className="one-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',marginTop:12}}>
   {weekDates().map(ds=><section key={ds} className="one-item">
    <button type="button" className="one-btn one-btn--ghost" onClick={()=>select(ds)}>{ds}</button>
    {dayRows(ds)}
   </section>)}
  </div>}
  {viewMode==='agenda'&&<div style={{marginTop:12}}>
   {all.filter(row=>eventDate(row).startsWith(y+'-'+String(m+1).padStart(2,'0')+'-'))
    .sort((a,b)=>String(a[startKey]??a.StartDateTime??'').localeCompare(String(b[startKey]??b.StartDateTime??'')))
    .map((row,i)=><section key={String(row.Id??row.id??i)} className="one-item">
     <button type="button" className="one-btn one-btn--ghost" onClick={()=>fire(p,'eventSelect',row)}>
      {eventDate(row)} {formatTime(row[startKey]??row.StartDateTime)} — {eventTitle(row)}
     </button>
    </section>)}
  </div>}
 </div>;
}
function Board({p,rows}){const field=p.groupField||'status',groups=Array.isArray(p.groups)?p.groups:[...new Set(rows.map(x=>view(x[field]||'Unassigned')))];return <div className="one-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))'}}>{groups.map(g=><section className="one-surface" key={String(g)}><strong>{view(g)}</strong><div className="one-stack" style={{flexDirection:'column',marginTop:10}}>{rows.filter(r=>view(r[field]||'Unassigned')===String(g)).map((r,i)=><button className="one-item one-item--interactive" type="button" key={r.Id??r.id??i} onClick={()=>fire(p,'itemSelect',r)}>{title(r)}</button>)}</div></section>)}</div>}
function Timeline({p,rows}){return <div className="one-surface">{rows.map((r,i)=><div className="one-row" key={r.Id??r.id??i} style={{padding:'12px 0',borderBottom:'1px solid var(--one-border)',alignItems:'start'}}><span className="one-dot"/><div><strong>{title(r)}</strong><div className="one-muted">{view(r[p.dateField||'date']??r.createdAt??'')}</div><div>{view(r.description??'')}</div></div></div>)}{!rows.length&&<div className="one-empty">No activity</div>}</div>}
function ItemGrid({p,rows}){const count=Math.max(1,Math.min(8,Number(p.desktopColumns)||3));return <section><h3 className="one-heading" style={{marginBottom:12}}>{p.title||'Items'}</h3><div className="one-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,180px),1fr))'}}>{rows.map((r,i)=><button className="one-item one-item--interactive" key={r.Id??r.id??i} type="button" onClick={()=>fire(p,'itemSelect',r)}>{typeof r.imageUrl==='string'&&/^https:\/\//.test(r.imageUrl)&&<img loading="lazy" src={r.imageUrl} alt={title(r)} style={{maxWidth:'100%',aspectRatio:'1',objectFit:'contain'}}/>}<strong style={{display:'block'}}>{title(r)}</strong>{r.price!=null&&<span>{view(r.price)}</span>}</button>)}</div>{!rows.length&&<div className="one-empty">No items</div>}</section>}
function TreeNode({node,p,depth=0}){const [open,setOpen]=React.useState(true);const kids=Array.isArray(node.children)?node.children:[];return <div style={{paddingLeft:depth?14:0}}><div className="one-row"><button type="button" className="one-btn one-btn--ghost" style={{minHeight:28,padding:2}} onClick={()=>{if(kids.length)setOpen(!open);else fire(p,'select',node)}} aria-expanded={kids.length?open:undefined}>{kids.length?(open?'▾':'▸'):'•'} {title(node)}</button></div>{open&&kids.map((kid,i)=><TreeNode key={kid.Id??kid.id??i} node={kid} p={p} depth={depth+1}/>)}</div>}
function Document({p}){const url=p.src||p.url||p.documentUrl,valid=typeof url==='string'&&/^https:\/\//i.test(url);if(!valid)return <div className="one-empty">Select a document</div>;const isImage=/\.(png|jpe?g|webp|gif)(?:[?#]|$)/i.test(url);return <section className="one-surface"><h3 className="one-heading">{p.title||'Document'}</h3>{isImage?<img src={url} alt={p.title||'Document'} className="one-file-preview" loading="lazy" />:<iframe src={url} title={p.title||'Document'} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{display:'block',width:'100%',height:Math.max(200,Number(p.viewerHeight)||380),border:0}}/>}</section>}
function Conversation({p,rows}){const [message,setMessage]=React.useState('');return <section className="one-surface"><div aria-live="polite" style={{minHeight:120,maxHeight:380,overflowY:'auto'}}>{rows.map((r,i)=><div className={'one-message'+(r.mine||r.outbound?' one-message--me':'')} key={r.Id??r.id??i}><div className="one-muted">{view(r.sender??r.author??'')}</div>{view(r.body??r.text??r.message??'')}</div>)}{!rows.length&&<div className="one-empty">No messages</div>}</div><form className="one-row" onSubmit={e=>{e.preventDefault();if(!message.trim())return;fire(p,'send',{body:message.trim()});setMessage('')}}><input className="one-control" style={{flex:1}} aria-label="Message" placeholder={p.placeholder||'Write a message…'} value={message} onChange={e=>setMessage(e.target.value)}/><button className="one-btn one-btn--primary" type="submit" disabled={!message.trim()}>Send</button></form></section>}
function Dashboard({p,rows}){return <section className="one-surface"><h3 className="one-heading">{p.title||'Dashboard'}</h3><div className="one-grid" style={{gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',marginTop:12}}>{rows.map((r,i)=><div className="one-item" key={r.id??i}><div className="one-muted">{title(r)}</div><div className="one-metric">{view(r.value??r.count??'')}</div></div>)}</div>{!rows.length&&<div className="one-empty">Bind dashboard widgets or records</div>}</section>}
export default function OneData(p){const root=css(p),rows=records(p),kind=p.kind||'Table';let content=null;switch(kind){case'Table':content=<Table p={p} rows={rows}/>;break;case'RecordForm':content=<Form p={p} rows={rows}/>;break;case'Chart':content=<div className="one-surface"><Chart p={p} rows={rows}/></div>;break;case'Calendar':content=<Calendar p={p} rows={rows}/>;break;case'Board':content=<Board p={p} rows={rows}/>;break;case'Timeline':content=<Timeline p={p} rows={rows}/>;break;case'ItemGrid':content=<ItemGrid p={p} rows={rows}/>;break;case'Tree':content=<div className="one-surface">{rows.map((r,i)=><TreeNode key={r.Id??r.id??i} node={r} p={p}/>)}</div>;break;case'DocumentViewer':content=<Document p={p}/>;break;case'Conversation':content=<Conversation p={p} rows={rows}/>;break;case'DashboardEmbed':content=<Dashboard p={p} rows={rows}/>;break;default:content=null;}return <div {...root}>{content}</div>}
