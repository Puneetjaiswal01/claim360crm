CREATE OR REPLACE FUNCTION public.crm_transfer_lead(p_lead_id uuid, p_recipient uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.leads WHERE id=p_lead_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Lead not found or archived'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.crm_team_members WHERE user_id=p_recipient) THEN RAISE EXCEPTION 'Recipient is not a team member'; END IF;
 UPDATE public.leads SET owner_id=p_recipient,updated_at=now() WHERE id=p_lead_id;
END $function$;