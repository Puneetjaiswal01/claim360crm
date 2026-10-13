"use client";
import {useMemo,useState} from "react";
import {Check,ClipboardCopy,ExternalLink,Mail,RotateCcw,X} from "lucide-react";

type Props={
 email:string|null|undefined;
 name:string|null|undefined;
 company:string|null|undefined;
 registeredAddress:string|null|undefined;
 holdingValue:string|null|undefined;
 onClose:()=>void;
};

const normalize=(value:string|null|undefined)=>String(value??"").replace(/\s+/g," ").trim();
const subjectFor=(name:string,company:string)=>company?"Regarding "+company+" shareholding – "+(name||"shareholder record"):"Regarding a shareholding record – "+(name||"your name");

function draftFor(name:string,company:string,registeredAddress:string,holdingValue:string){
 const shareholder=name||"Shareholder";
 const companyPhrase=company?" associated with "+company:"";
 const details=[
  "Name: "+shareholder,
  ...(company?["Company: "+company]:[]),
  ...(registeredAddress?["Address in historical record: "+registeredAddress]:[]),
  ...(holdingValue?["Approximate value (as recorded): "+holdingValue]:[])
 ];
 return [
  "Dear "+shareholder+",",
  "",
  "I hope you are doing well.",
  "",
  "My name is Puneet Jaiswal, and I am the Assistant Vice President – Business Development at Claim 360. We assist shareholders and their authorised representatives with older share records, dematerialisation, and IEPF-related matters where applicable.",
  "",
  "During a review of historical shareholder information, we came across a record in your name"+companyPhrase+". We wanted to check whether it may be relevant to you.",
  "",
  "Reference details:",
  ...details,
  "",
  "If these details are familiar, I would be happy to explain the verification process and discuss how we may be able to assist. Please let me know a convenient time for a brief conversation.",
  "",
  "If this message is not relevant, please reply to let us know and we will not follow up.",
  "",
  "Warm regards,",
  "Puneet Jaiswal",
  "Assistant Vice President – Business Development",
  "Claim 360",
  "puneet@claim360.in",
  "https://claim360.in"
 ].join("\n");
}

export default function EmailComposer({email,name,company,registeredAddress,holdingValue,onClose}:Props){
 const cleanedName=normalize(name),cleanedCompany=normalize(company),cleanedAddress=normalize(registeredAddress),cleanedValue=normalize(holdingValue);
 const emailOptions=useMemo(()=>Array.from(new Set((email||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])),[email]);
 const [recipient,setRecipient]=useState(emailOptions[0]||"");
 const [subject,setSubject]=useState(()=>subjectFor(cleanedName,cleanedCompany));
 const [body,setBody]=useState(()=>draftFor(cleanedName,cleanedCompany,cleanedAddress,cleanedValue));
 const [copied,setCopied]=useState<"subject"|"body"|"all"|null>(null);
 const [notice,setNotice]=useState("");
 const reset=()=>{setSubject(subjectFor(cleanedName,cleanedCompany));setBody(draftFor(cleanedName,cleanedCompany,cleanedAddress,cleanedValue));setCopied(null);setNotice("Draft refreshed from this shareholder record.")};
 const copy=async(kind:"subject"|"body"|"all")=>{
   const value=kind==="subject"?subject:kind==="body"?body:"To: "+recipient+"\nFrom: puneet@claim360.in\nSubject: "+subject+"\n\n"+body;
   try{await navigator.clipboard.writeText(value);setCopied(kind);setNotice("Copied. You can paste this into your email.");}
   catch{setNotice("Clipboard permission was blocked. Please select and copy the text manually.")}
 };
 const valid=recipient.trim()!==""&&subject.trim()!==""&&body.trim()!=="";
 const compose=(provider:"gmail"|"default")=>{
  if(!valid){setNotice("Please enter a recipient, subject and message.");return}
  const to=encodeURIComponent(recipient);
  const sub=encodeURIComponent(subject);
  const message=encodeURIComponent(body);
  const url=provider==="gmail"
    ?"https://mail.google.com/mail/?view=cm&fs=1&to="+to+"&su="+sub+"&body="+message
    :"mailto:"+recipient+"?subject="+sub+"&body="+message;
  setNotice("Your email application will prepare the draft. Please confirm the From address is puneet@claim360.in before sending.");
  if(provider==="gmail")window.open(url,"_blank","noopener,noreferrer");
  else window.location.href=url;
 };
 return <section className="crmEmailComposer" aria-label="Claim 360 email template">
  <header className="crmEmailHead">
   <div><div className="eyebrow">CLAIM 360 / OUTREACH</div><h3><Mail size={17}/> Shareholder email draft</h3><p>Automatically prepared from this lead. Review before sending.</p></div>
   <button className="iconButton" type="button" onClick={onClose} aria-label="Close email draft"><X size={19}/></button>
  </header>
  <div className="crmEmailContent">
   <div className="crmEmailFrom"><span>From</span><b>puneet@claim360.in</b><small>Choose this account in your email app</small></div>
   <label className="crmEmailLabel">To
    {emailOptions.length>1
      ?<select value={recipient} onChange={e=>setRecipient(e.target.value)}>{emailOptions.map(e=><option key={e} value={e}>{e}</option>)}</select>
      :<input type="email" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="Shareholder email"/>}
   </label>
   {emailOptions.length>1&&<p className="crmEmailHelp">Multiple addresses found. One recipient is selected at a time.</p>}
   <label className="crmEmailLabel">Subject
    <input type="text" value={subject} onChange={e=>setSubject(e.target.value)} maxLength={220}/>
   </label>
   <div className="crmEmailMessageTop"><span>Message</span><button type="button" onClick={reset}><RotateCcw size={13}/> Reset template</button></div>
   <textarea className="crmEmailBody" value={body} onChange={e=>setBody(e.target.value)} rows={17} spellCheck={true}/>
   <div className="crmEmailNote">This template avoids unverifiable regulatory deadlines, urgency claims and promotional language. Check that the recorded address and estimated value are accurate before sharing. Sending and delivery tracking are not yet connected to the CRM.</div>
   {notice&&<p className="crmEmailFeedback" role="status">{notice}</p>}
   <div className="crmEmailButtonRow">
    <button type="button" className="secondary" onClick={()=>copy("subject")}>{copied==="subject"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy subject</button>
    <button type="button" className="secondary" onClick={()=>copy("body")}>{copied==="body"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy message</button>
    <button type="button" className="secondary" onClick={()=>copy("all")}>{copied==="all"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy all</button>
    <button type="button" className="primary" disabled={!valid} onClick={()=>compose("gmail")}><ExternalLink size={15}/> Open Gmail draft</button>
    <button type="button" className="secondary" disabled={!valid} onClick={()=>compose("default")}>Other email app</button>
   </div>
  </div>
 </section>;
}
