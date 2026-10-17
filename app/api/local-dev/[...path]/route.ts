import {createHmac,randomUUID,scryptSync,timingSafeEqual} from "node:crypto";
import {mkdir,readFile,writeFile,rename} from "node:fs/promises";
import path from "node:path";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const adminId="00000000-0000-4000-8000-000000000001";
type Row=Record<string,any>;
type Database=Record<string,Row[]>;
const tables=["leads","crm_member_profiles","crm_visits","crm_lead_activity","crm_active_days","crm_audit_events","crm_merge_events","crm_lead_assignments"];
const directory=path.join(process.cwd(),".local-dev");
const databaseFile=path.join(directory,"crm.json");
let queue:Promise<unknown>=Promise.resolve();
const json=(data:unknown,status=200,headers:Record<string,string>={})=>Response.json(data,{status,headers:{"Cache-Control":"no-store",...headers}});
const failure=(message:string,status=400)=>json({message,error:message,code:"LOCAL_DEV_ERROR"},status);
const now=()=>new Date().toISOString();
const updatedAfter=(previous:string)=>new Date(Math.max(Date.now(),(Date.parse(previous)||0)+1)).toISOString();
const user=()=>({id:adminId,email:process.env.LOCAL_DEV_ADMIN_EMAIL,role:"authenticated",aud:"authenticated",app_metadata:{provider:"email",providers:["email"]},user_metadata:{display_name:"Puneet Jaiswal"},created_at:"2026-01-01T00:00:00.000Z"});
function token(kind:string,seconds:number){
 const head=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");
 const body=Buffer.from(JSON.stringify({sub:adminId,email:user().email,role:"authenticated",aud:"authenticated",kind,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+seconds})).toString("base64url");
 const signature=createHmac("sha256",process.env.LOCAL_DEV_SESSION_SECRET!).update(`${head}.${body}`).digest("base64url");
 return `${head}.${body}.${signature}`;
}
function validToken(value:string,kind:string){
 try{
  const [head,body,signature,...extra]=value.split(".");
  if(extra.length||!head||!body||!signature)return false;
  const expected=createHmac("sha256",process.env.LOCAL_DEV_SESSION_SECRET!).update(`${head}.${body}`).digest();
  const actual=Buffer.from(signature,"base64url");
  if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;
  const payload=JSON.parse(Buffer.from(body,"base64url").toString());
  return payload.sub===adminId&&payload.kind===kind&&payload.exp>Date.now()/1000;
 }catch{return false;}
}
function session(){return {access_token:token("access",3600),refresh_token:token("refresh",604800),token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user()};}
function validPassword(password:unknown){
 const [salt,hash]=process.env.LOCAL_DEV_ADMIN_PASSWORD_HASH!.split(":");
 if(typeof password!=="string"||password.length>1024||!salt||!hash)return false;
 const expected=Buffer.from(hash,"hex"),actual=scryptSync(password,salt,64);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
async function readDatabase():Promise<Database>{
 try{
  const db:Database=JSON.parse(await readFile(databaseFile,"utf8"));
  for(const table of tables)db[table]??=[];
  for(const lead of db.leads)if(!db.crm_lead_assignments.some(a=>a.lead_id===lead.id))assignment(db,lead,null,"Tracking started");
  return db;
 }
 catch(error){
  if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
  return Object.fromEntries(tables.map(table=>[table,table==="crm_member_profiles"?[{user_id:adminId,display_name:"Puneet Jaiswal",designation:"Administrator",completed_at:now()}]:[]]));
 }
}
function memberName(db:Database,id:string){return db.crm_member_profiles.find(m=>m.user_id===id)?.display_name||(id===adminId?user().email:id);}
function assignment(db:Database,lead:Row,previousOwner:string|null,reason:string){
 const row={id:randomUUID(),lead_id:lead.id,from_owner_id:previousOwner,to_owner_id:lead.owner_id,actor_id:reason==="Tracking started"?null:adminId,from_owner_name:previousOwner?memberName(db,previousOwner):null,to_owner_name:memberName(db,lead.owner_id),actor_name:reason==="Tracking started"?null:memberName(db,adminId),assigned_at:now(),status:lead.status,reason};
 db.crm_lead_assignments.push(row);if(reason!=="Tracking started")audit(db,null,row,"crm_lead_assignments");
}
function audit(db:Database,before:Row|null,after:Row|null,entity="leads"){
 db.crm_audit_events.push({id:randomUUID(),at:now(),actor_id:adminId,entity,record_id:(after||before)!.id,action:!after?"DELETE":before?"UPDATE":"INSERT",before_data:before,after_data:after?structuredClone(after):null});
}
function leadChanges(before:Row,after:Row){
 const entries=[...(before.activities||[])];
 for(const entry of (after.activities||[]).slice(entries.length))entries.push({...entry,at:now(),actor_id:adminId});
 for(const field of ["input_remarks","sales_remarks"])if(String(before[field]||"")!==String(after[field]||""))entries.push({at:now(),actor_id:adminId,kind:"remark_change",field,before:before[field]||"",after:after[field]||"",note:(field==="input_remarks"?"Mining remarks":"Sales remarks")+" updated"});
 after.activities=entries;
}
async function saveDatabase(db:Database){
 await mkdir(directory,{recursive:true});
 const temporary=path.join(directory,`${randomUUID()}.tmp`);
 await writeFile(temporary,JSON.stringify(db,null,2),{mode:0o600});
 await rename(temporary,databaseFile);
}
function matches(row:Row,key:string,expression:string):boolean{
 const dot=expression.indexOf("."),op=expression.slice(0,dot),value=expression.slice(dot+1),actual=row[key];
 if(op==="not")return !matches(row,key,value);
 if(op==="is")return value==="null"?actual==null:String(actual)===value;
 if(op==="eq")return String(actual)===value;
 if(op==="neq")return String(actual)!==value;
 if(op==="in")return value.replace(/^\(|\)$/g,"").split(",").includes(String(actual));
 if(op==="ilike"){
  const pattern=value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/%/g,".*").replace(/_/g,".");
  return new RegExp(`^${pattern}$`,"i").test(String(actual??""));
 }
 if(actual==null)return false;
 if(op==="gte")return String(actual)>=value;
 if(op==="lte")return String(actual)<=value;
 if(op==="gt")return String(actual)>value;
 if(op==="lt")return String(actual)<value;
 throw new Error(`Filter ${op} is not available in local development.`);
}
function filtered(rows:Row[],params:URLSearchParams){
 return rows.filter(row=>[...params].every(([key,value])=>{
  if(["select","order","offset","limit","columns","on_conflict"].includes(key))return true;
  if(key==="or")return value.replace(/^\(|\)$/g,"").split(",").some(term=>{const dot=term.indexOf(".");return matches(row,term.slice(0,dot),term.slice(dot+1));});
  return matches(row,key,value);
 }));
}
function records(data:Row[],request:Request,count=data.length){
 const params=new URL(request.url).searchParams;
 const offset=Number(params.get("offset")||0),limit=Number(params.get("limit")||data.length);
 const orders=(params.get("order")||"").split(",").filter(Boolean);
 data=[...data].sort((a,b)=>{
  for(const order of orders){
   const [key,direction,...options]=order.split("."),av=a[key],bv=b[key];
   if(av==null&&bv==null)continue;
   if(av==null)return options.includes("nullsfirst")?-1:1;
   if(bv==null)return options.includes("nullsfirst")?1:-1;
   if(av!==bv)return (av>bv?1:-1)*(direction==="desc"?-1:1);
  }return 0;
 }).slice(offset,offset+limit);
 const selection=params.get("select");
 if(selection&&selection!=="*")data=data.map(row=>Object.fromEntries(selection.split(",").map(key=>[key,row[key]??null])));
 const headers={"Content-Range":`${data.length?`${offset}-${offset+data.length-1}`:"*"}/${count}`};
 if(request.method==="HEAD")return new Response(null,{headers});
 if(request.headers.get("Accept")?.includes("application/vnd.pgrst.object+json")){
  if(data.length!==1)return json({code:"PGRST116",message:"Expected exactly one record",details:`The result contains ${data.length} rows`},406,headers);
  return json(data[0],200,headers);
 }
 return json(data,200,headers);
}
async function databaseRequest(request:Request,parts:string[],body:Row){
 const db=await readDatabase();
 if(parts[2]==="rpc"){
  const name=parts[3];
  if(name==="crm_team_profiles")return json(db.crm_member_profiles.map(profile=>({...profile,email:profile.user_id===adminId?user().email:profile.email||"",role:profile.user_id===adminId?"admin":"agent"})));
  if(name==="crm_usage_tick")return json({session_seconds:0,today_seconds:0,started_at:now(),server_time:now()});
  if(name==="crm_active_tick")return json({active_today_seconds:0});
  if(name==="crm_daily_usage")return json([]);
  if(name==="crm_export_backup")return json({exported_at:now(),tables:db});
  if(name==="crm_merge_leads_reviewed"){
   const target=db.leads.find(l=>l.id===body.p_target&&!l.archived_at),source=db.leads.find(l=>l.id===body.p_source&&!l.archived_at);
   if(!target||!source||target.id===source.id)return failure("Select two different active records");
   if(!body.p_expected_target_updated_at||!body.p_expected_source_updated_at||target.updated_at!==body.p_expected_target_updated_at||source.updated_at!==body.p_expected_source_updated_at)return failure("A record changed after this review. Refresh and compare both records again.",409);
   const nameKey=(value:string)=>String(value||"").toLowerCase().replace(/\s+/g,"");
   const companyKey=(value:string)=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,"").replace(/(limited|ltd)$/g,"");
   if(nameKey(target.shareholder_name)!==nameKey(source.shareholder_name)||companyKey(target.company)!==companyKey(source.company))return failure("Confirm and correct shareholder/company names before merging; shared contacts alone are not enough");
   const targetBefore=structuredClone(target),sourceBefore=structuredClone(source),stamp=updatedAfter(Date.parse(target.updated_at)>=Date.parse(source.updated_at)?target.updated_at:source.updated_at);
   const linkedVisits=db.crm_visits.filter(v=>v.lead_id===source.id).map(v=>structuredClone(v));
   for(const key of ["registered_address","mobile_number","email","city","state","country"])if(!target[key])target[key]=source[key]||null;
   target.input_remarks=[target.input_remarks,source.input_remarks?`Merged source [${source.ref_id||source.id}]: ${source.input_remarks}`:""].filter(Boolean).join("\n\n");
   const extra=Object.keys(source).filter(k=>!["id","activities","created_at","updated_at","input_remarks","sales_remarks","archived_at","archived_reason"].includes(k)&&source[k]!=null&&source[k]!==""&&JSON.stringify(source[k])!==JSON.stringify(targetBefore[k])).map(k=>`Source ${k.replace(/_/g," ")}: ${source[k]}`);
   target.sales_remarks=[target.sales_remarks,source.sales_remarks,...extra].filter(Boolean).join("\n\n");
   target.activities=[...(target.activities||[]),...(source.activities||[]),{at:stamp,actor_id:adminId,note:"Source record merged; original preserved in merge history"}];target.updated_at=stamp;
   source.archived_at=stamp;source.archived_reason="Merged into "+target.id;source.updated_at=stamp;
   const event={id:randomUUID(),target_id:target.id,source_id:source.id,target_before:targetBefore,source_before:sourceBefore,target_after_updated_at:stamp,source_after_updated_at:stamp,visit_ids:linkedVisits.map(v=>v.id),visits_before:linkedVisits,merged_at:stamp,merged_by:adminId,restored_at:null};
   for(const visit of db.crm_visits.filter(v=>v.lead_id===source.id)){const before=structuredClone(visit);visit.lead_id=target.id;visit.updated_at=stamp;audit(db,before,visit,"crm_visits")}
   db.crm_merge_events.push(event);audit(db,targetBefore,target);audit(db,sourceBefore,source);audit(db,null,event,"crm_merge_events");
   await saveDatabase(db);return json(event.id);
  }
  if(name==="crm_undo_merge"){
   const event=db.crm_merge_events.find(e=>e.id===body.p_event&&!e.restored_at);
   if(!event)return failure("Merge is already restored or missing");
   const target=db.leads.find(l=>l.id===event.target_id),source=db.leads.find(l=>l.id===event.source_id);
   if(!target||!source||target.updated_at!==event.target_after_updated_at||source.updated_at!==(event.source_after_updated_at||event.merged_at))return failure("Records changed after merging; review before restoring",409);
   const moved=db.crm_visits.filter(v=>event.visit_ids.includes(v.id));
   if(moved.length!==event.visit_ids.length||moved.some(v=>v.updated_at!==event.merged_at))return failure("A linked visit changed after merging; review before restoring",409);
   const targetBefore=structuredClone(target),sourceBefore=structuredClone(source),beforeEvent=structuredClone(event),stamp=updatedAfter(Date.parse(target.updated_at)>=Date.parse(source.updated_at)?target.updated_at:source.updated_at);
   for(const key of Object.keys(target))delete target[key];Object.assign(target,event.target_before,{updated_at:stamp});
   for(const key of Object.keys(source))delete source[key];Object.assign(source,event.source_before,{updated_at:stamp});
   for(const visit of moved){const before=structuredClone(visit),original=event.visits_before?.find((v:Row)=>v.id===visit.id);if(original){for(const key of Object.keys(visit))delete visit[key];Object.assign(visit,original,{updated_at:stamp});audit(db,before,visit,"crm_visits")}}
   event.restored_at=stamp;event.restored_by=adminId;audit(db,targetBefore,target);audit(db,sourceBefore,source);audit(db,beforeEvent,event,"crm_merge_events");await saveDatabase(db);return json(null);
  }
  if(name==="crm_rotate_leads"){
   if(!Array.isArray(body.p_lead_ids)||!body.p_lead_ids.length||body.p_lead_ids.length>500)return failure("Select between 1 and 500 leads");
   const versions=body.p_expected_versions;
   if(!versions||typeof versions!=="object"||Array.isArray(versions))return failure("Lead versions are required");
   const outcomes:Row[]=[],received=new Map<string,number>();
   for(const id of [...new Set<string>(body.p_lead_ids)].sort()){
    const lead=db.leads.find(l=>l.id===id),result:Row={lead_id:id,previous_owner:lead?.owner_id||null,new_owner:null,rotated:false,message:""};
    outcomes.push(result);
    if(!lead||lead.archived_at){result.message="Lead unavailable or archived";continue;}
    if(versions[id]!==lead.updated_at){result.message="Lead changed; refresh before rotating";continue;}
    if(!["RINGING NOT RESPONDING","COLD"].includes(lead.status)){result.message="Only RNR and Cold leads are eligible";continue;}
    const candidates=db.crm_member_profiles.filter(m=>m.user_id!==adminId&&m.user_id!==lead.owner_id).sort((a,b)=>(received.get(a.user_id)||0)-(received.get(b.user_id)||0)||db.leads.filter(l=>l.owner_id===a.user_id&&!l.archived_at).length-db.leads.filter(l=>l.owner_id===b.user_id&&!l.archived_at).length||a.user_id.localeCompare(b.user_id));
    if(!candidates.length){result.message="No other employee is available";continue;}
    const before=structuredClone(lead),recipient=candidates[0].user_id;
    lead.owner_id=recipient;lead.updated_at=updatedAfter(before.updated_at);assignment(db,lead,before.owner_id,"Rotation");audit(db,before,lead);
    received.set(recipient,(received.get(recipient)||0)+1);Object.assign(result,{new_owner:recipient,rotated:true,message:"Rotated"});
   }
   await saveDatabase(db);return json(outcomes);
  }
  if(["crm_set_lead_status","crm_add_lead_comment","crm_transfer_lead"].includes(name)){
   const lead=db.leads.find(row=>row.id===body.p_lead_id);
   if(!lead)return failure("Lead not found",404);
   const before=structuredClone(lead);
   if(body.p_expected_updated_at&&lead.updated_at!==body.p_expected_updated_at)return failure("This record changed. Reopen it before saving.",409);
   if(name==="crm_set_lead_status"){
    if(!["NEW","UNTOUCHED","RINGING NOT RESPONDING","COLD","NOT REACHABLE","FOLLOW UP","VISIT","POTENTIAL","CLOSED","CONVERTED","INTERNATIONAL","LOSS","REMINING"].includes(body.p_status))return failure("Invalid lead status");
    lead.status=body.p_status;lead.activities=[...(lead.activities||[]),{at:now(),note:`Status changed: ${before.status} → ${lead.status}`,actor_id:adminId}];
   }
   if(name==="crm_add_lead_comment")lead.activities=[...(lead.activities||[]),{at:now(),note:body.p_comment,actor_id:adminId,kind:"comment"}];
   if(name==="crm_transfer_lead")return failure("Additional employee accounts are not configured in this local workspace.");
   lead.updated_at=updatedAfter(before.updated_at);audit(db,before,lead);await saveDatabase(db);return records([lead],request);
  }
  return failure("This operation is not available in the temporary local workspace.",501);
 }
 const table=parts[2];
 if(!tables.includes(table))return failure("Unknown local table",404);
 if(["crm_lead_assignments","crm_audit_events"].includes(table)&&!["GET","HEAD"].includes(request.method))return failure("History is read-only",403);
 const params=new URL(request.url).searchParams;
 let result=filtered(db[table],params);
 if(request.method==="GET"||request.method==="HEAD")return records(result,request);
 if(request.method==="POST"){
  result=(Array.isArray(body)?body:[body]).map(row=>({id:randomUUID(),created_at:now(),updated_at:now(),...(table==="leads"?{owner_id:adminId,archived_at:null,status:"UNTOUCHED",activities:[]}:{}),...row}));
  db[table].push(...result);
  if(table==="leads")for(const lead of result){assignment(db,lead,null,"Created");audit(db,null,lead);}
  if(table==="crm_lead_activity")for(const row of result){row.actor_id=adminId;row.occurred_at=now();audit(db,null,row,table)}
  if(table==="crm_visits")for(const row of result){const lead=db.leads.find(l=>l.id===row.lead_id);row.created_by=adminId;row.contact_name=lead?.shareholder_name||"";row.company=lead?.company||"";if(row.status==="COMPLETED"){row.completed_at=now();row.completed_by=adminId}audit(db,null,row,table)}
 }else if(request.method==="PATCH"){
  for(const row of result){const before=structuredClone(row);Object.assign(row,body,{updated_at:updatedAfter(before.updated_at)});if(table==="leads"){leadChanges(before,row);if(before.owner_id!==row.owner_id)assignment(db,row,before.owner_id,"Transfer");audit(db,before,row);}if(table==="crm_visits"){row.created_by=before.created_by;row.created_at=before.created_at;if(row.status==="COMPLETED"){row.completed_at=before.status==="COMPLETED"?before.completed_at:row.updated_at;row.completed_by=before.status==="COMPLETED"?before.completed_by:adminId}else{row.completed_at=null;row.completed_by=null}audit(db,before,row,table)}}
 }else if(request.method==="DELETE"){
  if(["leads","crm_visits","crm_lead_activity"].includes(table))for(const row of result)audit(db,structuredClone(row),null,table);
  db[table]=db[table].filter(row=>!result.includes(row));
  if(table==="leads")db.crm_lead_assignments=db.crm_lead_assignments.filter(a=>!result.some(l=>l.id===a.lead_id));
 }else return failure("Unsupported method",405);
 if(table==="leads")for(const row of result)row.followup_priority_date=row.followup_date||null;
 await saveDatabase(db);
 return request.headers.get("Prefer")?.includes("return=representation")?records(result,request):new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
}
async function handle(request:Request){
 const url=new URL(request.url),hosts=["localhost","127.0.0.1","[::1]"];
 if(process.env.NODE_ENV!=="development"||process.env.LOCAL_DEV_AUTH!=="true"||process.env.NEXT_PUBLIC_LOCAL_DEV!=="true"||!hosts.includes(url.hostname))return new Response(null,{status:404});
 if(!process.env.LOCAL_DEV_ADMIN_EMAIL||!process.env.LOCAL_DEV_ADMIN_PASSWORD_HASH||!process.env.LOCAL_DEV_SESSION_SECRET)return failure("Local development credentials are not configured.",503);
 const host=request.headers.get("host");
 if(!host||!hosts.includes(new URL(`http://${host}`).hostname))return new Response(null,{status:404});
 const origin=request.headers.get("origin");
 if(origin&&origin!==url.origin)return failure("Cross-origin requests are not allowed.",403);
 const parts=url.pathname.replace("/api/local-dev/","").split("/");
 try{
  const body=["POST","PATCH"].includes(request.method)?await request.json().catch(()=>({})):{};
  if(parts.join("/")==="auth/v1/token"&&request.method==="POST"){
   if(url.searchParams.get("grant_type")==="refresh_token")return validToken(body.refresh_token||"","refresh")?json(session()):failure("Invalid refresh token",401);
   const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
   return validPassword(body.password)&&email===process.env.LOCAL_DEV_ADMIN_EMAIL.toLowerCase()?json(session()):failure("Invalid login credentials",400);
  }
  const bearer=request.headers.get("authorization")?.replace(/^Bearer /i,"")||"";
  if(!validToken(bearer,"access"))return failure("Sign in to the local workspace first.",401);
  if(parts.join("/")==="auth/v1/user"&&request.method==="GET")return json(user());
  if(parts.join("/")==="auth/v1/logout"&&request.method==="POST")return new Response(null,{status:204});
  if(parts[0]!=="rest"||parts[1]!=="v1")return failure("This authentication operation is not available locally.",403);
  // Serialize local reads and writes so concurrent saves cannot overwrite each other.
  const task=queue.then(()=>databaseRequest(request,parts,body));
  queue=task.catch(()=>undefined);return await task;
 }catch(error){console.error("Local workspace request failed:",error);return failure("The local workspace could not complete this request.",500);}
}
export {handle as GET,handle as HEAD,handle as POST,handle as PATCH,handle as DELETE};
