"use client";
import {useEffect,useMemo,useState} from "react";
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
const subjectFor=(name:string,_company:string)=>"Share Dematerialisation — "+(name||"Shareholder");

function draftFor(name:string,_company:string,registeredAddress:string,holdingValue:string){
 const shareholder=name||"Shareholder";
 return [
  "Dear "+shareholder+",",
  "",
  "I hope this message finds you well.",
  "",
  "My name is Puneet Jaiswal, and I am the Assistant Vice President – Business Development at Claim 360 — a firm that specialises in helping shareholders and their authorised representatives identify and recover shares and financial assets held with companies, registrars, and the Investor Education and Protection Fund (IEPF).",
  "",
  "We have records of shareholdings registered in the name of "+shareholder+" that appear to be dormant.",
  "",
  "Details of the holdings:",
  "",
  "Name: "+shareholder,
  "Registered address: "+(registeredAddress||"Not available"),
  "Approximate value: "+(holdingValue||"Not available"),
  "",
  "If these details correspond to you or someone you know, we would be glad to assist in reviewing and acting on this matter. To maintain confidentiality, we are happy to share further details during a brief conversation.",
  "",
  "Regulatory note: As per SEBI regulations, all physical and dormant shareholdings are required to be regularised and dematerialised. Any delay may make the recovery process more complex and subject to additional regulatory formalities. We recommend taking timely action to avoid complications.",
  "",
  "How we can help",
  "",
  "We provide end-to-end assistance, including:",
  "",
  "• Identification and verification of dormant holdings",
  "• Resolution of KYC, PAN, and documentation discrepancies",
  "• Preparation and submission of required applications, including IEPF filings",
  "• Coordination with companies, registrars, and RTAs",
  "• Transfer of recovered shares to your Demat account",
  "",
  "Next step",
  "",
  "Please let us know a convenient time for a brief conversation. We look forward to assisting you.",
  "",
  "Warm regards",
  "Puneet Jaiswal",
  "Assistant Vice President – Business Development",
  "Claim 360",
  "puneet@claim360.in",
  "https://claim360.in"
 ].join("\n");
}

const escapeHtml=(value:string)=>value.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function formattedDraft(body:string){
 const lines=body.split("\n");
 const parts:string[]=[];
 let listOpen=false;
 const closeList=()=>{if(listOpen){parts.push("</ul>");listOpen=false}};
 for(let i=0;i<lines.length;i++){
  const line=lines[i].trim();
  if(!line)continue;
  if(line.startsWith("• ")){if(!listOpen){parts.push('<ul style="margin:0 0 16px;padding-left:20px">');listOpen=true}parts.push('<li style="margin:0 0 5px">'+escapeHtml(line.slice(2))+"</li>");continue}
  closeList();
  if(line.startsWith("Name: ")&&lines[i+1]?.startsWith("Registered address: ")&&lines[i+2]?.startsWith("Approximate value: ")){
   const rows=[["Name:",line.slice(6)],["Registered address:",lines[i+1].slice(20)],["Approximate value:",lines[i+2].slice(19)]];
   parts.push('<table style="width:100%;border-collapse:collapse;margin:0 0 16px"><tbody>'+rows.map(([label,value])=>'<tr><th scope="row" style="width:25%;border:1px solid #777;padding:8px 10px;text-align:left;vertical-align:top">'+label+'</th><td style="border:1px solid #777;padding:8px 10px">'+escapeHtml(value)+'</td></tr>').join("")+"</tbody></table>");
   i+=2;continue;
  }
  const safe=escapeHtml(line).replace(/Claim 360/g,'<a href="https://claim360.in" style="color:#7373d9">Claim 360</a>');
  if(line.startsWith("Regulatory note:"))parts.push('<blockquote style="margin:0 0 16px;border-left:2px solid #888;padding:8px 10px">'+safe+"</blockquote>");
  else if(["How we can help","Next step","Details of the holdings:"].includes(line))parts.push('<p style="margin:0 0 16px"><strong>'+safe+"</strong></p>");
  else parts.push('<p style="margin:0 0 16px">'+safe+"</p>");
 }
 closeList();
 return '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;overflow-wrap:anywhere">'+parts.join("")+"</div>";
}

