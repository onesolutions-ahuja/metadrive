import * as React from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import AcetillTerminal from './AcetillTerminal';
import {
 ACETILL_STYLE_TARGETS,validAcetillStyleValue,
 type AcetillStyleTarget,type AcetillVisualStyles
} from './visual-styles';
import './acetill-visual-editor.css';

const fields=[
 ['backgroundColor','Background colour','#FFFFFF'],
 ['color','Text colour','#222222'],
 ['width','Width','240px'],
 ['height','Height','56px'],
 ['borderColor','Border colour','#000000'],
 ['borderWidth','Border width','2px'],
 ['borderRadius','Corner radius','8px'],
 ['padding','Padding','12px'],
 ['margin','Margin','8px'],
 ['fontSize','Font size','16px'],
 ['fontWeight','Font weight','600'],
 ['opacity','Opacity','1']
] as const;
type Drag={id:AcetillStyleTarget;startX:number;startY:number;x:number;y:number};
const same=(a:AcetillVisualStyles,b:AcetillVisualStyles)=>JSON.stringify(a)===JSON.stringify(b);

export default function AcetillVisualEditor({
 onBack,onBackToPages
}:{
 onBack:()=>void;
 onBackToPages:()=>void;
}){
 const [styles,setStyles]=React.useState<AcetillVisualStyles>({});
 const [saved,setSaved]=React.useState<AcetillVisualStyles>({});
 const [selected,setSelected]=React.useState<AcetillStyleTarget>('cash');
 const [busy,setBusy]=React.useState(false);
 const [loading,setLoading]=React.useState(true);
 const [error,setError]=React.useState('');
 const [notice,setNotice]=React.useState('');
 const drag=React.useRef<Drag|null>(null);
 React.useEffect(()=>{
  let active=true;
  void apiRequest<{styles:AcetillVisualStyles}>('/apps/Acetill/visual-styles/draft')
    .then(result=>{
      if(!active)return;
      setStyles(result.styles??{});setSaved(result.styles??{});
    })
    .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load Acetill styling');})
    .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[]);
 const value=(key:string)=>styles[selected]?.[key]??'';
 const update=(key:string,next:string)=>{
   setNotice('');setError('');
   setStyles(before=>{
     const current={...(before[selected]??{})};
     if(!next)delete current[key];else current[key]=next;
     const clone={...before};
     if(Object.keys(current).length)clone[selected]=current;
     else delete clone[selected];
     return clone;
   });
 };
 const setPosition=(id:AcetillStyleTarget,x:number,y:number)=>{
   setStyles(before=>({...before,
     [id]:{...(before[id]??{}),translateX:String(Math.max(-9999,Math.min(9999,Math.round(x)))),
       translateY:String(Math.max(-9999,Math.min(9999,Math.round(y))))}
   }));
 };
 const selectElement=(event:React.PointerEvent<HTMLDivElement>)=>{
   if(loading||busy)return;
   const el=(event.target as Element).closest<HTMLElement>('[data-acetill-element]');
   if(!el||!event.currentTarget.contains(el))return;
   const id=el.dataset.acetillElement as AcetillStyleTarget;
   if(!(id in ACETILL_STYLE_TARGETS))return;
   event.preventDefault();event.stopPropagation();
   setSelected(id);setNotice('');
   drag.current={
     id,startX:event.clientX,startY:event.clientY,
     x:Number(styles[id]?.translateX??0),y:Number(styles[id]?.translateY??0)
   };
   event.currentTarget.setPointerCapture(event.pointerId);
 };
 const moveElement=(event:React.PointerEvent<HTMLDivElement>)=>{
   const d=drag.current;
   if(!d)return;
   event.preventDefault();event.stopPropagation();
   setPosition(d.id,d.x+event.clientX-d.startX,d.y+event.clientY-d.startY);
 };
 const stopMove=(event:React.PointerEvent<HTMLDivElement>)=>{
   drag.current=null;
   if(event.currentTarget.hasPointerCapture(event.pointerId))
     event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const save=async()=>{
   if(busy||loading)return;
   setBusy(true);setError('');setNotice('');
   try{
     const result=await apiRequest<{styles:AcetillVisualStyles}>('/apps/Acetill/visual-styles/draft',{
       method:'PUT',body:JSON.stringify({styles})
     });
     setStyles(result.styles);setSaved(result.styles);
     setNotice('Draft saved. Your live Acetill terminal remains unchanged.');
   }catch(e){setError(e instanceof Error?e.message:'Unable to save styles');}
   finally{setBusy(false);}
 };
 const dirty=!same(styles,saved);
 const checkExit=(action:()=>void)=>{
   if(dirty&&!window.confirm('Discard unsaved Acetill visual changes?'))return;
   action();
 };
 return <section className="acetill-visual-editor" aria-label="Edit live Acetill terminal">
   <header className="acetill-visual-toolbar">
     <div><strong>Acetill · Live visual editor</strong>
       <p>Editable draft of the real terminal. Your live terminal stays unchanged.</p></div>
     <div className="acetill-visual-actions">
       <button className="btn" type="button" onClick={()=>checkExit(onBackToPages)}>Pages</button>
       <button className="btn" type="button" onClick={()=>checkExit(onBack)}>Standard Page Builder</button>
       <button className="btn btn-brand" type="button" disabled={busy||loading||!dirty} onClick={()=>void save()}>
         {busy?'Saving…':'Save visual changes'}
       </button>
     </div>
   </header>
   {error&&<p role="alert" className="records-message">{error}</p>}
   {notice&&<p role="status" className="acetill-visual-notice">{notice}</p>}
   {loading&&<p role="status">Loading tenant styling from SQL…</p>}
   <div className="acetill-visual-layout">
     <div className="acetill-visual-stage" aria-label="Acetill actual React page - select or drag an element"
       onPointerDownCapture={selectElement} onPointerMoveCapture={moveElement}
       onPointerUpCapture={stopMove} onPointerCancelCapture={stopMove}
       onClickCapture={e=>{e.preventDefault();e.stopPropagation();}}
       onDoubleClickCapture={e=>{e.preventDefault();e.stopPropagation();}}
       onKeyDownCapture={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();}}}
       onSubmitCapture={e=>{e.preventDefault();e.stopPropagation();}}
     >
       <style>{`[data-acetill-element="${selected}"]{outline:2px solid #347bdb!important;outline-offset:2px;}`}</style>
       <AcetillTerminal editorStyles={styles}/>
     </div>
     <aside className="acetill-visual-inspector">
       <h2>Element properties</h2>
       <label htmlFor="acetill-element-picker">Selected element</label>
       <select id="acetill-element-picker" value={selected} onChange={e=>setSelected(e.target.value as AcetillStyleTarget)}>
         {Object.entries(ACETILL_STYLE_TARGETS).map(([id,label])=><option value={id} key={id}>{label}</option>)}
       </select>
       <p className="acetill-visual-help">Select an element on the live page or drag it to change its visual offset. CSS defaults remain unchanged until saved.</p>
       <div className="acetill-visual-field-list">
         {fields.map(([key,label,placeholder])=><label key={key}>{label}
           <input type="text" value={value(key)} placeholder={placeholder}
             aria-invalid={Boolean(value(key)&&!validAcetillStyleValue(key,value(key)))}
             onChange={e=>update(key,e.target.value.trim())}/>
         </label>)}
         <label>Horizontal offset (px)
           <input type="number" min={-9999} max={9999} value={value('translateX')}
             onChange={e=>update('translateX',e.target.value)}/>
         </label>
         <label>Vertical offset (px)
           <input type="number" min={-9999} max={9999} value={value('translateY')}
             onChange={e=>update('translateY',e.target.value)}/>
         </label>
       </div>
       <button className="btn" type="button" onClick={()=>{
         setStyles(prev=>{const next={...prev};delete next[selected];return next;});
       }}>Restore original styling for this element</button>
       <small>{dirty?'Unsaved changes':'No unsaved changes'}</small>
     </aside>
   </div>
 </section>;
}
