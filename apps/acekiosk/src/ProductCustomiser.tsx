import * as React from 'react';
import {useState} from 'react';
export type OptionGroup={
 id:string;
 label:string;
 required?:boolean;
 choices:Array<{id:string;label:string;description?:string}>;
};
export type Selection={groupId:string;choiceId:string};
export default function ProductCustomiser({name,image,groups,onCancel,onAdd}:{
 name:string;image:string;groups:OptionGroup[];
 onCancel:()=>void;onAdd:(selections:Selection[])=>void;
}){
 const [selected,setSelected]=useState<Record<string,string>>({});
 const valid=groups.every(group=>!group.required||Boolean(selected[group.id]));
 return <div className="ak-modal-backdrop" role="presentation">
   <section className="ak-modal" role="dialog" aria-modal="true" aria-labelledby="ak-custom-title">
     <div className="ak-modal-top"><button type="button" onClick={onCancel}>← Menu</button><span>CUSTOMISE YOUR ORDER</span></div>
     <div className="ak-modal-body">{image&&<img className="ak-modal-image" src={image} alt=""/>}
       <h2 id="ak-custom-title">{name}</h2>
       {groups.map(group=><fieldset key={group.id} className="ak-options"><legend>{group.label}{group.required?' *':''}</legend>
         {group.choices.map(choice=><label key={choice.id} className={selected[group.id]===choice.id?'ak-option selected':'ak-option'}>
           <input type="radio" name={group.id} value={choice.id} checked={selected[group.id]===choice.id}
             onChange={()=>setSelected(s=>({...s,[group.id]:choice.id}))}/>
           <span><strong>{choice.label}</strong>{choice.description&&<small>{choice.description}</small>}</span>
         </label>)}
       </fieldset>)}
     </div>
     <div className="ak-modal-footer"><button type="button" className="ak-primary" disabled={!valid}
       onClick={()=>onAdd(Object.entries(selected).map(([groupId,choiceId])=>({groupId,choiceId})))}>Add to basket →</button></div>
   </section>
 </div>;
}
