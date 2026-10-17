import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
import ts from "typescript";
const cache=new Map();
function moduleAt(file,parent=import.meta.url){const url=new URL(file,parent);if(cache.has(url.href))return cache.get(url.href);const source=ts.transpileModule(readFileSync(url,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};cache.set(url.href,exports);const require=createRequire(url);new Function("require","exports",source)(name=>name.startsWith(".")?moduleAt(name+".ts",url):require(name),exports);return exports;}
const duplicate=await moduleAt("../lib/leadDuplicates.ts"),report=await moduleAt("../lib/leadReporting.ts");
const lead=(id,extra={})=>({id,shareholder_name:"Amit Kumar Shah",company:"Example Industries Limited",owner_id:"a",holding_value:"₹1,20,000",status:"COLD",activities:[],...extra});
const empty=()=>({leads:[],activity:[],visits:[],audit:[],assignments:[],merges:[],activeDays:[]});

test("duplicates normalize names, company suffixes, multiple contacts and compare every stored field",()=>{
 const left=lead("a",{mobile_number:"+91 98765 43210 / 9988776655",email:"AMIT@EXAMPLE.COM; second@example.com",registered_address:"10, Example Road",city:"Mumbai",custom_field:"source A"});
 const right=lead("b",{shareholder_name:"Mr. Shah Amit Kumar",company:"Example Industries Ltd.",mobile_number:"09876543210",email:"amit@example.com",registered_address:"10 Example Road",city:"Pune",custom_field:"source B"});
 const pair=duplicate.compareDuplicates(left,right);
 assert.equal(pair.confidence,"Strong match");assert.ok(pair.reasons.includes("Shared phone number"));assert.ok(pair.reasons.includes("Shared email address"));
 assert.equal(pair.fields.find(f=>f.field==="custom_field").result,"different");
 assert.equal(pair.fields.find(f=>f.field==="city").result,"different");
 assert.equal(pair.fields.find(f=>f.field==="activities").result,"missing"); // Empty histories are not positive match evidence.
});
test("shared family contacts, company conflicts and empty values cannot become strong duplicates",()=>{
 const family=duplicate.compareDuplicates(lead("a",{mobile_number:"9876543210"}),lead("b",{shareholder_name:"Sunita Jain",mobile_number:"9876543210"}));
 assert.equal(family.confidence,"Review needed");assert.ok(family.conflicts.some(c=>c.includes("Different shareholder")));
 const holdings=duplicate.compareDuplicates(lead("a"),lead("b",{company:"Another Corporation"}));assert.equal(holdings.confidence,"Review needed");
 assert.equal(duplicate.compareDuplicates(lead("a",{shareholder_name:"N/A",company:"N/A"}),lead("b",{shareholder_name:"N/A",company:"N/A"})),null);
 assert.equal(duplicate.compareDuplicates(lead("a"),lead("b",{shareholder_name:"Other Person",company:"Other Company"})),null);
});
test("scan finds typo candidates, cross-owner matches and reference collisions, and excludes archived records",()=>{
 const result=duplicate.findDuplicatePairs([lead("a",{ref_id:"CASE-01"}),lead("b",{shareholder_name:"Amit Kumar Shaah",owner_id:"b"}),lead("c",{shareholder_name:"Unrelated Name",company:"Other",ref_id:"case 01"}),lead("d",{archived_at:"2026-10-01"})]);
 assert.equal(result.scanned,3);assert.ok(result.pairs.some(p=>p.key==="a|b"));assert.ok(result.pairs.some(p=>p.key==="a|c"));assert.ok(!result.pairs.some(p=>p.key.includes("d")));
 const limited=duplicate.findDuplicatePairs(Array.from({length:30},(_,i)=>lead(String(i))),10);assert.equal(limited.limited,true);assert.equal(limited.compared,10);
});
test("holding values parse Indian amounts and reject ambiguous or foreign amounts",()=>{
 assert.equal(report.holdingAmount("₹1,23,456.50"),123456.5);assert.equal(report.holdingAmount("Rs. 2.5 lakh"),250000);assert.equal(report.holdingAmount("1.2 cr"),12000000);assert.equal(report.holdingAmount("0"),0);
 for(const bad of ["N/A","USD 100","$200","100 - 200","-10","20%","1 lakh + 2 lakh","approx 10 lakh"])assert.equal(report.holdingAmount(bad),null);
});
test("reports retain prior workers, split real actions and avoid double counting comments/calls/rotations",()=>{
 const d=empty(),comment={at:"2026-10-17T09:00:00Z",actor_id:"a",kind:"comment",note:"Called and discussed next steps"};
 const before=lead("l",{holding_value:"100",activities:[],status:"COLD"}),after={...before,status:"FOLLOW UP",followup_date:"2026-10-20",activities:[comment]};
 d.leads=[{...after,owner_id:"b",holding_value:"200"}];
 d.audit=[{id:"edit",entity:"leads",record_id:"l",action:"UPDATE",actor_id:"a",at:comment.at,before_data:before,after_data:after},{id:"owner",entity:"leads",record_id:"l",action:"UPDATE",actor_id:"admin",at:"2026-10-17T10:00:00Z",before_data:after,after_data:{...after,owner_id:"b"}}];
 d.activity=[{id:"call",lead_id:"l",actor_id:"a",kind:"CALL",outcome:"Connected",occurred_at:"2026-10-17T09:30:00Z"}];
 d.assignments=[{id:"rotation",lead_id:"l",actor_id:"admin",from_owner_id:"a",to_owner_id:"b",assigned_at:"2026-10-17T10:00:00Z",reason:"Rotation"}];
 const actions=report.buildLeadActions(d);
 assert.equal(actions.filter(a=>a.type==="Comment added").length,1);assert.equal(actions.filter(a=>a.type==="Call logged").length,1);assert.equal(actions.filter(a=>a.type==="Lead rotated").length,1);assert.equal(actions.filter(a=>a.type==="Lead transferred").length,0);
 assert.ok(actions.filter(a=>["Comment added","Call logged","Status changed","Follow-up scheduled"].includes(a.type)).every(a=>a.actorId==="a"));
 const totals=report.actionTotals(actions);assert.equal(totals.leads,1);assert.equal(totals.holding,100);
 assert.equal(report.filterLeadActions(actions,{from:"2026-10-17",to:"2026-10-17",actorId:"a"}).length,4);
});
test("IST ranges include the correct midnight boundary and exports neutralize formulas",()=>{
 const actions=[{at:"2026-10-16T18:29:59Z",actorId:"a",type:"Call logged"},{at:"2026-10-16T18:30:00Z",actorId:"a",type:"Call logged"},{at:"2026-10-17T18:30:00Z",actorId:"a",type:"Call logged"}];
 assert.equal(report.filterLeadActions(actions,{from:"2026-10-17",to:"2026-10-17"}).length,1);
 const csv=report.reportCsv([["=HYPERLINK(1)","+cmd","-1","@SUM",'comma,quote"',"normal"]]);assert.ok(csv.includes('"\'=HYPERLINK(1)"'));assert.ok(csv.includes('comma,quote""'));
});
test("deleted lead actions and retired assignments remain reportable from preserved evidence",()=>{
 const d=empty();d.audit=[{id:"delete",entity:"leads",record_id:"gone",action:"DELETE",actor_id:"admin",at:"2026-10-17T12:00:00Z",before_data:lead("gone",{holding_value:"500"})},{id:"journal",entity:"crm_lead_assignments",record_id:"assignment",action:"DELETE",at:"2026-10-17T12:00:00Z",before_data:{id:"assignment",lead_id:"gone",actor_id:"admin",assigned_at:"2026-10-17T11:00:00Z",reason:"Rotation",from_owner_id:"a",to_owner_id:"b"}}];
 const actions=report.buildLeadActions(d);assert.ok(actions.some(a=>a.type==="Lead deleted"&&a.holding===500));assert.ok(actions.some(a=>a.type==="Lead rotated"));
});
test("completed visits credit the recorded actor rather than assuming the assignee performed the action",()=>{
 const d=empty();d.leads=[lead("l")];d.visits=[{id:"v",lead_id:"l",assigned_to:"a",status:"COMPLETED",created_by:"admin",created_at:"2026-10-16T09:00:00Z",completed_at:"2026-10-17T10:00:00Z"}];
 d.audit=[{id:"completed",entity:"crm_visits",record_id:"v",action:"UPDATE",actor_id:"b",at:"2026-10-17T10:00:00Z",before_data:{lead_id:"l",status:"PLANNED"},after_data:{lead_id:"l",status:"COMPLETED",outcome:"Met shareholder"}}];
 const actions=report.buildLeadActions(d);assert.equal(actions.filter(a=>a.type==="Visit completed").length,1);assert.equal(actions.find(a=>a.type==="Visit completed").actorId,"b");
});
test("merges retain original comment attribution and do not turn copied comments into new admin work",()=>{
 const d=empty(),note={at:"2026-10-17T09:00:00Z",actor_id:"a",kind:"comment",note:"Original employee conversation"},mergedAt="2026-10-17T10:00:00Z";
 const source=lead("source",{activities:[note]}),target=lead("target");
 const merged={...target,updated_at:mergedAt,activities:[note,{at:mergedAt,actor_id:"admin",note:"Source record merged; original preserved in merge history"}]};
 d.leads=[merged,{...source,archived_at:mergedAt,archived_reason:"Merged into target"}];
 d.merges=[{id:"m",target_id:"target",source_id:"source",merged_by:"admin",merged_at:mergedAt,target_after_updated_at:mergedAt,target_before:target,source_before:source,restored_at:"2026-10-17T11:00:00Z",restored_by:"admin"}];
 d.audit=[{id:"merge-edit",entity:"leads",record_id:"target",actor_id:"admin",action:"UPDATE",at:mergedAt,before_data:target,after_data:merged}];
 const actions=report.buildLeadActions(d),comments=actions.filter(a=>a.type==="Comment added");
 assert.equal(comments.length,1);assert.equal(comments[0].actorId,"a");assert.equal(comments[0].leadId,"source");assert.equal(actions.filter(a=>a.type==="Duplicates merged").length,1);assert.equal(actions.filter(a=>a.type==="Merge restored").length,1);
});
test("repeated owner changes on different dates remain separate actions and deleted activity logs retain the original call",()=>{
 const d=empty();d.leads=[lead("l")];d.assignments=[{id:"now",lead_id:"l",from_owner_id:"a",to_owner_id:"b",actor_id:"admin",reason:"Rotation",assigned_at:"2026-10-17T10:00:00Z"}];
 d.audit=[{id:"old",entity:"leads",record_id:"l",actor_id:"admin",action:"UPDATE",at:"2026-10-01T10:00:00Z",before_data:lead("l"),after_data:lead("l",{owner_id:"b"})},{id:"call-created",entity:"crm_lead_activity",record_id:"call",actor_id:"a",action:"INSERT",at:"2026-10-17T08:00:00Z",after_data:{lead_id:"l",kind:"CALL",actor_id:"a",occurred_at:"2026-10-17T08:00:00Z",outcome:"Connected"}},{id:"call-deleted",entity:"crm_lead_activity",record_id:"call",actor_id:"admin",action:"DELETE",at:"2026-10-17T09:00:00Z",before_data:{lead_id:"l",kind:"CALL",outcome:"Connected"}}];
 const actions=report.buildLeadActions(d);assert.equal(actions.filter(a=>a.type==="Lead transferred").length,1);assert.equal(actions.filter(a=>a.type==="Call logged").length,1);assert.equal(actions.filter(a=>a.type==="Activity log deleted").length,1);
 assert.equal(duplicate.compareLeadFields(lead("a",{holding_value:"₹1,20,000"}),lead("b",{holding_value:"1.2 lakh"})).find(f=>f.field==="holding_value").result,"match");
});
