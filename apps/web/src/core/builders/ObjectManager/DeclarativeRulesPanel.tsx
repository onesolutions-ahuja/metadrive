import {useEffect,useState} from 'react';
import {apiRequest} from '../../authentication/Client/authClient';
import type {ObjectMetadata} from '../../metadata/Definitions/metadata';
import SmartFieldInput from '../../../one/OneSmartFieldInput/SmartFieldInput';

type Field={apiName:string;label:string;dataType:string};
type Rule={apiName:string;label:string;expression:string;errorMessage:string;errorFieldApi:string|null;active:boolean;sortOrder:number;revision:number};
type Default={fieldApi:string;expression:string;revision:number};
const initial:Rule={apiName:'',label:'',expression:'',errorMessage:'',errorFieldApi:null,active:false,sortOrder:0,revision:0};

export default function DeclarativeRulesPanel({objectApi,fields,objects}:{objectApi:string;fields:Field[];objects:ObjectMetadata[]}) {
  const [rules,setRules]=useState<Rule[]>([]);
  const [defaults,setDefaults]=useState<Default[]>([]);
  const [draft,setDraft]=useState<Rule>(initial);
  const [target,setTarget]=useState('');
  const [formula,setFormula]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [history,setHistory]=useState<Array<Record<string,unknown>>>([]);
  const [historyTarget,setHistoryTarget]=useState<{kind:'rule'|'default';apiName:string}|null>(null);
  const base='/metadata/objects/'+encodeURIComponent(objectApi);
  const reload=async()=>{
    const [r,d]=await Promise.all([
      apiRequest<{rules:Rule[]}>(base+'/validation-rules'),
      apiRequest<{defaults:Default[]}>(base+'/default-formulas')
    ]);
    setRules(r.rules);
    setDefaults(d.defaults);
  };
  useEffect(()=>{
    let active=true;
    Promise.all([
      apiRequest<{rules:Rule[]}>(base+'/validation-rules'),
      apiRequest<{defaults:Default[]}>(base+'/default-formulas')
    ]).then(([r,d])=>{if(active){setRules(r.rules);setDefaults(d.defaults);setError('');}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load rules');});
    setDraft(initial);
    setTarget('');
    setFormula('');
    setHistory([]);setHistoryTarget(null);
    return ()=>{active=false;};
  },[base]);
  const perform=async(action:()=>Promise<unknown>)=>{
    setBusy(true);setError('');
    try{await action();await reload();setDraft(initial);setHistoryTarget(null);setHistory([]);}
    catch(e){setError(e instanceof Error?e.message:'Unable to save rule');}
    finally{setBusy(false);}
  };
  const saveRule=()=>perform(async()=>{
    if(!/^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(draft.apiName))
      throw new Error('Enter a valid rule API name');
    await apiRequest(base+'/validation-rules/'+encodeURIComponent(draft.apiName),{
      method:'PUT',
      body:JSON.stringify({label:draft.label,expression:draft.expression,
        errorMessage:draft.errorMessage,errorFieldApi:draft.errorFieldApi,
        active:draft.active,sortOrder:draft.sortOrder,revision:draft.revision})
    });
  });
  const loadHistory=async(kind:'rule'|'default',apiName:string)=>{
    setBusy(true);setError('');
    try{
      const route=kind==='rule'?'validation-rules':'default-formulas';
      const data=await apiRequest<{history:Array<Record<string,unknown>>}>(
        base+'/'+route+'/'+encodeURIComponent(apiName)+'/history');
      setHistory(data.history);setHistoryTarget({kind,apiName});
    }catch(e){setError(e instanceof Error?e.message:'Unable to load history');}
    finally{setBusy(false);}
  };
  const writable=fields.filter(f=>!['Formula','Roll-Up Summary','Auto Number','AutoNumber',
    'Text (Encrypted)'].includes(f.dataType)&&!f.dataType.includes('Relationship'));
  return <section className="surface object-setting-surface">
    <div className="section-toolbar">
      <div><h2>Validation Rules</h2><p>Use a formula that returns TRUE to reject invalid record saves.</p></div>
    </div>
    {error&&<p role="alert" className="permission-help">{error}</p>}
    <div className="field-selector-list">
      {rules.map(rule=><div key={rule.apiName} className="field-selector-row">
        <div><strong>{rule.label}</strong> <small className="api-name">{rule.apiName}</small>
          <p className="permission-help">{rule.active?'Active':'Inactive'} · {rule.expression}</p>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={()=>setDraft(rule)}>Edit</button>
          <button type="button" className="btn" disabled={busy}
            onClick={()=>void loadHistory('rule',rule.apiName)}>History</button>
          <button type="button" className="btn" disabled={busy}
            onClick={()=>perform(()=>apiRequest(base+'/validation-rules/'+encodeURIComponent(rule.apiName),{method:'DELETE'}))}>Delete</button>
        </div>
      </div>)}
    </div>
    {historyTarget&&<div className="metadata-card">
      <h3>Saved versions: {historyTarget.apiName}</h3>
      {history.length===0?<p>No earlier versions yet.</p>:history.map(version=>
        <div className="field-selector-row" key={String(version.revision)}>
          <span>Revision {String(version.revision)}</span>
          <button type="button" className="btn" onClick={()=>{
            if(historyTarget.kind==='rule'){
              const current=rules.find(r=>r.apiName===historyTarget.apiName);
              if(current)setDraft({...current,label:String(version.label),
                expression:String(version.expression),errorMessage:String(version.errorMessage),
                errorFieldApi:typeof version.errorFieldApi==='string'?version.errorFieldApi:null,
                active:version.active===true,sortOrder:Number(version.sortOrder)});
            }else{
              setTarget(historyTarget.apiName);setFormula(String(version.expression));
            }
          }}>Use this version</button>
        </div>)}
      <button type="button" className="btn" onClick={()=>setHistoryTarget(null)}>Close history</button>
    </div>}
    <div className="metadata-card">
      <h3>{rules.some(rule=>rule.apiName===draft.apiName)?'Edit rule':'New rule'}</h3>
      <label className="form-label">Rule API Name
        <input className="form-control" value={draft.apiName}
          disabled={rules.some(rule=>rule.apiName===draft.apiName)}
          onChange={e=>setDraft({...draft,apiName:e.target.value})}/></label>
      <label className="form-label">Label
        <input className="form-control" value={draft.label}
          onChange={e=>setDraft({...draft,label:e.target.value})}/></label>
      <label className="form-label">Formula (TRUE blocks save)
        <SmartFieldInput multiline rows={3} kind="formula" objects={objects}
          primaryObjectApiName={objectApi} value={draft.expression}
          onChange={value=>setDraft({...draft,expression:value})}/></label>
      <label className="form-label">Error message
        <input className="form-control" value={draft.errorMessage}
          onChange={e=>setDraft({...draft,errorMessage:e.target.value})}/></label>
      <label className="form-label">Error location
        <select className="form-control" value={draft.errorFieldApi??''}
          onChange={e=>setDraft({...draft,errorFieldApi:e.target.value||null})}>
          <option value="">Top of form</option>
          {fields.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}
        </select></label>
      <label className="form-label">Evaluation order
        <input className="form-control" type="number" value={draft.sortOrder}
          onChange={e=>setDraft({...draft,sortOrder:Number(e.target.value)})}/></label>
      <label className="checkbox-row"><input type="checkbox" checked={draft.active}
        onChange={e=>setDraft({...draft,active:e.target.checked})}/>Active</label>
      <div className="toolbar-actions">
        <button type="button" className="btn" onClick={()=>setDraft(initial)}>Clear</button>
        <button type="button" className="btn btn-brand" disabled={busy||!draft.label.trim()||!draft.expression.trim()||!draft.errorMessage.trim()}
          onClick={saveRule}>Save rule</button>
      </div>
    </div>
    <div className="section-toolbar"><div><h2>Formula Defaults</h2>
      <p>Apply calculated values only when a field is omitted during record creation.</p></div></div>
    <div className="field-selector-list">{defaults.map(item=>
      <div className="field-selector-row" key={item.fieldApi}>
        <div><strong>{fields.find(f=>f.apiName===item.fieldApi)?.label??item.fieldApi}</strong>
          <p className="permission-help">{item.expression}</p></div>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={()=>{setTarget(item.fieldApi);setFormula(item.expression);}}>Edit</button>
          <button type="button" className="btn" disabled={busy}
            onClick={()=>void loadHistory('default',item.fieldApi)}>History</button>
          <button type="button" className="btn" disabled={busy}
            onClick={()=>perform(()=>apiRequest(base+'/default-formulas/'+encodeURIComponent(item.fieldApi),{method:'DELETE'}))}>Delete</button>
        </div>
      </div>)}</div>
    <div className="metadata-card">
      <label className="form-label">Target field
        <select className="form-control" value={target} onChange={e=>{setTarget(e.target.value);setFormula(defaults.find(f=>f.fieldApi===e.target.value)?.expression??'');}}>
          <option value="">Select field</option>
          {writable.map(f=><option key={f.apiName} value={f.apiName}>{f.label}</option>)}
        </select></label>
      <label className="form-label">Default formula
        <SmartFieldInput multiline rows={3} kind="formula" objects={objects}
          primaryObjectApiName={objectApi} value={formula} onChange={setFormula}/></label>
      <button type="button" className="btn btn-brand" disabled={busy||!target||!formula.trim()}
        onClick={()=>perform(()=>apiRequest(base+'/default-formulas/'+encodeURIComponent(target),{
          method:'PUT',body:JSON.stringify({expression:formula,revision:defaults.find(item=>item.fieldApi===target)?.revision??0})}))}>Save default</button>
    </div>
  </section>;
}
