-- Catalogue labels are SQL metadata; seeds preserve administrator customisations.
INSERT INTO md_system_permission_catalogue(permission_key,label,description,resource,action) VALUES
('metadata:read','View Setup','Central RBAC: ObjectDefinition / read','ObjectDefinition','read'),
('metadata:write','metadata — write','Central RBAC: ObjectDefinition / create','ObjectDefinition','create'),
('security:read','security — read','Central RBAC: Security / read','Security','read'),
('security:manage','Manage Users and Permissions','Central RBAC: Security / manage','Security','manage'),
('objects:manage','objects — manage','Central RBAC: ObjectDefinition / manage','ObjectDefinition','manage'),
('fields:create','fields — create','Central RBAC: FieldDefinition / create','FieldDefinition','create'),
('fields:delete','fields — delete','Central RBAC: FieldDefinition / delete','FieldDefinition','delete'),
('flows:manage','flows — manage','Central RBAC: FlowDefinition / manage','FlowDefinition','manage'),
('flows:run','flows — run','Central RBAC: Flow / execute','Flow','execute'),
('flows:system-context','flows — system-context','Central RBAC: FlowDefinition / system-context','FlowDefinition','system-context'),
('namedCredentials:manage','namedCredentials — manage','Central RBAC: NamedCredential / manage','NamedCredential','manage'),
('email:send','email — send','Central RBAC: Email / send','Email','send'),
('callouts:execute','callouts — execute','Central RBAC: NamedCredential / execute','NamedCredential','execute'),
('httpCallouts:execute','httpCallouts — execute','Central RBAC: HTTPCallout / execute','HTTPCallout','execute'),
('namedCredentials:read','namedCredentials — read','Central RBAC: NamedCredential / read','NamedCredential','read'),
('platformEvents:publish','platformEvents — publish','Central RBAC: PlatformEvent / publish','PlatformEvent','publish'),
('platformEvents:subscribe','platformEvents — subscribe','Central RBAC: PlatformEvent / subscribe','PlatformEvent','subscribe'),
('webhooks:manage','webhooks — manage','Central RBAC: WebhookSubscription / manage','WebhookSubscription','manage'),
('webhooks:read','webhooks — read','Central RBAC: WebhookSubscription / read','WebhookSubscription','read'),
('webhooks:execute','webhooks — execute','Central RBAC: WebhookSubscription / execute','WebhookSubscription','execute'),
('notifications:send','notifications — send','Central RBAC: Notification / send','Notification','send'),
('approvals:manage','approvals — manage','Central RBAC: ApprovalRequest / manage','ApprovalRequest','manage'),
('reports:manage','reports — manage','Central RBAC: SystemDefinition:reports / manage','SystemDefinition:reports','manage'),
('pages:manage','pages — manage','Central RBAC: PageDefinition / manage','PageDefinition','manage'),
('components:manage','components — manage','Central RBAC: ComponentDefinition / create','ComponentDefinition','create'),
('dashboards:manage','dashboards — manage','Central RBAC: SystemDefinition:dashboards / manage','SystemDefinition:dashboards','manage'),
('dashboards:viewTeam','dashboards — viewTeam','Central RBAC: SystemDefinition:dashboards / read','SystemDefinition:dashboards','read'),
('data:viewAll','View All Data','Central RBAC: Record / viewAll','Record','viewAll'),
('data:modifyAll','Modify All Data','Central RBAC: Record / modifyAll','Record','modifyAll'),
('api:enabled','API Enabled','Central RBAC: API / execute','API','execute'),
('users:read','users — read','Central RBAC: User / read','User','read'),
('users:create','users — create','Central RBAC: User / create','User','create'),
('users:edit','users — edit','Central RBAC: User / edit','User','edit'),
('users:delete','users — delete','Central RBAC: User / delete','User','delete'),
('audit:read','View Setup Audit Trail','Central RBAC: SetupAudit / read','SetupAudit','read'),
('audit:export','Export Setup Audit Trail','Central RBAC: SetupAudit / export','SetupAudit','export'),
('monitoring:read','monitoring — read','Central RBAC: SecurityMonitoring / read','SecurityMonitoring','read'),
('monitoring:manage','monitoring — manage','Central RBAC: SecurityMonitoring / manage','SecurityMonitoring','manage'),
('connectedApps:manage','Manage Connected Apps','Central RBAC: ConnectedApp / manage','ConnectedApp','manage')
ON CONFLICT(permission_key) DO NOTHING;
-- Default-deny classification for newly introduced md_* setup tables: all tables are
-- audited unless explicitly classified as business data, derived runtime state or logs.
CREATE OR REPLACE FUNCTION md_install_setup_audit() RETURNS void LANGUAGE plpgsql AS $$
DECLARE n text;
BEGIN
 FOR n IN SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND starts_with(tablename,'md_')
  AND tablename NOT IN('md_records','md_record_values','md_record_multi_values','md_deleted_lookup_links','md_record_files','md_record_activities','md_record_chatter_posts','md_record_chatter_comments','md_record_history','md_record_lifecycle_audit','md_record_retention_audit','md_auto_number_counters','md_sessions','md_refresh_sessions','md_security_events','md_setup_audit_events','md_setup_audit_tables','md_monitor_events','md_security_rule_windows','md_rbac_revisions','md_password_history','md_password_reset_challenges','md_mfa_login_challenges','md_mfa_enrollment_tokens','md_mfa_backup_codes','md_webauthn_challenges','md_federation_requests','md_federation_tickets','md_saml_request_ids','md_oauth_codes','md_oauth_tokens','md_oauth_consents','md_oauth_consent_scopes','md_notifications','md_approval_requests','md_dashboard_snapshots','md_flow_runs','md_flow_run_inputs','md_flow_interview_state','md_flow_interview_values','md_flow_interview_records','md_flow_interview_record_fields','md_flow_interview_loop_state','md_flow_execution_audit','md_flow_execution_requests','md_flow_execution_result_values','md_flow_email_jobs','md_http_callout_jobs','md_http_callout_job_values','md_platform_event_deliveries','md_platform_event_messages','md_platform_event_values','md_webhook_deliveries','md_durable_jobs','md_durable_job_events','md_durable_job_values','md_encrypted_field_access_audit','md_tenant_recovery_cases','md_tenant_recovery_case_proofs','md_tenant_recovery_approvals','md_tenant_lifecycle_audit','md_global_value_set_audit','md_tenant_provisioning_requests','md_bootstrap_password_repairs','md_initial_password_rotations','md_system_migrations','md_schema_migrations','md_migrations','md_tenant_api_usage_daily','md_api_usage_daily','md_api_request_counts','md_offline_sync_receipts','md_data_import_jobs','md_data_import_rows','md_data_export_jobs') LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS md_capture_setup_mutation ON %I',n);
  EXECUTE format('CREATE TRIGGER md_capture_setup_mutation AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION md_capture_setup_mutation()',n);
  INSERT INTO md_setup_audit_tables VALUES(n) ON CONFLICT DO NOTHING;
 END LOOP;
END
$$;
SELECT md_install_setup_audit();
DROP TRIGGER IF EXISTS md_protect_setup_audit_truncate ON md_setup_audit_events;
CREATE TRIGGER md_protect_setup_audit_truncate BEFORE TRUNCATE ON md_setup_audit_events FOR EACH STATEMENT EXECUTE FUNCTION md_protect_setup_audit();
