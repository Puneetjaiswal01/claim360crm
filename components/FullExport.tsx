"use client";
import {useState} from "react";
import {supabase} from "@/lib/supabase";
import {Download} from "lucide-react";
const columns=["ref_id","shareholder_name","registered_address","company","holding_value","mobile_number","mobile_number_type","email","input_remarks","sales_remarks","status","lead_date","followup_date","followup_time","fee_percent","city","state","country","country_group","updated_at"];
export default function FullExport({stage,query,ownerId,countryGroup}:{stage:string;query:string;ownerId?:string;countryGroup?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const exportAll=async()=>{if(busy)return;setBusy(true);setError("");try{
 const lines=[columns.map(c=>'"'+c+'"').join(",")];let offset=0;
 while(true){let q=supabase.from("leads").select(columns.join(",")).is("archived_at",null).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+499);
 if(countryGroup==="unset")q=q.is("country_group",null);else if(countryGroup)q=q.eq("country_group",countryGroup);
 if(ownerId==="__UNASSIGNED__")q=q.is("owner_id",null);else if(ownerId)q=q.eq("owner_id",ownerId);if(stage==="__RECENT__")q=q.gte("created_at",new Date(Date.now()-7*86400000).toISOString());else if(stage)q=q.eq("status",stage);
 if(query.trim()){const term=query.trim().replace(/[%(),]/g,"");q=q.or("shareholder_name.ilike.%"+term+"%,ref_id.ilike.%"+term+"%,company.ilike.%"+term+"%,mobile_number.ilike.%"+term+"%,email.ilike.%"+term+"%")}
 const {data,error:e}=await q;if(e)throw new Error(e.message);
 for(const lead of data||[]){const row=lead as unknown as Record<string,unknown>;lines.push(columns.map(c=>'"'+String(row[c]??"").replace(/"/g,'""')+'"').join(","))}
 if(!data||data.length<500)break;offset+=500;if(offset>=100000)throw new Error("Too many records; apply a filter and try again.");
 }
 const url=URL.createObjectURL(new Blob([String.fromCharCode(65279)+lines.join(String.fromCharCode(13,10))],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download="claim360-leads-"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }catch(e){setError(e instanceof Error?e.message:"Export failed")}finally{setBusy(false)}};
 return <span style={{display:"inline-flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><button className="secondary" disabled={busy} onClick={exportAll}><Download size={15}/>{busy?"Preparing export…":"Export all matching"}</button>{error&&<small style={{color:"#bd4040"}}>{error}</small>}</span>
}
