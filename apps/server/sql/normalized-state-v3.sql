-- Revision 3: strictly SQL-only graph for arbitrary nested metadata and Flow state.
-- Typed custom-object physical tables are defined separately in normalized-registry-v2.sql.
-- An additive migration: never changes or removes legacy JSONB tables.
-- No metadata object name, field label, customer value or secret becomes a SQL identifier.
CREATE TABLE IF NOT EXISTS md_v3_runtime (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  revision BIGINT NOT NULL CHECK (revision >= 0),
  source_sha256 CHAR(64) NOT NULL,
  state_sha256 CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS md_v3_state_nodes (
  revision BIGINT NOT NULL CHECK (revision>=0),
  node_id BIGINT NOT NULL CHECK (node_id>0),
  parent_id BIGINT,
  slot_key TEXT,
  ordinal INTEGER NOT NULL CHECK (ordinal>=0),
  kind TEXT NOT NULL CHECK (kind IN ('object','array','string','number','boolean','null')),
  string_value TEXT,
  number_value DOUBLE PRECISION,
  bool_value BOOLEAN,
  PRIMARY KEY (revision,node_id),
  FOREIGN KEY (revision,parent_id) REFERENCES md_v3_state_nodes (revision,node_id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (kind = 'string' AND string_value IS NOT NULL AND number_value IS NULL AND bool_value IS NULL) OR
    (kind = 'number' AND string_value IS NULL AND number_value IS NOT NULL AND bool_value IS NULL) OR
    (kind = 'boolean' AND string_value IS NULL AND number_value IS NULL AND bool_value IS NOT NULL) OR
    (kind IN ('object','array','null') AND string_value IS NULL AND number_value IS NULL AND bool_value IS NULL)
  ),
  CHECK (parent_id IS NOT NULL OR (slot_key IS NULL AND ordinal=0))
);
CREATE INDEX IF NOT EXISTS md_v3_state_nodes_parent
  ON md_v3_state_nodes(revision,parent_id,ordinal);

-- No JSONB or JSON columns exist in this revision.
