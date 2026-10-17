import {holdingAmount} from "./leadAmounts";
export {holdingAmount} from "./leadAmounts";
export type ReportRow=Record<string,any>;
export type LeadAction={id:string;leadId:string;leadName:string;company:string;reference:string;actorId:string|null;at:string;type:string;detail:string;holding:number|null;valueSource:"Recorded"|"Current"|"Unavailable"};
export type ReportData={leads:ReportRow[];activity:ReportRow[];visits:ReportRow[];audit:ReportRow[];assignments:ReportRow[];merges:ReportRow[];activeDays:ReportRow[]};
export const istDay=(value:string)=>{const time=Date.parse(value);return Number.isFinite(time)?new Date(time+19800000).toISOString().slice(0,10):""};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const label=(key:string)=>key.replace(/_/g," ");
const describe=(before:ReportRow,after:ReportRow,fields:string[])=>fields.map(f=>label(f)+": "+String(before[f]??"(empty)")+" → "+String(after[f]??"(empty)")).join("; ");
export function buildLeadActions(data:ReportData):LeadAction[]{
 const leads=new Map(data.leads.map(l=>[l.id,l])),actions:LeadAction[]=[],seenEntries=new Set<string>(),auditedVisitCreates=new Set<string>(),auditedVisitCompletions=new Map<string,number[]>(),auditedVisitCancellations=new Set<string>(),assignmentTimes=new Map<string,number[]>();
 const assignmentRows=[...data.assignments],assignmentIds=new Set(assignmentRows.map(a=>a.id)),assignmentAuditAt=new Map<string,number[]>(),activityIds=new Set(data.activity.map(a=>a.id));
 for(const e of data.audit)if(e.entity==="crm_lead_assignments"){
  const row=e.after_data||e.before_data;if(row&&!assignmentIds.has(row.id)){assignmentRows.push(row);assignmentIds.add(row.id)}
  if(e.action==="INSERT"){const times=assignmentAuditAt.get(e.record_id)||[];times.push(Date.parse(e.at));assignmentAuditAt.set(e.record_id,times)}
 }
 const snapshots=new Map<string,{at:number;row:ReportRow}[]>();
 for(const e of data.audit)if(e.entity==="leads"){
  const row=e.after_data||e.before_data;if(!row)continue;
  const list=snapshots.get(e.record_id)||[];list.push({at:Date.parse(e.at),row});snapshots.set(e.record_id,list);
 }
 for(const rows of snapshots.values())rows.sort((a,b)=>a.at-b.at);
 const entryKey=(leadId:string,e:ReportRow)=>JSON.stringify([leadId,e.at,e.actor_id||null,e.kind||"",e.field||"",e.note||""]);
 const entryWithoutLead=(e:ReportRow)=>JSON.stringify([e.at,e.actor_id||null,e.kind||"",e.field||"",e.note||""]);
 const mergedEntries=new Set<string>();
 const originalEntryLead=new Map<string,string>();
 for(const m of [...data.merges].sort((a,b)=>Date.parse(a.merged_at)-Date.parse(b.merged_at)))for(const e of m.source_before?.activities||[]){const key=entryWithoutLead(e);mergedEntries.add(key);if(!originalEntryLead.has(key))originalEntryLead.set(key,m.source_id)}
 const add=(id:string,leadId:string,actorId:string|null,at:string,type:string,detail:string,snapshot?:ReportRow)=>{
  if(!at||!Number.isFinite(Date.parse(at)))return;
  const timeline=snapshots.get(leadId)||[];let low=0,high=timeline.length-1,index=-1;
  while(low<=high){const mid=(low+high)>>1;if(timeline[mid].at<=Date.parse(at)){index=mid;low=mid+1}else high=mid-1}
  const historical=snapshot||(index>=0?timeline[index].row:undefined);
  const current=leads.get(leadId),record=historical||current||timeline[timeline.length-1]?.row||{};
  const recorded=holdingAmount(historical?.holding_value),holding=historical?recorded:holdingAmount(current?.holding_value);
  actions.push({id,leadId,leadName:record.shareholder_name||current?.shareholder_name||"Deleted or unavailable lead",company:record.company||current?.company||"",reference:record.ref_id||current?.ref_id||leadId,actorId:actorId||null,at,type,detail,holding,valueSource:recorded!==null?"Recorded":holding!==null?"Current":"Unavailable"});
 };
 const entry=(leadId:string,e:ReportRow,id:string,snapshot?:ReportRow,legacy=false)=>{
  const key=entryKey(leadId,e);if(seenEntries.has(key))return;seenEntries.add(key);
  if(e.kind==="remark_change")return; // Field differences below are authoritative.
  if(!e.note)return;
  if(/^source record merged;/i.test(e.note))return;
  if(/^status changed:/i.test(e.note)){if(legacy)add(id,leadId,e.actor_id||null,e.at,"Status changed",e.note,snapshot);return;}
  if(/^record updated by /i.test(e.note)){if(legacy)add(id,leadId,e.actor_id||null,e.at,"Lead details edited",e.note,snapshot);return;}
  add(id,leadId,e.actor_id||null,e.at,e.kind==="comment"?"Comment added":"Note added",e.note,snapshot);
 };
 for(const a of assignmentRows){
  if(!["Rotation","Transfer"].includes(a.reason))continue;
  const key=a.lead_id+"|"+a.from_owner_id+"|"+a.to_owner_id,times=assignmentTimes.get(key)||[];times.push(Date.parse(a.assigned_at));
  times.push(...(assignmentAuditAt.get(a.id)||[]));
  assignmentTimes.set(key,times);
  add("assignment-"+a.id,a.lead_id,a.actor_id,a.assigned_at,a.reason==="Rotation"?"Lead rotated":"Lead transferred",(a.from_owner_name||a.from_owner_id||"Unassigned")+" → "+(a.to_owner_name||a.to_owner_id));
 }
 const mergeSideEffects=new Set<string>();
 for(const m of data.merges){
  for(const id of [m.target_id,m.source_id]){
   mergeSideEffects.add(id+"|"+Date.parse(m.merged_at));
   if(m.restored_at)mergeSideEffects.add(id+"|"+Date.parse(m.restored_at));
  }
  mergeSideEffects.add(m.target_id+"|"+Date.parse(m.target_after_updated_at));
  add("merge-"+m.id,m.target_id,m.merged_by,m.merged_at,"Duplicates merged","Merged "+(m.source_before?.ref_id||m.source_id)+" into "+(m.target_before?.ref_id||m.target_id),m.target_before);
  if(m.restored_at){const restored=data.audit.find(e=>e.entity==="crm_merge_events"&&e.record_id===m.id&&e.after_data?.restored_at&&!e.before_data?.restored_at);add("restore-merge-"+m.id,m.target_id,restored?.actor_id||m.restored_by||null,m.restored_at,"Merge restored","Original records restored",m.target_before)}
 }
 for(const event of data.audit){
  const before=event.before_data||{},after=event.after_data||{},actor=event.actor_id||null,at=event.at;
  if(event.entity==="crm_visits"){
   const visit=event.action==="DELETE"?before:after;
   const type=event.action==="DELETE"?"Visit deleted":event.action==="INSERT"?(visit.status==="COMPLETED"?"Visit completed":"Visit scheduled"):!equal(before.status,after.status)&&after.status==="COMPLETED"?"Visit completed":!equal(before.status,after.status)&&after.status==="CANCELLED"?"Visit cancelled":"Visit updated";
   if(event.action==="INSERT")auditedVisitCreates.add(event.record_id);
   if(type==="Visit completed"){const stamps=auditedVisitCompletions.get(event.record_id)||[];stamps.push(Date.parse(visit.completed_at||at));auditedVisitCompletions.set(event.record_id,stamps)}
   if(type==="Visit cancelled")auditedVisitCancellations.add(event.record_id);
   if(event.action==="UPDATE"&&Object.keys(after).every(k=>["updated_at","contact_name","company"].includes(k)||equal(before[k],after[k])))continue;
   if(event.action==="UPDATE"&&before.lead_id!==after.lead_id&&Object.keys(after).every(k=>["updated_at","lead_id"].includes(k)||equal(before[k],after[k])))continue;
   add("visit-audit-"+event.id,visit.lead_id,actor,at,type,[visit.scheduled_at,visit.location,visit.outcome,visit.notes].filter(Boolean).join(" · "));continue;
  }
  if(event.entity==="crm_lead_activity"&&event.action==="DELETE"){add("activity-delete-"+event.id,before.lead_id||"deleted-"+event.record_id,actor,at,"Activity log deleted",[before.kind,before.outcome,before.notes].filter(Boolean).join(" · "));continue}
  if(event.entity==="crm_lead_activity"&&event.action==="INSERT"&&!activityIds.has(event.record_id)){add("activity-"+event.record_id,after.lead_id||"deleted-"+event.record_id,after.actor_id||actor,after.occurred_at||at,after.kind==="CALL"?"Call logged":after.kind==="EMAIL"?"Email logged":"Note logged",[after.outcome,after.notes].filter(Boolean).join(" · "));continue}
  if(event.entity!=="leads")continue;
  const id=event.record_id;
  if(event.action==="INSERT"){add("create-"+event.id,id,actor,at,"Lead created","Lead added to the CRM",after);continue}
  if(event.action==="DELETE"){add("delete-"+event.id,id,actor,at,"Lead deleted","Lead deleted; recorded details retained in reports",before);continue}
  if(event.action!=="UPDATE")continue;
  const priorEntries=Array.isArray(before.activities)?before.activities:[],afterEntries=Array.isArray(after.activities)?after.activities:[];
  const prior=new Set(priorEntries.map((e:ReportRow)=>entryKey(id,e)));
  const isMerge=mergeSideEffects.has(id+"|"+Date.parse(at))||mergeSideEffects.has(id+"|"+Date.parse(after.updated_at));
  for(const e of afterEntries)if(!prior.has(entryKey(id,e))){
   if(isMerge){seenEntries.add(entryKey(id,e));continue;}
   entry(id,{...e,actor_id:actor,at:e.at||at},"comment-"+event.id+"-"+afterEntries.indexOf(e),after);seenEntries.add(entryKey(id,e));
  }
  if(isMerge)continue;
  const changed=Object.keys(after).filter(k=>!equal(before[k],after[k]));
  if(changed.includes("status"))add("status-"+event.id,id,actor,at,"Status changed",describe(before,after,["status"]),after);
  const followup=changed.filter(k=>["followup_date","followup_time","followup_completed_at"].includes(k));
  if(followup.length)add("followup-"+event.id,id,actor,at,after.followup_completed_at&&!equal(before.followup_completed_at,after.followup_completed_at)?"Follow-up completed":!after.followup_date?"Follow-up cleared":"Follow-up scheduled",describe(before,after,followup),after);
  for(const field of ["input_remarks","sales_remarks"])if(changed.includes(field))add(field+"-"+event.id,id,actor,at,field==="input_remarks"?"Mining remarks updated":"Sales remarks updated",describe(before,after,[field]),after);
  if(changed.includes("owner_id")&&!(assignmentTimes.get(id+"|"+before.owner_id+"|"+after.owner_id)||[]).some(t=>Math.abs(t-Date.parse(at))<2000))add("transfer-"+event.id,id,actor,at,"Lead transferred",String(before.owner_id)+" → "+String(after.owner_id),after);
  if(changed.includes("archived_at"))add("archive-"+event.id,id,actor,at,after.archived_at?"Lead archived":"Lead restored",after.archived_reason||"Archive state changed",after);
  const other=changed.filter(k=>!["id","updated_at","created_at","activities","status","owner_id","followup_date","followup_time","followup_completed_at","followup_priority_date","input_remarks","sales_remarks","country_group","archived_at","archived_reason"].includes(k));
  if(other.length)add("edit-"+event.id,id,actor,at,"Lead details edited",describe(before,after,other),after);
 }
 for(const a of data.activity)add("activity-"+a.id,a.lead_id||"deleted-"+a.id,a.actor_id,a.occurred_at,a.kind==="CALL"?"Call logged":a.kind==="EMAIL"?"Email logged":"Note logged",[a.outcome,a.notes].filter(Boolean).join(" · "));
 for(const v of data.visits){
  if(!auditedVisitCreates.has(v.id))add("visit-plan-"+v.id,v.lead_id,v.created_by,v.created_at,"Visit scheduled",[v.scheduled_at,v.location].filter(Boolean).join(" · "));
  if(v.status==="COMPLETED"&&!(auditedVisitCompletions.get(v.id)||[]).some(t=>Math.abs(t-Date.parse(v.completed_at))<2000))add("visit-complete-"+v.id,v.lead_id,v.completed_by||null,v.completed_at,"Visit completed",[v.outcome,v.notes].filter(Boolean).join(" · "));
  if(v.status==="CANCELLED"&&v.cancelled_at&&!auditedVisitCancellations.has(v.id))add("visit-cancel-"+v.id,v.lead_id,v.cancelled_by||null,v.cancelled_at,"Visit cancelled",v.notes||"");
 }
 for(const l of data.leads)for(const [index,e] of (l.activities||[]).entries()){
  // Copied source comments are represented by their original audit events when
  // available. Never credit them to the administrator who performed the merge.
  if(mergedEntries.has(entryWithoutLead(e))&&originalEntryLead.get(entryWithoutLead(e))!==l.id)continue;
  if(e.kind==="remark_change"){
   const exists=actions.some(a=>a.leadId===l.id&&a.actorId===(e.actor_id||null)&&a.type===(e.field==="input_remarks"?"Mining remarks updated":"Sales remarks updated")&&Math.abs(Date.parse(a.at)-Date.parse(e.at))<1000);
   if(!exists)add("legacy-remark-"+l.id+"-"+index,l.id,e.actor_id,e.at,e.field==="input_remarks"?"Mining remarks updated":"Sales remarks updated",e.note||e.after||"");
  }else entry(l.id,e,"legacy-comment-"+l.id+"-"+index,undefined,true);
 }
 return actions.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||a.id.localeCompare(b.id));
}
export function filterLeadActions(actions:LeadAction[],filters:{from:string;to:string;actorId?:string;type?:string;search?:string}){
 const search=filters.search?.trim().toLowerCase()||"";
 return actions.filter(a=>{const day=istDay(a.at);return day>=filters.from&&day<=filters.to&&(!filters.actorId||a.actorId===filters.actorId||filters.actorId==="__unknown__"&&!a.actorId)&&(!filters.type||a.type===filters.type)&&(!search||[a.leadName,a.company,a.reference,a.detail,a.leadId].some(v=>v.toLowerCase().includes(search))) });
}
export function actionTotals(actions:LeadAction[]){
 const leadValues=new Map<string,number|null>();for(const a of actions)if(!leadValues.has(a.leadId))leadValues.set(a.leadId,a.holding);
 return {actions:actions.length,leads:leadValues.size,holding:[...leadValues.values()].reduce<number>((sum,v)=>sum+(v??0),0),unvalued:[...leadValues.values()].filter(v=>v===null).length};
}
export function reportCsv(rows:unknown[][]){return "\uFEFF"+rows.map(row=>row.map(value=>{let s=String(value??"");if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(",")).join("\r\n");}
