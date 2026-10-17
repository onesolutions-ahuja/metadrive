import { useId, useMemo, useRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent, type Ref, type UIEvent } from 'react';
import { AtSign, Database, Search } from 'lucide-react';
import type { ObjectMetadata } from './metadata';
import { mentionGroups, mentionSegments, type MentionKind } from './smartFieldMentions';
import './SmartFieldInput.css';

type InputElement = HTMLInputElement | HTMLTextAreaElement;
type Props = {
  value: string;
  onChange: (value: string) => void;
  objects?: readonly ObjectMetadata[];
  primaryObjectApiName?: string;
  appObjectApiNames?: readonly string[];
  kind?: MentionKind;
  multiline?: boolean;
  rows?: number;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  textareaRef?: Ref<HTMLTextAreaElement>;
};

function tokenAtCursor(value: string, cursor: number): { start: number; query: string } | null {
  const before = value.slice(0, cursor);
  const found = /(^|[\s([{,=:])@([A-Za-z0-9_.]*)$/.exec(before);
  return found ? { start: cursor - found[2].length - 1, query: found[2] } : null;
}

/** Shared no-code control for any string-capable component property or expression. */
export default function SmartFieldInput({
  value, onChange, objects = [], primaryObjectApiName = '', appObjectApiNames = [],
  kind = 'text', multiline = false, rows = 3, id, ariaLabel, placeholder,
  disabled = false, maxLength, textareaRef
}: Props) {
  const inputRef = useRef<InputElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const resultId = useId();
  const mirrorRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);
  const [search, setSearch] = useState('');
  const token = tokenAtCursor(value, cursorRef.current);
  const query = forced ? search : token?.query ?? '';
  const options = useMemo(() =>
    mentionGroups(objects, primaryObjectApiName, appObjectApiNames, query, kind),
    [objects, primaryObjectApiName, appObjectApiNames, query, kind]);
  const segments = mentionSegments(value, objects, kind);

  const putCursor = (next: number) => {
    cursorRef.current = next;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next, next);
    });
  };
  const onInput = (event: ChangeEvent<InputElement>) => {
    const next = event.target.value;
    cursorRef.current = event.target.selectionStart ?? next.length;
    onChange(next);
    setForced(false);
    setOpen(Boolean(tokenAtCursor(next, cursorRef.current)));
  };
  const updateCursor = () => {
    cursorRef.current = inputRef.current?.selectionStart ?? value.length;
    if (!forced) setOpen(Boolean(tokenAtCursor(value, cursorRef.current)));
  };
  const insert = (objectApiName: string, fieldApiName: string) => {
    const position = inputRef.current?.selectionStart ?? cursorRef.current;
    const end = inputRef.current?.selectionEnd ?? position;
    const active = !forced ? tokenAtCursor(value, position) : null;
    const from = active?.start ?? position;
    const reference = '@' + objectApiName + '.' + fieldApiName;
    onChange(value.slice(0, from) + reference + value.slice(end));
    setOpen(false);
    setForced(false);
    setSearch('');
    putCursor(from + reference.length);
  };
  const common = {
    id,
    'aria-label': ariaLabel,
    'aria-autocomplete': 'list' as const,
    'aria-expanded': open,
    'aria-controls': open ? resultId : undefined,
    value, placeholder, disabled, maxLength,
    onChange: onInput,
    onClick: updateCursor,
    onKeyUp: updateCursor,
    onScroll: (event: UIEvent<InputElement>) => {
      if (mirrorRef.current) {
        mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
        mirrorRef.current.scrollLeft = event.currentTarget.scrollLeft;
      }
    },
    onKeyDown: (event: KeyboardEvent<InputElement>) => {
      if (event.key === 'Escape') { setOpen(false); setForced(false); }
    },
    onBlur: (event: FocusEvent<InputElement>) => {
      if (event.relatedTarget instanceof Node && editorRef.current?.contains(event.relatedTarget)) return;
      setOpen(false); setForced(false);
    }
  };
  return <div className="smart-field-editor" ref={editorRef}>
    <div className={'smart-field-input-wrap' + (multiline ? ' is-multiline' : '')}>
      <div ref={mirrorRef} className="smart-field-mirror" aria-hidden="true">
        {segments.map((part, index) => <span key={index} className={part.reference ? 'smart-field-reference' : undefined}>{part.text}</span>)}
        {multiline && '\n'}
      </div>
      {multiline
        ? <textarea {...common} ref={node => {
            inputRef.current = node;
            if (typeof textareaRef === 'function') textareaRef(node);
            else if (textareaRef) (textareaRef as { current: HTMLTextAreaElement | null }).current = node;
          }} className="form-control smart-field-control" rows={rows} />
        : <input {...common} ref={node => { inputRef.current = node; }} className="form-control smart-field-control" type="text" />}
      <button className="smart-field-trigger" type="button" aria-label="Insert dynamic field"
        title="Insert dynamic field (@)" disabled={disabled || objects.length === 0}
        onMouseDown={event => event.preventDefault()}
        onClick={() => { cursorRef.current = inputRef.current?.selectionStart ?? value.length; setForced(true); setSearch(''); setOpen(true); }}>
        <AtSign size={15} />
      </button>
    </div>
    {open && !disabled && objects.length > 0 && <div className="smart-field-picker" id={resultId}
      role="listbox" aria-label="Dynamic fields">
      <div className="smart-field-search">
        <Search size={13} />
        {forced ? <input autoFocus aria-label="Search objects and fields" value={search}
          placeholder="Search objects or fields" onChange={event => setSearch(event.target.value)}
          onBlur={event => {
            if (!(event.relatedTarget instanceof Node && editorRef.current?.contains(event.relatedTarget))) setOpen(false);
          }}
          onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); setForced(false); inputRef.current?.focus(); } }} />
          : <span>Search: {query || 'All fields'} </span>}
      </div>
      <div className="smart-field-results">
        {options.map(group => <div key={group.objectApiName}>
          <div className="smart-field-group"><Database size={13} /> {group.label}
            {group.primary && <small>Current page</small>}
          </div>
          {group.fields.map(field => <button key={field.fieldApiName} type="button" role="option" aria-selected={false}
            onMouseDown={event => event.preventDefault()}
            onClick={() => insert(field.objectApiName, field.fieldApiName)}>
            <AtSign size={12} /> <span>{field.fieldLabel}</span>
            <small>{field.fieldApiName}</small>
          </button>)}
        </div>)}
        {!options.length && <p className="smart-field-empty">No matching fields</p>}
      </div>
    </div>}
  </div>;
}
