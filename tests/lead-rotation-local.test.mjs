import assert from "node:assert/strict";
import {createHmac,scryptSync} from "node:crypto";
import {mkdtemp,readFile,mkdir,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import test from "node:test";
import ts from "typescript";

test("local rotation preserves history, excludes owners and rejects stale requests",async()=>{
 const previousCwd=process.cwd(),environment={...process.env};
 const temporary=await mkdtemp(path.join(tmpdir(),"claim360-rotation-test-"));
 const routePath=new URL("../app/api/local-dev/[...path]/route.ts",import.meta.url);
 const source=ts.transpileModule(await readFile(routePath,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const admin="00000000-0000-4000-8000-000000000001",a="00000000-0000-4000-8000-000000000002",b="00000000-0000-4000-8000-000000000003",c="00000000-0000-4000-8000-000000000004";
 const version="2026-10-17T00:00:00.000Z",secret="isolated-test-secret",password="isolated-test-password";
 try{
  process.chdir(temporary);
  Object.assign(process.env,{NODE_ENV:"development",LOCAL_DEV_AUTH:"true",NEXT_PUBLIC_LOCAL_DEV:"true",LOCAL_DEV_SESSION_SECRET:secret,LOCAL_DEV_ADMIN_EMAIL:"admin@example.invalid",LOCAL_DEV_ADMIN_PASSWORD_HASH:"test-salt:"+scryptSync(password,"test-salt",64).toString("hex")});
  const db={leads:[{id:"rnr",owner_id:a,status:"RINGING NOT RESPONDING",updated_at:version,activities:[],sales_remarks:"Keep notes"},{id:"cold",owner_id:a,status:"COLD",updated_at:version,activities:[]},{id:"potential",owner_id:a,status:"POTENTIAL",updated_at:version,activities:[]},{id:"archived",owner_id:a,status:"COLD",updated_at:version,archived_at:version}],crm_member_profiles:[{user_id:admin,display_name:"Admin"},{user_id:a,display_name:"A"},{user_id:b,display_name:"B"},{user_id:c,display_name:"C"}]};
  await mkdir(path.join(temporary,".local-dev"));await writeFile(path.join(temporary,".local-dev/crm.json"),JSON.stringify(db));
  const exports={};new Function("require","exports",source)(createRequire(import.meta.url),exports);
  const body=Buffer.from(JSON.stringify({sub:admin,kind:"access",exp:Date.now()/1000+3600})).toString("base64url"),head=Buffer.from('{}').toString("base64url");
  const token=head+"."+body+"."+createHmac("sha256",secret).update(head+"."+body).digest("base64url");
  const request=async(resource,method="GET",data,authenticated=true)=>exports[method](new Request("http://localhost:3000/api/local-dev/rest/v1/"+resource,{method,headers:{host:"localhost:3000","Content-Type":"application/json",...(authenticated?{Authorization:"Bearer "+token}:{})},...(data?{body:JSON.stringify(data)}:{})}));
  const rotate=data=>request("rpc/crm_rotate_leads","POST",data);
  assert.equal((await request("leads","GET",null,false)).status,401);
  const payload={p_lead_ids:["rnr","cold","potential","archived","rnr"],p_expected_versions:{rnr:version,cold:version,potential:version,archived:version}};
  const rotated=await(await rotate(payload)).json();
  assert.equal(rotated.length,4);assert.equal(rotated.filter(r=>r.rotated).length,2);
  assert.ok(rotated.filter(r=>r.rotated).every(r=>r.new_owner!==r.previous_owner));
  assert.equal(new Set(rotated.filter(r=>r.rotated).map(r=>r.new_owner)).size,2);
  const stale=await(await rotate(payload)).json();assert.equal(stale.filter(r=>r.rotated).length,0);
  let saved=JSON.parse(await readFile(path.join(temporary,".local-dev/crm.json"),"utf8"));
  assert.equal(saved.crm_lead_assignments.filter(r=>r.reason==="Rotation").length,2);
  assert.equal(saved.leads.find(l=>l.id==="rnr").sales_remarks,"Keep notes");
  assert.equal(saved.leads.find(l=>l.id==="rnr").status,"RINGING NOT RESPONDING");
  assert.equal((await request("crm_lead_assignments","DELETE")).status,403);
  assert.equal((await request("crm_audit_events","POST",{})).status,403);
  await request("rpc/crm_add_lead_comment","POST",{p_lead_id:"rnr",p_comment:"Worked this lead"});
  await request("leads?id=eq.rnr","PATCH",{sales_remarks:"Updated work"});
  await request("crm_lead_activity","POST",{lead_id:"rnr",kind:"CALL",outcome:"No answer",actor_id:b});
  saved=JSON.parse(await readFile(path.join(temporary,".local-dev/crm.json"),"utf8"));
  assert.equal(saved.crm_lead_activity[0].actor_id,admin);
  const lead=saved.leads.find(l=>l.id==="rnr");
  assert.ok(lead.activities.some(r=>r.kind==="comment"&&r.actor_id===admin));
  assert.ok(lead.activities.some(r=>r.kind==="remark_change"&&r.actor_id===admin));
  assert.ok(saved.crm_audit_events.some(r=>r.record_id==="rnr"&&r.actor_id===admin&&r.after_data.sales_remarks==="Updated work"));
  saved.crm_member_profiles=saved.crm_member_profiles.filter(m=>[admin,lead.owner_id].includes(m.user_id));
  await writeFile(path.join(temporary,".local-dev/crm.json"),JSON.stringify(saved));
  const unavailable=await(await rotate({p_lead_ids:["rnr"],p_expected_versions:{rnr:lead.updated_at}})).json();
  assert.equal(unavailable[0].message,"No other employee is available");
  assert.equal((await rotate({p_lead_ids:[],p_expected_versions:{}})).status,400);
  // Reviewed merges preserve the chosen record, original source, linked visits
  // and work. A stale review cannot merge and changed records cannot be undone.
  await request("leads","POST",[{id:"merge-target",shareholder_name:"Same Person",company:"Example Ltd",holding_value:"1000",status:"POTENTIAL",sales_remarks:"Target work"},{id:"merge-source",shareholder_name:"Same Person",company:"Example Limited",holding_value:"2000",status:"COLD",sales_remarks:"Source work",mobile_number:"9876543210",activities:[{at:version,actor_id:a,kind:"comment",note:"Earlier employee work"}]}]);
  await request("crm_visits","POST",{id:"linked-visit",lead_id:"merge-source",assigned_to:admin,status:"PLANNED",scheduled_at:"2026-10-20T09:00:00Z",location:"Test address"});
  const read=async()=>JSON.parse(await readFile(path.join(temporary,".local-dev/crm.json"),"utf8"));
  const getReview=async()=>{const db=await read();return {p_target:"merge-target",p_source:"merge-source",p_expected_target_updated_at:db.leads.find(l=>l.id==="merge-target").updated_at,p_expected_source_updated_at:db.leads.find(l=>l.id==="merge-source").updated_at}};
  const review=await getReview(),merged=await request("rpc/crm_merge_leads_reviewed","POST",review);assert.equal(merged.status,200);const mergeId=await merged.json();
  saved=await read();assert.equal(saved.leads.find(l=>l.id==="merge-target").holding_value,"1000");assert.equal(saved.leads.find(l=>l.id==="merge-target").status,"POTENTIAL");
  assert.ok(saved.leads.find(l=>l.id==="merge-target").sales_remarks.includes("Source work"));assert.ok(saved.leads.find(l=>l.id==="merge-source").archived_at);assert.equal(saved.crm_visits.find(v=>v.id==="linked-visit").lead_id,"merge-target");
  assert.ok(saved.crm_merge_events.find(m=>m.id===mergeId).source_before.activities.some(a=>a.note==="Earlier employee work"));
  assert.equal((await request("rpc/crm_undo_merge","POST",{p_event:mergeId})).status,200);
  saved=await read();assert.equal(saved.leads.find(l=>l.id==="merge-target").sales_remarks,"Target work");assert.ok(!saved.leads.find(l=>l.id==="merge-source").archived_at);assert.equal(saved.crm_visits.find(v=>v.id==="linked-visit").lead_id,"merge-source");
  assert.equal((await request("rpc/crm_merge_leads_reviewed","POST",review)).status,409);
  const second=await(await request("rpc/crm_merge_leads_reviewed","POST",await getReview())).json();
  await request("leads?id=eq.merge-target","PATCH",{sales_remarks:"New work after merge"});
  assert.equal((await request("rpc/crm_undo_merge","POST",{p_event:second})).status,409);
 }finally{
  process.chdir(previousCwd);process.env=environment;
  await rm(temporary,{recursive:true,force:true});
 }
});
