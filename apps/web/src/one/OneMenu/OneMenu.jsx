import { useOneActions, css, arr, label, value, fire } from "../shared/OneActions.jsx";
import { useDismissOnOutside } from "../shared/accessibilityHooks";

export default function OneMenu(props) {
  const p = { ...props, kind: props.kind || "Menu" };
  const { kind, root, query, setQuery, selected, setSelected, open, setOpen, localPage, setPage, options } = useOneActions(p);
  const rootRef = React.useRef(null), triggerRef = React.useRef(null), menuRef = React.useRef(null);
  const dismiss = React.useCallback(() => { setOpen(false); triggerRef.current?.focus(); }, [setOpen]);
  useDismissOnOutside(React,rootRef,open,dismiss);
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
    items()[0]?.focus();
    const keydown = event => {
      const list = items();
      if (!list.length) return;
      const current = list.indexOf(document.activeElement);
      let next = -1;
      if (event.key === "ArrowDown") next = (current + 1 + list.length) % list.length;
      else if (event.key === "ArrowUp") next = (current - 1 + list.length) % list.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const needle = event.key.toLocaleLowerCase(), start = Math.max(0,current+1);
        const ordered = [...list.slice(start),...list.slice(0,start)];
        const match = ordered.find(item => item.textContent.trim().toLocaleLowerCase().startsWith(needle));
        if (match) next = list.indexOf(match);
      }
      if (next >= 0) { event.preventDefault(); list[next].focus(); }
    };
    document.addEventListener("keydown",keydown);
    return () => { document.removeEventListener("keydown",keydown); };
  },[open,setOpen,options]);
  return <div {...root} ref={rootRef}>
    <button ref={triggerRef} type="button" className="one-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>{p.label || "Options"} ▾</button>
    {open && <div ref={menuRef} className="one-surface" role="menu" aria-label={p.label || "Options"} style={{position:"absolute",top:"100%",left:0,zIndex:20,minWidth:180}}>
      {options.map((o,i) => <button role="menuitem" type="button" key={i} className="one-btn one-btn--ghost" style={{display:"flex",width:"100%",justifyContent:"start"}} onClick={() => { fire(p,"select",value(o)); setOpen(false); triggerRef.current?.focus(); }}>{label(o)}</button>)}
    </div>}
  </div>;
}