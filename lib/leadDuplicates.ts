import {holdingAmount} from "./leadAmounts";
export type LeadRecord=Record<string,any>;
export type FieldComparison={field:string;left:unknown;right:unknown;result:"match"|"similar"|"different"|"missing"};
export type DuplicatePair={key:string;left:LeadRecord;right:LeadRecord;score:number;confidence:"Strong match"|"Likely match"|"Review needed";reasons:string[];conflicts:string[];fields:FieldComparison[]};
const missing=new Set(["","na","n/a","none","null","nil","unknown","not available","not provided","-"]);
export const text=(value:unknown)=>String(value??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const meaningful=(value:unknown)=>!missing.has(String(value??"").trim().toLowerCase());
export const person=(value:unknown)=>meaningful(value)?text(value).replace(/^(mr|mrs|ms|miss|dr|shri|smt) /,"").split(" ").sort().join(" "):"";
export const company=(value:unknown)=>meaningful(value)?text(value).replace(/\b(pvt|private)\b/g,"private").replace(/\b(ltd|limited)\b/g,"limited").replace(/\b(co|company)\b/g,"company").replace(/\s+/g," ").trim():"";
export function phones(value:unknown){return [...new Set(String(value??"").split(/[,;/|\n]+/).map(v=>v.replace(/\D/g,"")).map(v=>v.startsWith("0091")&&v.length===14?v.slice(4):v.startsWith("91")&&v.length===12?v.slice(2):v.length===11&&v.startsWith("0")?v.slice(1):v).filter(v=>v.length>=7&&v.length<=15&&!/^(\d)\1+$/.test(v)))].sort();}
export function emails(value:unknown){return [...new Set(String(value??"").toLowerCase().match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/g)||[])].sort();}
export function similarity(a:string,b:string){
 if(!a||!b)return 0;if(a===b)return 1;
 const grams=(s:string)=>{const result=new Map<string,number>();for(let i=0;i<s.length-1;i++){const key=s.slice(i,i+2);result.set(key,(result.get(key)||0)+1)}return result};
 const ag=grams(a),bg=grams(b);let overlap=0;for(const [g,n] of ag)overlap+=Math.min(n,bg.get(g)||0);
 return 2*overlap/(a.length+b.length-2);
}
function canonical(field:string,value:unknown):string{
 if(!meaningful(value))return "";
 if(field==="holding_value"){const amount=holdingAmount(value);if(amount!==null)return String(amount);}
 if(field==="shareholder_name")return person(value);
 if(field==="company")return company(value);
 if(field==="mobile_number")return phones(value).join("|");
 if(field==="email")return emails(value).join("|");
 const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
 if(field==="activities")return JSON.stringify((Array.isArray(value)?value:[]).map(stable).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
 if(typeof value==="object")return JSON.stringify(stable(value));
 return text(value);
}
export function compareLeadFields(left:LeadRecord,right:LeadRecord):FieldComparison[]{
 return Array.from(new Set([...Object.keys(left),...Object.keys(right)])).filter(f=>f!=="id").sort().map(field=>{
  const a=canonical(field,left[field]),b=canonical(field,right[field]);
  return {field,left:left[field],right:right[field],result:!a||!b?"missing":a===b?"match":["shareholder_name","company","registered_address"].includes(field)&&similarity(a,b)>=.82?"similar":"different"};
 });
}
const overlap=(a:string[],b:string[])=>a.some(v=>b.includes(v));
export function compareDuplicates(left:LeadRecord,right:LeadRecord):DuplicatePair|null{
 const nameA=person(left.shareholder_name),nameB=person(right.shareholder_name),coA=company(left.company),coB=company(right.company);
 const sameName=!!nameA&&nameA===nameB,nearName=!!nameA&&!!nameB&&Math.min(nameA.length,nameB.length)>=5&&similarity(nameA,nameB)>=.82;
 const sameCompany=!!coA&&coA===coB,nearCompany=!!coA&&!!coB&&similarity(coA,coB)>=.87;
 const samePhone=overlap(phones(left.mobile_number),phones(right.mobile_number)),sameEmail=overlap(emails(left.email),emails(right.email));
 const sameReference=meaningful(left.ref_id)&&text(left.ref_id)===text(right.ref_id)&&!/^manual[- ]/i.test(String(left.ref_id));
 const addrA=text(left.registered_address),addrB=text(right.registered_address),sameAddress=addrA.length>=12&&addrA===addrB;
 if(!sameReference&&!sameName&&!nearName&&!samePhone&&!sameEmail)return null;
 if(nearName&&!sameName&&!samePhone&&!sameEmail&&!sameCompany&&!nearCompany&&!sameAddress&&!sameReference)return null;
 const reasons:string[]=[],conflicts:string[]=[];let score=0;
 if(sameReference){score+=65;reasons.push("Same reference ID")}
 if(sameName){score+=30;reasons.push("Same shareholder name (normalized)")}else if(nearName){score+=22;reasons.push("Similar shareholder name")}
 if(sameCompany){score+=25;reasons.push("Same company")}else if(nearCompany){score+=16;reasons.push("Similar company name")}
 if(samePhone){score+=22;reasons.push("Shared phone number")}
 if(sameEmail){score+=25;reasons.push("Shared email address")}
 if(sameAddress){score+=10;reasons.push("Same registered address")}
 if(sameName&&sameCompany)score+=28;
 if(coA&&coB&&!sameCompany&&!nearCompany){conflicts.push("Different companies — separate holdings may be valid");score=Math.min(score,49)}
 if(nameA&&nameB&&!sameName&&!nearName){conflicts.push("Different shareholder names — contact may belong to a family member");score=Math.min(score,49)}
 if(!coA||!coB)conflicts.push("Company missing on one or both records");
 if(!sameName&&!nearName&&!sameReference)score=Math.min(score,49);
 if(!sameReference&&!sameName&&!nearName&&!samePhone&&!sameEmail)return null;
 const fields=compareLeadFields(left,right);
 for(const f of fields)if(["holding_value","mobile_number","email","registered_address"].includes(f.field)&&f.result==="different")conflicts.push(f.field.replace(/_/g," ")+" differs");
 score=Math.min(100,score);
 return {key:[left.id,right.id].sort().join("|"),left,right,score,confidence:score>=85?"Strong match":score>=65?"Likely match":"Review needed",reasons,conflicts,fields};
}
export function findDuplicatePairs(leads:LeadRecord[],maxComparisons=200000){
 const active=leads.filter(l=>!l.archived_at),blocks=new Map<string,number[]>(),candidates=new Set<string>();let limited=false;
 const add=(key:string,index:number)=>{if(!key)return;const bucket=blocks.get(key)||[];bucket.push(index);blocks.set(key,bucket)};
 active.forEach((l,i)=>{
  const n=person(l.shareholder_name),c=company(l.company),r=text(l.ref_id),a=text(l.registered_address);
  if(n)add("name:"+n,i);
  if(meaningful(l.ref_id)&&!/^manual[- ]/i.test(String(l.ref_id)))add("ref:"+r,i);
  for(const p of phones(l.mobile_number))add("phone:"+p,i);
  for(const e of emails(l.email))add("email:"+e,i);
  if(a.length>=12)add("address:"+a,i);
  for(const token of n.split(" ").filter(t=>t.length>=3)){
   if(c)add("company-name:"+c+":"+token,i);
   add("name-token:"+token,i);
  }
 });
 // Exact identity blocks run before fuzzy blocks so broad surnames never crowd
 // out reference/contact matches. Every candidate receives full-field comparison.
 const entries=[...blocks.entries()].sort(([a],[b])=>Number(a.startsWith("name-token:"))-Number(b.startsWith("name-token:")));
 outer:for(const [key,bucket] of entries){
  if(key.startsWith("name-token:")&&bucket.length>100){limited=true;continue;}
  for(let i=0;i<bucket.length;i++)for(let j=i+1;j<bucket.length;j++){
   if(candidates.size>=maxComparisons){limited=true;break outer;}
   candidates.add(Math.min(bucket[i],bucket[j])+":"+Math.max(bucket[i],bucket[j]));
  }
 }
 const pairs:DuplicatePair[]=[];
 for(const key of candidates){const [a,b]=key.split(":").map(Number);const pair=compareDuplicates(active[a],active[b]);if(pair)pairs.push(pair)}
 return {pairs:pairs.sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)),compared:candidates.size,scanned:active.length,limited};
}
