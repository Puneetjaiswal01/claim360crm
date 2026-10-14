export type Envelope={format:string;version:number;iterations:number;salt:string;iv:string;ciphertext:string};
const encode=(b:Uint8Array)=>{let s="";for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.slice(i,i+16384));return btoa(s)};
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(phrase:string,salt:Uint8Array,iterations:number){const base=await crypto.subtle.importKey("raw",new TextEncoder().encode(phrase),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt.buffer as ArrayBuffer,iterations,hash:"SHA-256"},base,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}
export async function encryptBackup(data:unknown,phrase:string):Promise<Envelope>{
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const iterations=210000;
 const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(phrase,salt,iterations),new TextEncoder().encode(JSON.stringify(data)));
 return {format:"claim360-encrypted-backup",version:1,iterations,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};
}
export async function decryptBackup(envelope:Envelope,phrase:string){
 if(envelope.format!=="claim360-encrypted-backup"||envelope.version!==1||envelope.iterations!==210000)throw new Error("Unsupported backup format");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(envelope.iv).buffer as ArrayBuffer},await key(phrase,decode(envelope.salt),envelope.iterations),decode(envelope.ciphertext).buffer as ArrayBuffer);
 const data=JSON.parse(new TextDecoder().decode(plain));if(data.version!==1||!Array.isArray(data.tables?.leads))throw new Error("Invalid CRM backup");return data;
}
export function download(name:string,data:string,type="application/json"){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
