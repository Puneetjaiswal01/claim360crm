"use client";
import {useState} from "react";
import {PhoneCall,MessageCircle,Mail} from "lucide-react";
import EmailComposer from "./EmailComposer";

type Props={
 phone?:string|null;
 email?:string|null;
 name?:string|null;
 company?:string|null;
 registeredAddress?:string|null;
 holdingValue?:string|null;
 enableEmailDraft?:boolean;
 onPrepareEmail?:()=>void;
};

export default function ContactActions({phone,email,name,company,registeredAddress,holdingValue,enableEmailDraft=false,onPrepareEmail}:Props){
 const [showComposer,setShowComposer]=useState(false);
 const number=(phone||"").replace(/\D/g,"");
 const wa=number.length===10?"91"+number:number;
 return <>
  <div className="contactQuickActions" style={{display:"flex",gap:9,flexWrap:"wrap",margin:"15px 0"}}>
   {number&&<a className="secondary" href={"tel:"+number} style={{display:"inline-flex",gap:7,alignItems:"center",textDecoration:"none",padding:"10px 13px"}}><PhoneCall size={15}/> Call</a>}
   {wa&&<a className="secondary" href={"https://wa.me/"+wa+"?text="+encodeURIComponent("Hello "+(name||"")+", this is from Claim 360.")} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",gap:7,alignItems:"center",textDecoration:"none",padding:"10px 13px"}}><MessageCircle size={15}/> WhatsApp</a>}
   {(email||enableEmailDraft)&&(enableEmailDraft
    ?<button type="button" className="secondary" onClick={()=>onPrepareEmail?onPrepareEmail():setShowComposer(v=>!v)}><Mail size={15}/> {showComposer?"Hide email draft":"Prepare email"}</button>
    :<a className="secondary" href={"mailto:"+email} style={{display:"inline-flex",gap:7,alignItems:"center",textDecoration:"none",padding:"10px 13px"}}><Mail size={15}/> Email</a>)}
   {!number&&!email&&<span className="metricHint">Add a phone number or email to enable quick contact.</span>}
  </div>
  {showComposer&&enableEmailDraft&&!onPrepareEmail&&<EmailComposer email={email} name={name} company={company} registeredAddress={registeredAddress} holdingValue={holdingValue} onClose={()=>setShowComposer(false)}/>}
 </>;
}
