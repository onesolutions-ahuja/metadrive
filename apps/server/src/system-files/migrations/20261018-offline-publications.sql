-- Server-authenticated per-user metadata publications; cached content is never an authority for RBAC.
CREATE TABLE IF NOT EXISTS md_offline_publications (
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 digest char(64) NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