export default function EmailComposer({email,name,company,registeredAddress,holdingValue,onClose}:Props){
 const cleanedName=normalize(name),cleanedCompany=normalize(company),cleanedAddress=normalize(registeredAddress),cleanedValue=normalize(holdingValue);
 const emailOptions=useMemo(()=>Array.from(new Set((email||"").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])),[email]);
 const [recipient,setRecipient]=useState(emailOptions[0]||"");
 const [subject,setSubject]=useState(()=>subjectFor(cleanedName,cleanedCompany));
 const [body,setBody]=useState(()=>draftFor(cleanedName,cleanedCompany,cleanedAddress,cleanedValue));
 useEffect(()=>{setSubject(subjectFor(cleanedName,cleanedCompany));setBody(draftFor(cleanedName,cleanedCompany,cleanedAddress,cleanedValue))},[cleanedName,cleanedCompany,cleanedAddress,cleanedValue]);
 const [copied,setCopied]=useState<"subject"|"body"|"all"|"formatted"|null>(null);
 const [notice,setNotice]=useState("");
 const [showPreview,setShowPreview]=useState(true);
 const htmlBody=useMemo(()=>formattedDraft(body),[body]);
 const copyFormatted=async()=>{
  try{
   if(typeof ClipboardItem==="undefined"||!navigator.clipboard?.write){setNotice("Formatted copying is unavailable in this browser. Select and copy the formatted preview, or use Copy message for plain text.");return}
   await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([htmlBody],{type:"text/html"}),"text/plain":new Blob([body],{type:"text/plain"})})]);
   setCopied("formatted");setNotice("Formatted message copied. Paste it into your email composer to keep the holdings table.");
  }catch{setNotice("Formatted clipboard access was blocked. Select and copy the formatted preview manually.")}
 };
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
   <div><div className="eyebrow">CLAIM 360 / OUTREACH</div><h3><Mail size={17}/> Shareholder email template</h3><p>Reference template · Version 2 · Name, address and value fill from this lead.</p></div>
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
   <button type="button" className="secondary" aria-pressed={showPreview} onClick={()=>setShowPreview(!showPreview)}>{showPreview?"Edit wording":"Show formatted preview"}</button>
   {showPreview&&<div aria-label="Formatted email preview" className="crmEmailPreview" dangerouslySetInnerHTML={{__html:htmlBody}}/>}
   {!showPreview&&<textarea aria-label="Edit email wording" className="crmEmailBody" value={body} onChange={e=>setBody(e.target.value)} rows={17} spellCheck={true}/>}
   <div className="crmEmailNote">Wording follows your reference template. Review the lead details and regulatory note before sending. Use Copy formatted message to retain the table; Gmail and other email app links prepare plain-text drafts. Sending and delivery tracking are not yet connected to the CRM.</div>
   {notice&&<p className="crmEmailFeedback" role="status">{notice}</p>}
   <div className="crmEmailButtonRow">
    <button type="button" className="secondary" onClick={copyFormatted}>{copied==="formatted"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy formatted message</button>
    <button type="button" className="secondary" onClick={()=>copy("subject")}>{copied==="subject"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy subject</button>
    <button type="button" className="secondary" onClick={()=>copy("body")}>{copied==="body"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy message</button>
    <button type="button" className="secondary" onClick={()=>copy("all")}>{copied==="all"?<Check size={15}/>:<ClipboardCopy size={15}/>} Copy all</button>
    <button type="button" className="primary" disabled={!valid} onClick={()=>compose("gmail")}><ExternalLink size={15}/> Open Gmail draft</button>
    <button type="button" className="secondary" disabled={!valid} onClick={()=>compose("default")}>Other email app</button>
   </div>
  </div>
 </section>;
}
