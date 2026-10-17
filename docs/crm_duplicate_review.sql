-- Apply after crm_operations.sql and crm_merge_preservation.sql.
-- Locks both reviewed records and refuses a stale review before merging.
CREATE OR REPLACE FUNCTION public.crm_merge_leads_reviewed(
 p_target uuid,p_source uuid,
 p_expected_target_updated_at timestamptz,p_expected_source_updated_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target_version timestamptz;source_version timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF p_target=p_source THEN RAISE EXCEPTION 'Select two different records'; END IF;
 PERFORM id FROM public.leads WHERE id IN(p_target,p_source) ORDER BY id FOR UPDATE;
 SELECT updated_at INTO target_version FROM public.leads WHERE id=p_target AND archived_at IS NULL;
 SELECT updated_at INTO source_version FROM public.leads WHERE id=p_source AND archived_at IS NULL;
 IF target_version IS NULL OR source_version IS NULL THEN RAISE EXCEPTION 'Active records required'; END IF;
 IF p_expected_target_updated_at IS NULL OR p_expected_source_updated_at IS NULL OR target_version<>p_expected_target_updated_at OR source_version<>p_expected_source_updated_at THEN
  RAISE EXCEPTION 'A record changed after this review. Refresh and compare both records again.';
 END IF;
 RETURN public.crm_merge_leads(p_target,p_source);
END $$;
REVOKE ALL ON FUNCTION public.crm_merge_leads_reviewed(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_leads_reviewed(uuid,uuid,timestamptz,timestamptz) TO authenticated;

-- Retain rotation/transfer actions in reports even if a lead is later deleted.
-- Requires crm_lead_rotation.sql and the existing operations audit trigger.
DROP TRIGGER IF EXISTS audit_assignments ON public.crm_lead_assignments;
CREATE TRIGGER audit_assignments AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_assignments
FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();
