import { useOneActions, css, arr, label, value, fire } from "../shared/OneActions.jsx";
export default function OneSearch(props) {
  const p={...props,kind:props.kind||"Search"};
  const {kind,root,query,setQuery,selected,setSelected,open,setOpen,localPage,setPage,options}=useOneActions(p);
  const [activeIndex,setActiveIndex]=React.useState(-1);
  const [suggestionsDismissed,setSuggestionsDismissed]=React.useState(false);
  const listId="one-search-list-"+React.useId().replace(/[^A-Za-z0-9_-]/g,"");
  const suggestions=p.showSuggestions===true&&query&&!suggestionsDismissed?options.filter(x=>label(x).toLowerCase().includes(query.toLowerCase())).slice(0,10):[];
  const choose=option=>{setQuery(label(option));setActiveIndex(-1);setSuggestionsDismissed(true);fire(p,"select",value(option));};
  const onKeyDown=event=>{
    if(!suggestions.length)return;
    if(event.key==="ArrowDown"){event.preventDefault();setActiveIndex(index=>(index+1)%suggestions.length);}
    else if(event.key==="ArrowUp"){event.preventDefault();setActiveIndex(index=>index<=0?suggestions.length-1:index-1);}
    else if(event.key==="Enter"&&activeIndex>=0){event.preventDefault();choose(suggestions[activeIndex]);}
    else if(event.key==="Home"){event.preventDefault();setActiveIndex(0);}
    else if(event.key==="End"){event.preventDefault();setActiveIndex(suggestions.length-1);}
    else if(event.key==="Escape"){setActiveIndex(-1);setSuggestionsDismissed(true);}
  };
  return <div {...root}><label className="one-label">{p.label||"Search"}
    <input className="one-control" type="search" role="combobox" aria-autocomplete="list" aria-expanded={suggestions.length>0} aria-controls={suggestions.length?listId:undefined} aria-activedescendant={activeIndex>=0?listId+"-option-"+activeIndex:undefined} placeholder={p.placeholder||"Search"} value={p.value!==undefined?String(p.value):query} onKeyDown={onKeyDown} onChange={e=>{
      const nextValue=e.target.value;setQuery(nextValue);setActiveIndex(-1);setSuggestionsDismissed(false);
      if(p.searchKey&&p.pageSessionKey&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("metadrive:page-filter-selected",{detail:{pageSessionKey:p.pageSessionKey,filterKey:p.searchKey,value:nextValue}}));
      if(p.actionFlows?.change)fire(p,"change",nextValue);else if(typeof p.onChange==="function")p.onChange(nextValue);
    }}/></label>
    {suggestions.length>0&&<div id={listId} className="one-surface" role="listbox" aria-label={(p.label||"Search")+" suggestions"}>
      {suggestions.map((option,index)=><div key={index} id={listId+"-option-"+index} role="option" aria-selected={activeIndex===index} tabIndex={-1} className="one-btn one-btn--ghost" onMouseDown={event=>{event.preventDefault();choose(option);}}>{label(option)}</div>)}
    </div>}
  </div>;
}