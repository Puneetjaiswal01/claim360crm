-- Preserve owner/admin access and the existing restrictive membership policy.
DROP POLICY "Owner can view leads" ON public.leads;
DROP POLICY "admins view all leads" ON public.leads;
CREATE POLICY "members view own or admin leads" ON public.leads FOR SELECT TO authenticated
 USING (owner_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()));
DROP POLICY "Owner can edit leads" ON public.leads;
DROP POLICY "admins edit all leads" ON public.leads;
CREATE POLICY "members edit own or admin leads" ON public.leads FOR UPDATE TO authenticated
 USING (owner_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()))
 WITH CHECK (owner_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()));
ALTER FUNCTION public.crm_add_member(text,text) SET search_path='';
ALTER FUNCTION public.crm_team_directory() SET search_path='';
ALTER FUNCTION public.crm_is_admin() SET search_path='';
CREATE OR REPLACE FUNCTION public.crm_transfer_lead(p_lead_id uuid,p_recipient uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead_id AND (owner_id=(SELECT auth.uid()) OR public.crm_is_admin())) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_team_members WHERE user_id=p_recipient) THEN RAISE EXCEPTION 'Recipient is not a team member'; END IF;
 UPDATE public.leads SET owner_id=p_recipient,updated_at=now() WHERE id=p_lead_id;
 END $$;
REVOKE ALL ON FUNCTION public.crm_transfer_lead(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_transfer_lead(uuid,uuid) TO authenticated;
