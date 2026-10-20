# Component Engine specification

A shared Component Registry, renderer, property/binding/event engine and published Page Runtime serve all apps. No app-specific component runtime or hardcoded business behaviour is allowed in Core. Independent editor modules include String, Boolean, Number, Picklist, ObjectFieldMap, Expression, Event and Responsive property editors; editing tools are lazy-loaded.

Published metadata controls layout, style, visibility, validation, responsiveness, permissions and event/action bindings. Property editor changes must not bypass runtime validation or tenant security.

Existing contracts: [COMPONENT_LIBRARIES.md](COMPONENT_LIBRARIES.md), [UNIVERSAL_REFERENCE_PICKER.md](UNIVERSAL_REFERENCE_PICKER.md), [web-lazy-loading.md](web-lazy-loading.md).
