import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {request as httpRequest} from "node:http";
import test from "node:test";
import {createClient} from "@supabase/supabase-js";

// Run against next dev with LOCAL_DEV_TEST_PASSWORD supplied in the environment.
const settings=Object.fromEntries((await readFile(new URL("../.env.local",import.meta.url),"utf8")).split(/\r?\n/).filter(line=>line.includes("=")).map(line=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1)];}));
const base=process.env.LOCAL_DEV_TEST_URL||"http://localhost:3000";
const password=process.env.LOCAL_DEV_TEST_PASSWORD;
const email=settings.LOCAL_DEV_ADMIN_EMAIL;
const endpoint=base+"/api/local-dev";
const client=createClient("http://127.0.0.1:3000","local-development",{
 auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 global:{fetch:(input,init)=>{const url=new URL(input);return fetch(endpoint+url.pathname+url.search,init);}},
});
test("local admin authentication, isolation, and persistent record editing",async()=>{
 assert.ok(password,"Supply LOCAL_DEV_TEST_PASSWORD to run the local integration test");
 const login=(body,headers={})=>fetch(endpoint+"/auth/v1/token?grant_type=password",{method:"POST",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
 assert.equal((await login({email,password:"wrong-password"})).status,400);
 assert.equal((await login({email:"unknown@example.invalid",password})).status,400);
 assert.equal((await login({email,password},{Origin:"https://example.invalid"})).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{const request=httpRequest(endpoint+"/rest/v1/leads",{headers:{Host:"example.invalid"}},response=>{response.resume();resolve(response.statusCode);});request.on("error",reject);request.end();});
 assert.equal(foreignHostStatus,404);
 assert.equal((await fetch(endpoint+"/rest/v1/leads")).status,401);
 const signedIn=await client.auth.signInWithPassword({email:email.toUpperCase(),password});
 assert.equal(signedIn.error,null);
 assert.equal(signedIn.data.user.email,email);
 const accessToken=signedIn.data.session.access_token;
 const headers={Authorization:`Bearer ${accessToken}`};
 assert.equal((await client.auth.getUser()).error,null);
 assert.equal((await client.auth.refreshSession()).error,null);
 assert.equal((await fetch(endpoint+"/rest/v1/leads",{headers:{Authorization:`Bearer ${accessToken.slice(0,-8)}tampered`}})).status,401);
 const team=await client.rpc("crm_team_profiles");
 assert.equal(team.error,null);
 assert.ok(team.data.some(member=>member.email===email&&member.role==="admin"));
 const ref=`LOCAL-TEST-${crypto.randomUUID()}`;
 let id;
 try{
  const created=await client.from("leads").insert({ref_id:ref,shareholder_name:"Local integration test",status:"UNTOUCHED",followup_date:"2026-10-20"}).select("*").single();
  assert.equal(created.error,null);id=created.data.id;
  const persisted=JSON.parse(await readFile(new URL("../.local-dev/crm.json",import.meta.url),"utf8"));
  assert.ok(persisted.leads.some(lead=>lead.id===id));
  const listed=await client.from("leads").select("id",{count:"exact"}).is("archived_at",null).eq("ref_id",ref).range(0,49);
  assert.equal(listed.error,null);assert.equal(listed.count,1);assert.equal(listed.data[0].id,id);
  const updated=await client.from("leads").update({company:"Local testing"}).eq("id",id).eq("updated_at",created.data.updated_at).select("*").maybeSingle();
  assert.equal(updated.error,null);assert.equal(updated.data.company,"Local testing");
  const status=await client.rpc("crm_set_lead_status",{p_lead_id:id,p_status:"FOLLOW UP",p_expected_updated_at:updated.data.updated_at}).single();
  assert.equal(status.error,null);assert.equal(status.data.status,"FOLLOW UP");
  const stale=await client.rpc("crm_set_lead_status",{p_lead_id:id,p_status:"LOSS",p_expected_updated_at:created.data.updated_at}).single();
  assert.ok(stale.error);
  const comment=await client.rpc("crm_add_lead_comment",{p_lead_id:id,p_comment:"Local test comment"}).single();
  assert.equal(comment.error,null);assert.equal(comment.data.activities.at(-1).note,"Local test comment");
  const count=await client.from("leads").select("id",{count:"exact",head:true}).eq("ref_id",ref);
  assert.equal(count.error,null);assert.equal(count.count,1);
  const missing=await client.from("leads").select("*").eq("id",crypto.randomUUID()).maybeSingle();
  assert.equal(missing.error,null);assert.equal(missing.data,null);
  const unsupported=await client.rpc("crm_add_member",{p_email:"test@example.invalid",p_role:"agent"});
  assert.ok(unsupported.error);
 }finally{
  if(id)assert.equal((await client.from("leads").delete().eq("id",id)).error,null);
  assert.equal((await client.auth.signOut()).error,null);
 }
 assert.equal((await client.auth.getSession()).data.session,null);
 const publicHtml=await(await fetch(base)).text();
 assert.ok(!publicHtml.includes(password));
 assert.ok(!publicHtml.includes(settings.LOCAL_DEV_ADMIN_PASSWORD_HASH));
 assert.equal((await fetch(endpoint+"/auth/v1/signup",{method:"POST",headers,body:"{}"})).status,403);
});
