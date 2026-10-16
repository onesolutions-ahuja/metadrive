
const options=(value,fallback=[])=>Array.isArray(value)?value:String(value||'').split(',').map(x=>x.trim()).filter(Boolean).length?String(value||'').split(',').map(x=>x.trim()).filter(Boolean):fallback;
function shared(p){
 const color=p.accentColor||'#3176cc';
 const style={'--one-accent':color,'--one-radius':Math.max(0,Number(p.radius)||0)+'px','--one-pad':Math.max(0,Number(p.padding)||0)+'px','--one-gap':Math.max(0,Number(p.gap)||0)+'px','--one-blur':Math.min(20,Math.max(0,Number(p.glassBlur)||0))+'px'};
 if(p.backgroundColor)style['--one-bg']=p.backgroundColor;
 if(p.textColor)style['--one-fg']=p.textColor;
 if(p.borderColor)style['--one-border']=p.borderColor;
 style.width=p.width||'100%';if(p.height&&p.height!=='auto')style.height=p.height;
 style.opacity=Math.max(0,Math.min(100,Number(p.opacity??100)))/100;
 if(p.shadow==='none')style['--one-shadow']='none';
 return {className:'one-ui one-ui--'+(p.theme||'glass')+' one-ui--'+(p.size||'medium')+(p.hideOnPhone?' one-hidden-mobile':''),style};
}
function fire(p,event,value){if(typeof p.onAction==='function')return p.onAction({event,value});}
export default function OneLayout(p){
 const kind=p.kind||'Container',css=shared(p);
 const [active,setActive]=React.useState(0),[expanded,setExpanded]=React.useState(true),[open,setOpen]=React.useState(false);
 const children=p.children||p.content||null;
 const paneChildren=React.Children.toArray(children).flatMap(child=>child?.type===React.Fragment?React.Children.toArray(child.props.children):[child]);
 const tabRecords=Array.isArray(p.records)?p.records:[];
 const categoryField=typeof p.categoryFieldApiName==='string'&&p.categoryFieldApiName.trim()?p.categoryFieldApiName.trim():null;
 const derivedTabs=p.dynamicTabs===true?[...new Set(tabRecords.map(row=>row?.[categoryField||'Name']??row?.Name??row?.label).filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))]:[];
 const useRecordTabs=p.dynamicTabs===true || (Boolean(p.objectApiName)&&tabRecords.length>0);
 const tabs=useRecordTabs?derivedTabs:options(p.tabs,['Overview','Details']);
 const safeCount=v=>Math.max(1,Math.min(12,Number(v)||1));
 const cols=safeCount(p.columns||p.desktopColumns||3),tabletCols=safeCount(p.tabletColumns||2),mobileCols=safeCount(p.mobileColumns||1);
 const align={start:'flex-start',center:'center',end:'flex-end',stretch:'stretch'}[p.align]||'flex-start';
 const base={alignItems:align};
 if(kind==='Container')return <section {...css} aria-label={p.label||'Container'}><div className="one-surface" style={{...base,display:'flex',flexDirection:p.direction==='row'?'row':'column',gap:'var(--one-gap)'}}>{children}</div></section>;
 if(kind==='Stack')return <div {...css}><div className="one-stack" data-phone-stack="true" style={{...base,flexDirection:p.direction==='column'?'column':'row',flexWrap:p.wrap===false?'nowrap':'wrap'}}>{children}</div></div>;
 if(kind==='Grid')return <div {...css}><div className="one-grid" style={{'--one-grid-desktop':cols,'--one-grid-tablet':tabletCols,'--one-grid-mobile':mobileCols}}>{children||options(p.items).map((v,i)=><div className="one-item" key={i}>{v}</div>)}</div></div>;
 if(kind==='SplitPane')return <div {...css}><div className="one-stack" data-phone-stack="true" style={{alignItems:'stretch',flexWrap:'nowrap'}}><div style={{flex:'0 0 '+Math.min(85,Math.max(15,Number(p.splitRatio)||50))+'%',minWidth:0}}>{p.left||p.first||paneChildren[0]||null}</div><div style={{flex:1,minWidth:0}}>{p.right||p.second||paneChildren.slice(1)}</div></div></div>;
 if(kind==='Card')return <article {...css}><div className="one-surface"><div className="one-heading">{p.title||p.label||'Card'}</div>{p.subtitle&&<p className="one-muted">{p.subtitle}</p>}{p.description&&<p className="one-muted">{p.description}</p>}{children}</div></article>;
 if(kind==='Tabs')return <div {...css}><div className="one-tabs" role="tablist" aria-label={p.label||'Tabs'}>{tabs.map((name,i)=><button type="button" className="one-tab" key={i} role="tab" aria-selected={active===i} onClick={()=>{setActive(i);fire(p,'tabChange',{index:i,label:name,value:useRecordTabs?(tabRecords.find(row=>String(row?.[categoryField||'Name']??row?.Name??row?.label)===name)?.[p.categoryValueFieldApiName||'Name']??name):name})}}>{name}</button>)}</div><div className="one-surface" role="tabpanel" style={{marginTop:8}}>{Array.isArray(children)?children[active]:(p.panels&&p.panels[active]?.content)||children||tabs[active]||'No categories'}</div></div>;
 if(kind==='Accordion')return <div {...css}><div className="one-surface"><button type="button" className="one-btn one-btn--ghost" aria-expanded={expanded} onClick={()=>{setExpanded(!expanded);fire(p,'toggle',!expanded)}}>{expanded?'▾':'▸'} {p.title||p.label||'Details'}</button>{expanded&&<div style={{paddingTop:8}}>{children||p.description||'Details'}</div>}</div></div>;
 if(kind==='Overlay')return <div {...css}><button type="button" className="one-btn" onClick={()=>setOpen(true)}>{p.openLabel||'Open'}</button>{open&&<div className="one-overlay-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><div role="dialog" aria-modal="true" aria-label={p.title||'Dialog'} className={'one-surface one-overlay-panel'+(p.mode==='drawer'?' one-drawer':'')}><div className="one-row" style={{justifyContent:'space-between'}}><strong>{p.title||'Dialog'}</strong><button type="button" className="one-btn one-btn--ghost" aria-label="Close" onClick={()=>setOpen(false)}>×</button></div><div style={{paddingTop:12}}>{children||p.description||'Content'}</div></div></div>}</div>;
 return null;
}
