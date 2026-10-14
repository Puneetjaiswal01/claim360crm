"use client";
import {useState} from "react";
import {supabase} from "@/lib/supabase";
import {UploadCloud,FileSpreadsheet,CheckCircle2,AlertTriangle} from "lucide-react";

type CsvLead={owner_id:string;ref_id:string;shareholder_name:string;registered_address:string;company:string;holding_value:string;mobile_number:string;mobile_number_type:string;email:string;input_remarks:string;sales_remarks:string;status:string;lead_date:string|null;followup_date:string|null;fee_percent:number};
const statusOptions=new Set(["NEW","UNTOUCHED","RINGING NOT RESPONDING","NOT REACHABLE","FOLLOW UP","POTENTIAL","CLOSED","CONVERTED","INTERNATIONAL","LOSS","REMINING"]);
const aliases:Record<string,string>={
"date":"lead_date","lead date":"lead_date","ref id":"ref_id","reference id":"ref_id","ref":"ref_id",
"shareholder name(s)":"shareholder_name","shareholder name":"shareholder_name","shareholder":"shareholder_name",
"registered address":"registered_address","address":"registered_address","company":"company",
"holding value (₹)":"holding_value","holding value":"holding_value","holding value rs":"holding_value",
"mobile number":"mobile_number","mobile":"mobile_number","phone":"mobile_number",
"mobile number type":"mobile_number_type","email":"email","email address":"email",
"input remarks":"input_remarks","sales remarks":"sales_remarks","remarks":"sales_remarks",
"status":"status","column 18":"status","lead status":"status","call status":"status","current status":"status","sales status":"status","disposition":"status","lead stage":"status","followup date":"followup_date","follow-up date":"followup_date","fee percent":"fee_percent","fee %":"fee_percent"};
function parseCSV(raw:string):string[][]{
 const out:string[][]=[];let row:string[]=[],field="",quoted=false;
 const text=raw.replace(/^\uFEFF/,"");
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
 else if(c==='"')quoted=true;else if(c===','){row.push(field);field=""}
 else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))out.push(row);row=[];field=""}
 else field+=c}
 if(quoted)throw new Error("CSV contains an unclosed quoted field.");
 row.push(field);if(row.some(v=>v.trim()))out.push(row);return out;
}
function dateValue(v:string):string|null{const s=v.trim();if(!s)return null;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);if(d){const [,day,month,year]=d;return year+"-"+month.padStart(2,"0")+"-"+day.padStart(2,"0")}return s}
export default function CsvImporter({userId,onImported}:{userId:string;onImported:()=>Promise<void>}){
 const [fileName,setFileName]=useState(""),[rows,setRows]=useState<CsvLead[]>([]),[issues,setIssues]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[progress,setProgress]=useState(0);
 const readFile=async(file?:File)=>{setRows([]);setIssues([]);setMessage("");setProgress(0);if(!file)return;setFileName(file.name);
 if(!file.name.toLowerCase().endsWith(".csv")){setIssues(["Please choose a .csv file. Excel .xlsx files must first be saved as CSV."]);return}
 if(file.size>10*1024*1024){setIssues(["CSV is larger than 10 MB. Split it into smaller files."]);return}
 try{const data=parseCSV(await file.text());if(data.length<2)throw new Error("CSV needs a header row and at least one lead.");
 const headers=data[0].map(h=>aliases[h.trim().toLowerCase().replace(/\s+/g," ")]||"");
 if(!headers.includes("shareholder_name"))throw new Error("Missing required column: Shareholder Name(s).");
 if(!headers.includes("status"))throw new Error("No recognized status column found. To protect individual lead statuses, rename the column to Status, Lead Status, Call Status, Sales Status or Disposition and upload again.");
 const warnings:string[]=[],records:CsvLead[]=[];
 for(let i=1;i<data.length;i++){const raw:Record<string,string>={};headers.forEach((h,j)=>{if(h)raw[h]=(data[i][j]||"").trim()});if(!raw.shareholder_name){if(warnings.length<8)warnings.push("Row "+(i+1)+": missing shareholder name — skipped.");continue}
 const ref=raw.ref_id||"IMPORT-"+Date.now()+"-"+i;
 
 const status=(raw.status||"UNTOUCHED").trim().toUpperCase();
 if(raw.status&&!statusOptions.has(status)){if(warnings.length<12)warnings.push("Row "+(i+1)+": unrecognized status "+JSON.stringify(raw.status)+" — import blocked until statuses are mapped.");}
 records.push({owner_id:userId,ref_id:ref,shareholder_name:raw.shareholder_name,registered_address:raw.registered_address||"",company:raw.company||"",holding_value:raw.holding_value||"",mobile_number:raw.mobile_number||"",mobile_number_type:raw.mobile_number_type||"",email:raw.email||"",input_remarks:raw.input_remarks||"",sales_remarks:raw.sales_remarks||"",status:statusOptions.has(status)?status:"UNTOUCHED",lead_date:dateValue(raw.lead_date||""),followup_date:dateValue(raw.followup_date||""),fee_percent:Number(raw.fee_percent)||12});
 }
 if(warnings.some(w=>w.includes("import blocked")))throw new Error(warnings.join(" | "));
 if(records.length===0)throw new Error("No valid shareholder rows found.");setRows(records);setIssues(warnings);
 }catch(e){setIssues([e instanceof Error?e.message:"Unable to read CSV file."])}};
 const upload=async()=>{if(!rows.length||busy)return;setBusy(true);setMessage("");setProgress(0);let completed=0;
 for(let i=0;i<rows.length;i+=100){const batch=rows.slice(i,i+100);const {error}=await supabase.from("leads").insert(batch);if(error){setMessage("Import stopped at row "+(i+1)+": "+error.message+". Earlier batches may have been saved. Re-uploading will create duplicates.");setBusy(false);await onImported();return}completed+=batch.length;setProgress(completed)}
 setBusy(false);setMessage("Import finished: "+completed+" valid rows processed. Duplicate references were retained as separate leads.");setRows([]);await onImported()};
 return <section className="tableCard" style={{padding:25,marginBottom:24}}>
 <div style={{display:"flex",alignItems:"center",gap:12}}><div className="metricIcon indigo" style={{margin:0}}><FileSpreadsheet size={21}/></div><div><h2 style={{margin:"0 0 5px"}}>Import shareholder leads from CSV</h2><p className="metricHint">Upload your spreadsheet as CSV. New records are saved directly to Supabase.</p></div></div>
 <button className="secondary" style={{marginTop:14}} onClick={()=>{const csv="Ref ID,Shareholder Name(s),Registered Address,Company,Holding Value,Mobile Number,Mobile Number Type,Email,Input Remarks,Sales Remarks,Status,Date,Follow-up Date\\r\\n";const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="claim360-import-template.csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}}>Download CSV template</button><label style={{display:"block",border:"2px dashed #cdd8ed",borderRadius:12,padding:25,marginTop:22,textAlign:"center",cursor:"pointer",background:"#f9fbff"}}>
 <UploadCloud size={27} style={{display:"block",margin:"0 auto 10px",color:"#4867ce"}}/><b>{fileName||"Choose a CSV file to import"}</b><p className="metricHint">Supports your existing 12-column Claim 360 format, quoted commas and multi-line remarks · Max 10 MB</p>
 <input type="file" accept=".csv,text/csv" style={{display:"block",margin:"12px auto 0",maxWidth:"100%"}} disabled={busy} onChange={e=>readFile(e.target.files?.[0])}/></label>
 {issues.map((issue,i)=><p key={i} style={{color:"#a56b28",fontSize:12}}><AlertTriangle size={13} style={{verticalAlign:"middle"}}/> {issue}</p>)}
 {rows.length>0&&<div style={{marginTop:20}}><b>{rows.length.toLocaleString("en-IN")} valid leads ready</b><p className="metricHint">Preview: {rows.slice(0,3).map(r=>r.shareholder_name).join(" · ")}. Duplicate names and reference IDs will be imported as separate leads.</p><button className="primary" disabled={busy} onClick={upload}><UploadCloud size={16}/>{busy?"Uploading "+progress+" / "+rows.length:"Import "+rows.length+" leads to database"}</button></div>}
 {message&&<p style={{color:message.startsWith("Import finished")?"#258454":"#b33b4a",marginTop:15}}><CheckCircle2 size={15} style={{verticalAlign:"middle"}}/> {message}</p>}
 </section>
}
