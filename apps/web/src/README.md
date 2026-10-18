# Web source

`main.tsx` is the application entrypoint.

- `core/` owns the system platform, runtime, administration and lazy builders.
- `one/` owns reusable custom components and controls, grouped by component.

Keep source, dedicated CSS, descriptors and supporting helpers in the component's
folder. Share common code instead of copying it. See the repository's
`docs/COMPONENT_LIBRARIES.md` and `docs/web-source-moves.json` for layout details
and the usage audit.
