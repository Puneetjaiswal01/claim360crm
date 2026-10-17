import {existsSync} from "node:fs";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {Stitch,StitchToolClient,Screen,buildFifeSuffix} from "@google/stitch-sdk";

const root=fileURLToPath(new URL("../",import.meta.url));
// Node's native env reader preserves existing shell overrides and keeps keys off the client.
for(const name of [".env.local",".env"])if(existsSync(path.join(root,name)))process.loadEnvFile(path.join(root,name));
const [command="check",argument="dashboard",device="DESKTOP"]=process.argv.slice(2);
const stateFolder=path.join(root,".stitch");
const stateFile=path.join(stateFolder,"project.json");
const choices=new Set(["dashboard","login","lead-workspace","ui-system"]);
let client;
function identifier(value,label){
 if(!/^[a-zA-Z0-9_-]+$/.test(value))throw new Error(`Invalid ${label}; use the ID, not a URL.`);
 return value;
}
async function brief(screen){
 if(!choices.has(screen))throw new Error("Choose dashboard, login, lead-workspace, or ui-system.");
 const [design,prompt]=await Promise.all([readFile(path.join(root,"DESIGN.md"),"utf8"),readFile(path.join(root,"design","stitch",`${screen}.md`),"utf8")]);
 return `${design}\n\n## Screen request\n\n${prompt}`;
}
async function project(sdk){
 let state={};
 try{state=JSON.parse(await readFile(stateFile,"utf8"));}catch(error){if(error.code!=="ENOENT")throw error;}
 const projectId=process.env.STITCH_PROJECT_ID||state.projectId;
 if(projectId)return sdk.project(identifier(projectId,"Stitch project ID"));
 if(command==="pull")throw new Error("Set STITCH_PROJECT_ID in .env.local before pulling an existing screen.");
 const created=await sdk.createProject("Claim 360 CRM - Design workspace");
 identifier(created.id,"created Stitch project ID");
 await mkdir(stateFolder,{recursive:true});
 await writeFile(stateFile,JSON.stringify({projectId:created.id},null,2)+"\n");
 console.log(`Created Stitch project ${created.id}. Its ID is saved in .stitch/project.json.`);
 return created;
}
async function download(url,file){
 if(!url||new URL(url).protocol!=="https:")throw new Error("Stitch did not provide a valid HTTPS download URL.");
 const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw new Error(`Could not download the design artifact (HTTP ${response.status}).`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>20*1024*1024)throw new Error("Stitch artifact exceeds the 20 MB local export limit.");
 await writeFile(file,bytes);
}
async function main(){
 if(!["check","brief","generate","pull"].includes(command))throw new Error("Use check, brief, generate, or pull.");
 if(command==="brief"){console.log(await brief(argument));return;}
 // Validate before contacting Stitch, so typos never create projects or consume generations.
 if(command==="generate"){
  if(!choices.has(argument))throw new Error("Choose dashboard, login, lead-workspace, or ui-system.");
  if(!["DESKTOP","MOBILE","TABLET"].includes(device.toUpperCase()))throw new Error("Device must be DESKTOP, MOBILE, or TABLET.");
 }
 if(command==="pull")identifier(argument,"screen ID");
 if(!process.env.STITCH_API_KEY)throw new Error("Add STITCH_API_KEY to .env.local, then run npm run design:check. Get a key at stitch.withgoogle.com > profile > Stitch settings > API key > Create key.");
 client=new StitchToolClient({apiKey:process.env.STITCH_API_KEY,timeout:300000});
 const sdk=new Stitch(client);
 if(command==="check"){
  const projects=await sdk.projects();
  const configured=process.env.STITCH_PROJECT_ID;
  if(configured&&!projects.some(item=>item.id===configured))throw new Error("STITCH_PROJECT_ID is not in the projects accessible to this key.");
  console.log(`Stitch connection verified. ${projects.length} accessible projects. API key stays local.`);
  return;
 }
 const selected=await project(sdk);
 console.log(`${command==="generate"?"Generating":"Retrieving"} ${argument} in Stitch project ${selected.id}…`);
 // SDK 0.3.5 returns one Screen and HTTPS artifact URLs; the dependency is pinned.
 // The live get_screen schema accepts only name; this SDK's getScreen wrapper
 // also sends legacy projectId/screenId fields that the service now rejects.
 const screen=command==="generate"?await selected.generate(await brief(argument),device.toUpperCase()):new Screen(client,{...await client.callTool("get_screen",{name:`projects/${selected.id}/screens/${argument}`}),projectId:selected.id});
 const screenId=identifier(screen.id,"returned screen ID");
 const output=path.join(stateFolder,"exports",identifier(selected.id,"project ID"),screenId);
 await mkdir(output,{recursive:true});
 const [html,image]=await Promise.all([screen.getHtml(),screen.getImage()]);
 const imageUrl=new URL(image);
 // Google's image service otherwise returns a thumbnail; retain a readable reference.
 if(imageUrl.hostname.endsWith(".googleusercontent.com")&&!imageUrl.search)imageUrl.pathname=imageUrl.pathname.replace(/=(?:w|h|s)\d+(?:-[a-z0-9]+)*$/,"")+buildFifeSuffix({width:1440});
 await Promise.all([download(html,path.join(output,"screen.html")),download(imageUrl.href,path.join(output,"screen.png"))]);
 await writeFile(path.join(output,"metadata.json"),JSON.stringify({projectId:selected.id,screenId,brief:command==="generate"?argument:null,exportedAt:new Date().toISOString()},null,2)+"\n");
 console.log(`Design exported to ${path.relative(root,output)}. Review the HTML and image before adapting it into app components.`);
}
try{await main();}catch(error){
 let message=error instanceof Error?error.message:"Stitch command failed.";
 if(process.env.STITCH_API_KEY)message=message.replaceAll(process.env.STITCH_API_KEY,"[redacted]");
 console.error(message);process.exitCode=1;
}finally{await client?.close();}
