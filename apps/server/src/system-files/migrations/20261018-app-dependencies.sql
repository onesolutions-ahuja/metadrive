-- App dependency catalog is platform metadata; installations remain tenant scoped.
CREATE TABLE IF NOT EXISTS md_app_dependencies (
 app_id uuid NOT NULL REFERENCES md_apps(id),
 dependency_app_id uuid NOT NULL REFERENCES md_apps(id),
 PRIMARY KEY(app_id,dependency_app_id),
 CHECK(app_id<>dependency_app_id)
);
CREATE INDEX IF NOT EXISTS md_app_dependencies_reverse ON md_app_dependencies(dependency_app_id);
