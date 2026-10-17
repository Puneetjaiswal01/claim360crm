"use client";
import {useEffect,useState} from "react";
import {Save,UserRound,ShieldCheck} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {ListSkeleton} from "./LoadingStates";
type Details={display_name:string;designation:string;employee_id:string;phone:string;department:string};
type Props={userId:string;email:string;name?:string;designation?:string;role?:string;adminEdit?:boolean;onSaved:()=>Promise<void>};
const columns="display_name,designation,employee_id,phone,department,completed_at";
export default function MyProfile({userId,email,name,designation,role,adminEdit=false,onSaved}:Props){
 const [form,setForm]=useState<Details>({display_name:"",designation:"",employee_id:"",phone:"",department:""});
 const [completed,setCompleted]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[exists,setExists]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>{let active=true;setLoading(true);setError("");
  supabase.from("crm_member_profiles").select(columns).eq("user_id",userId).maybeSingle().then(({data,error:e})=>{
   if(!active)return;
   if(e){setError("Could not load your profile. Please refresh and try again.");setLoading(false);return;}
   setCompleted(!!data?.completed_at);setExists(!!data);setForm({display_name:data?.display_name||name||email.split("@")[0],designation:data?.designation??designation??"",employee_id:data?.employee_id||"",phone:data?.phone||"",department:data?.department||""});setLoading(false);
  });return()=>{active=false};
 },[userId,email,name,designation]);
 const change=(key:keyof Details,value:string)=>{setForm(old=>({...old,[key]:value}));setMessage("");};
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy||loading||(completed&&!adminEdit))return;setBusy(true);setError("");setMessage("");
  const values={display_name:form.display_name.trim(),designation:form.designation.trim(),employee_id:form.employee_id.trim()||null,phone:form.phone.trim(),department:form.department.trim()};
  if(!values.display_name){setError("Please enter your full name.");setBusy(false);return;}
  if(values.employee_id&&!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/.test(values.employee_id)){setError("Employee ID can contain letters, numbers, dots, slashes, underscores or hyphens.");setBusy(false);return;}
  if(!/^[0-9+(). -]*$/.test(values.phone)){setError("Please enter a valid phone number.");setBusy(false);return;}
  try{
   const result=exists?await supabase.from("crm_member_profiles").update(values).eq("user_id",userId).select(columns).single():await supabase.from("crm_member_profiles").insert({user_id:userId,...values}).select(columns).single();
   if(result.error){setError(result.error.code==="23505"?"That employee ID is already in use. Please enter your own ID.":result.error.code==="23514"?"Please check the profile fields and employee ID format.":"Your profile could not be saved. It may already be complete; ask an administrator for future changes.");return;}
   setExists(true);setCompleted(true);await onSaved();
  }catch{setError("Could not connect. Please try again.");}finally{setBusy(false);}
 }
 const locked=completed&&!adminEdit;
 return <section className="tableCard myProfileCard" aria-labelledby="myProfileTitle">
  <div className="myProfileHeader"><div className="myProfileAvatar"><UserRound size={25}/></div><div><h2 id="myProfileTitle">{adminEdit?"Employee profile":"Your employee profile"}</h2><p>{adminEdit?"Update this team member’s details.":locked?"Your account details and workspace access.":"Complete your details once. An administrator will manage future changes."}</p></div></div>
  {error&&<div className="alert" role="alert">{error}</div>}
  {loading?<ListSkeleton label="Loading employee profile" rows={2}/>:<form onSubmit={save}>
   <fieldset disabled={busy}><legend className="srOnly">Employee details</legend><div className="formGrid">
    <label>Full name<input readOnly={locked} autoComplete="name" required maxLength={100} value={form.display_name} onChange={e=>change("display_name",e.target.value)}/></label>
    <label>Employee ID<input readOnly={locked} maxLength={40} title="Use letters, numbers, dots, slashes, underscores or hyphens." placeholder="Enter your assigned employee ID" value={form.employee_id} onChange={e=>change("employee_id",e.target.value)}/></label>
    <label>Job title<input readOnly={locked} autoComplete="organization-title" maxLength={100} value={form.designation} onChange={e=>change("designation",e.target.value)}/></label>
    <label>Department<input readOnly={locked} maxLength={100} placeholder="e.g. Business Development" value={form.department} onChange={e=>change("department",e.target.value)}/></label>
    <label>Phone number<input readOnly={locked} type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={e=>change("phone",e.target.value)}/></label>
    <label>Work email<input type="email" readOnly value={email}/></label>
   </div></fieldset>
   <div className="myProfileAccess"><ShieldCheck size={18}/><span>CRM access: <b>{role==="admin"?"Administrator":role==="manager"?"Manager":"Team member"}</b>. Account email and permissions are managed separately.</span></div>
   <div className="myProfileFooter"><p role="status" aria-live="polite">{message||(locked?"Your profile is complete. Contact an administrator to update these details.":adminEdit?"Administrator editing employee details.":"After saving, only an administrator can change your details.")}</p>{!locked&&<button type="submit" className="primary" disabled={busy}><Save size={16}/>{busy?"Saving…":adminEdit?"Save changes":"Complete profile"}</button>}</div>
  </form>}
 </section>;
}
