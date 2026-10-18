import {
  useOneInputs,
  css,
  fire,
  list,
  normalizeChoice,
} from "../shared/OneInputs.jsx";

export default function OneFileUpload(props) {
  const p = { ...props, kind: props.kind || "FileUpload" };
  const {
    kind,
    root,
    local,
    setLocal,
    filter,
    setFilter,
    current,
    set,
    label,
    wrap,
    options,
  } = useOneInputs(p);
  return wrap(
    <input
      className="one-control"
      type="file"
      accept={p.accept || undefined}
      multiple={p.multiple === true}
      disabled={p.disabled === true}
      onChange={(e) => {
        const files = Array.from(e.target.files || []);
        if (p.onFilesSelected) {
          void Promise.resolve(p.onFilesSelected(files)).finally(() => {
            e.target.value = "";
          });
        } else {
          const entries = files.map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
          }));
          setLocal(entries);
          p.onAction?.({ event: "fileSelected", value: entries });
          e.target.value = "";
        }
      }}
    />,
  );
}
