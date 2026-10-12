import {createClient} from "@supabase/supabase-js";
export const supabase=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||"https://qwbrnzdexudbzzxftqov.supabase.co",process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"sb_publishable_7xO3Betr-ZYFSGC_BzdqVw_E-3TpGi7");
