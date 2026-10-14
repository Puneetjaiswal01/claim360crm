ALTER TABLE public.crm_member_profiles ADD COLUMN completed_at timestamptz;
-- Preserve the existing completed setup; prefilled name/title-only rows remain open.
UPDATE public.crm_member_profiles SET completed_at=updated_at
 WHERE employee_id IS NOT NULL OR NULLIF(btrim(phone),'') IS NOT NULL OR NULLIF(btrim(department),'') IS NOT NULL;
DROP POLICY "members read own profile" ON public.crm_member_profiles;
CREATE POLICY "members read own or admin profiles" ON public.crm_member_profiles FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()));
DROP POLICY "members update own profile" ON public.crm_member_profiles;
CREATE POLICY "members complete own profile or admins edit" ON public.crm_member_profiles FOR UPDATE TO authenticated
 USING ((SELECT public.crm_is_admin()) OR (user_id=(SELECT auth.uid()) AND completed_at IS NULL))
 WITH CHECK ((SELECT public.crm_is_admin()) OR user_id=(SELECT auth.uid()));
REVOKE INSERT ON public.crm_member_profiles FROM authenticated;
GRANT INSERT(user_id,display_name,designation,employee_id,phone,department) ON public.crm_member_profiles TO authenticated;
DROP TRIGGER crm_profile_updated ON public.crm_member_profiles;
CREATE OR REPLACE FUNCTION public.crm_profile_timestamp() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
 BEGIN
 NEW.updated_at=now();
 IF TG_OP='INSERT' THEN NEW.completed_at=now();
 ELSE NEW.completed_at=COALESCE(OLD.completed_at,now()); END IF;
 RETURN NEW;
 END $$;
CREATE TRIGGER crm_profile_updated BEFORE INSERT OR UPDATE ON public.crm_member_profiles
 FOR EACH ROW EXECUTE FUNCTION public.crm_profile_timestamp();
DROP POLICY "members create own profile" ON public.crm_member_profiles;
CREATE POLICY "members create own profile or admins create" ON public.crm_member_profiles FOR INSERT TO authenticated
 WITH CHECK ((SELECT public.crm_is_admin()) OR (user_id=(SELECT auth.uid()) AND (SELECT public.crm_is_member())));
