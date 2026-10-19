DO $$
BEGIN
 IF EXISTS (
  SELECT 1 FROM md_flow_interview_records WHERE sort_order>199
 ) THEN
  RAISE EXCEPTION 'Flow interview record collections contain more than 200 entries; reconcile them before applying this migration';
 END IF;
END $$;

ALTER TABLE md_flow_interview_records
 DROP CONSTRAINT IF EXISTS md_flow_interview_records_sort_order_check;
ALTER TABLE md_flow_interview_records
 ADD CONSTRAINT md_flow_interview_records_sort_order_bound
 CHECK (sort_order BETWEEN 0 AND 199);
