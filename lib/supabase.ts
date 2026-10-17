import {createClient} from "@supabase/supabase-js";
export const localDevelopment=process.env.NODE_ENV==="development"&&process.env.NEXT_PUBLIC_LOCAL_DEV==="true";
const url=localDevelopment?"http://127.0.0.1:3000":process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey=localDevelopment?"local-development":process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if(!url||!publishableKey)throw new Error("Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the deployment environment.");
export const supabase=createClient(url,publishableKey,localDevelopment?{
 auth:{storageKey:"claim360-local-dev-auth"},
 global:{fetch:async(input,init)=>{
  const target=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
  const origin=typeof window!=="undefined"?window.location.origin:url;
  return fetch(`${origin}/api/local-dev${target.pathname}${target.search}`,init);
 }},
}:undefined);
