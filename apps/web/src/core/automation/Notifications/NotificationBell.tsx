import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';

type Notification={id:string;title:string;body:string;createdAt:string;readAt:string|null};
/** Existing tenant-scoped notification inbox, created by authorised metadata Flows. */
export default function NotificationBell(){
 const [items,setItems]=useState<Notification[]>([]);
 const [unread,setUnread]=useState(0);
 const [open,setOpen]=useState(false);
 const [error,setError]=useState('');
 const [latest,setLatest]=useState<Notification|null>(null);
 const seen=useRef<Set<string>|null>(null);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   try{
    const result=await apiRequest<{notifications:Notification[];unreadCount:number}>('/notifications');
    if(!live)return;
    const next=(result.notifications??[]).filter(x=>x&&typeof x.id==='string');
    if(seen.current){
     const fresh=next.find(n=>!n.readAt&&!seen.current?.has(n.id));
     if(fresh)setLatest(fresh);
    }
    seen.current=new Set(next.map(n=>n.id));
    setItems(next);setUnread(result.unreadCount??0);setError('');
   }catch(e){if(live)setError(e instanceof Error?e.message:'Notifications unavailable');}
  };
  void load();
  const timer=setInterval(()=>void load(),30000);
  return()=>{live=false;clearInterval(timer);};
 },[]);
 const markRead=async(n:Notification)=>{
  try{
   await apiRequest('/notifications/'+encodeURIComponent(n.id)+'/read',{method:'POST'});
   setItems(old=>old.map(item=>item.id===n.id?{...item,readAt:new Date().toISOString()}:item));
   if(!n.readAt)setUnread(x=>Math.max(0,x-1));
   setLatest(x=>x?.id===n.id?null:x);
  }catch(e){setError(e instanceof Error?e.message:'Unable to mark notification read');}
 };
 return <div className="assist-notifications">
  <button type="button" aria-label={'Notifications, '+unread+' unread'} aria-expanded={open}
   onClick={()=>{setOpen(x=>!x);setLatest(null);}} className="assist-bell">
   <span aria-hidden="true">🔔</span>{unread>0&&<b>{unread}</b>}
  </button>
  {latest&&!open&&<div className="assist-notice-toast" role="status">
   <strong>{latest.title}</strong><p>{latest.body}</p>
   <button type="button" onClick={()=>void markRead(latest)}>Mark read</button>
   <button type="button" aria-label="Dismiss" onClick={()=>setLatest(null)}>×</button>
  </div>}
  {open&&<section className="assist-notice-panel" aria-label="Notifications">
   <h2>Notifications</h2>
   {error&&<p role="alert">{error}</p>}
   {!items.length&&<p>No notifications</p>}
   {items.map(n=><div className={n.readAt?'assist-note':'assist-note assist-note-unread'} key={n.id}>
    <strong>{n.title}</strong><p>{n.body}</p>
    {!n.readAt&&<button type="button" onClick={()=>void markRead(n)}>Mark read</button>}
   </div>)}
  </section>}
 </div>;
}
