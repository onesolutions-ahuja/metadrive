/** Legacy snapshot compatibility is scoped to parsing and always restored. */
export function createPersistedMetadataReadMode() {
  let active = false;
  return {
    get active() { return active; },
    parse<T>(schema: { parse: (raw: unknown) => T }, raw: unknown): T {
      const previous = active;
      active = true;
      try { return schema.parse(raw); }
      finally { active = previous; }
    }
  };
}
