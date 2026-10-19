ALTER TABLE md_flow_interview_records
 DROP CONSTRAINT IF EXISTS md_flow_interview_records_api_name_check;
ALTER TABLE md_flow_interview_records
 ADD CONSTRAINT md_flow_interview_records_api_name_check
 CHECK(api_name ~ '^(\$[A-Za-z][A-Za-z0-9_]*|[A-Za-z][A-Za-z0-9_]*)$');
