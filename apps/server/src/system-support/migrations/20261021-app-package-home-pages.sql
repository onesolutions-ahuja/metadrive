CREATE TABLE IF NOT EXISTS md_app_package_home_page_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 page_api text NOT NULL CHECK(page_api ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 form_factor text NOT NULL CHECK(form_factor IN ('desktop','tablet','phone')),
 PRIMARY KEY(app_id,version,form_factor),
 FOREIGN KEY(app_id,version,page_api)
   REFERENCES md_app_package_page_templates(app_id,version,api_name) ON DELETE CASCADE
);
