# Bundled custom components

Each component has its own directory containing its JSX source and optional CSS. `manifest.json` is the registration catalog: it controls the component label, available builder surfaces, and default/minimum resize dimensions.

The server compiles and registers missing manifest entries the first time the Global Component Library is read. Registered components are persisted in the platform library, so the source catalog remains available for future deployments and data resets. Existing registrations with the same API name are not overwritten.

Components can be placed on Lightning pages and dashboards, or added to Flow Builder screens. Flow screens pass `label`, `value`, `onChange`, and `onAction` props; page and dashboard hosts pass their surface-specific props. Components are self-contained and cannot import external modules. Styles are scoped to the registered component.

The JSX source should use `props.children` only in a host that supplies child content. The current page and flow screen builders do not provide nested component slots.
