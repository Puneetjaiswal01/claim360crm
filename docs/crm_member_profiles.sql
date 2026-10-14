CREATE TABLE public.crm_member_profiles (
 user_id uuid PRIMARY KEY REFERENCES public.crm_team_members(user_id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 100),
 designation text NOT NULL DEFAULT '' CHECK (char_length(designation)<=100),
 employee_id text CHECK (employee_id IS NULL OR employee_id ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
 phone text NOT NULL DEFAULT '' CHECK (char_length(phone)<=30 AND phone ~ '^[0-9+(). -]*$'),
 department text NOT NULL DEFAULT '' CHECK (char_length(department)<=100),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX crm_member_profiles_employee_id_key ON public.crm_member_profiles(lower(employee_id)) WHERE employee_id IS NOT NULL;
ALTER TABLE public.crm_member_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_member_profiles FROM anon, authenticated;
GRANT SELECT,INSERT ON public.crm_member_profiles TO authenticated;
GRANT UPDATE(display_name,designation,employee_id,phone,department) ON public.crm_member_profiles TO authenticated;
GRANT ALL ON public.crm_member_profiles TO service_role;
CREATE POLICY "members read own profile" ON public.crm_member_profiles FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
CREATE POLICY "members create own profile" ON public.crm_member_profiles FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()) AND public.crm_is_member());
CREATE POLICY "members update own profile" ON public.crm_member_profiles FOR UPDATE TO authenticated USING (user_id=(SELECT auth.uid())) WITH CHECK (user_id=(SELECT auth.uid()));
CREATE FUNCTION public.crm_profile_timestamp() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.crm_profile_timestamp() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER crm_profile_updated BEFORE UPDATE ON public.crm_member_profiles FOR EACH ROW EXECUTE FUNCTION public.crm_profile_timestamp();
INSERT INTO public.crm_member_profiles(user_id,display_name,designation)
 SELECT m.user_id,COALESCE(NULLIF(btrim(m.display_name),''),split_part(u.email,'@',1)),COALESCE(m.designation,'') FROM public.crm_team_members m JOIN auth.users u ON u.id=m.user_id;
CREATE OR REPLACE FUNCTION public.crm_team_profiles()
 RETURNS TABLE(user_id uuid,email text,role text,display_name text,designation text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.user_id,u.email::text,m.role,
 COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(m.display_name),''),split_part(u.email,'@',1)),
 COALESCE(p.designation,m.designation,'')::text
 FROM public.crm_team_members m JOIN auth.users u ON u.id=m.user_id
 LEFT JOIN public.crm_member_profiles p ON p.user_id=m.user_id
 WHERE m.user_id=(SELECT auth.uid()) OR public.crm_is_admin()
 ORDER BY COALESCE(NULLIF(btrim(p.display_name),''),NULLIF(btrim(m.display_name),''),u.email);
 $$;
REVOKE ALL ON FUNCTION public.crm_team_profiles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_team_profiles() TO authenticated;
