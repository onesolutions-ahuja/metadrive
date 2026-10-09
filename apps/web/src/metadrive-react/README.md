# Experimental MetaDrive React theme

This alternative frontend is isolated at `/theme` on branch `experiment/metadrive-react-theme`.

- Existing app routes, API, data, authentication, and styles are unchanged.
- The new gateway maps the existing setup navigation and metadata-defined objects.
- The gateway currently previews its own overview, objects and metadata field tables. Its working-module links go to the existing `/une` implementation.
- This is **not yet full feature parity** or a replacement for existing CRUD/Flow Builder pages. Migrate those modules intentionally after reviewing the gateway, not by duplicating backend logic.
- Check both `/theme` and `/une/setup/home` after starting the Vite app.
