export function holdingAmount(value:unknown):number|null{
 if(typeof value==="number")return Number.isFinite(value)&&value>=0?value:null;
 const raw=String(value??"").trim().toLowerCase().replace(/₹|\binr\b|\brs\.?/g,"").replace(/,/g,"").trim();
 const match=raw.match(/^(\d+(?:\.\d+)?)\s*(k|thousand|lac|lacs|lakh|lakhs|cr|crore|crores|million)?$/);
 if(!match)return null;
 const factors:Record<string,number>={k:1000,thousand:1000,lac:100000,lacs:100000,lakh:100000,lakhs:100000,cr:10000000,crore:10000000,crores:10000000,million:1000000};
 const amount=Number(match[1])*(factors[match[2]]||1);return Number.isFinite(amount)?amount:null;
}
