export function digest(check:{status:string;day:string;sevenDayReady?:boolean},alerts:Array<{page:string;source:string;currentVisits:number;dayBeforeVisits?:number;previousAverage:number;dayBeforeDropPercent?:number|null;averageDropPercent?:number|null;sevenDayReady?:boolean}>){
  const lines=[`ChasmaKart traffic check for ${check.day} (IST)`,""];
  if(check.status==="warming_up")lines.push("Collecting history: two complete days are needed for yesterday versus the day before. Eight are needed for the seven-day comparison.");
  else if(check.status==="over_limit")lines.push("The check exceeds the current data limit. No partial comparisons were used.");
  else if(!alerts.length)lines.push("No qualifying traffic drops found.");
  else for(const row of alerts)lines.push(`${row.page} | ${row.source}`,`Yesterday: ${row.currentVisits}; day before: ${row.dayBeforeVisits??"unavailable"}; prior seven-day daily average: ${row.sevenDayReady?row.previousAverage.toFixed(1):"collecting history"}.`,`Drop versus day before: ${row.dayBeforeDropPercent==null?"unavailable":row.dayBeforeDropPercent+"%"}; versus seven-day average: ${row.averageDropPercent==null?"unavailable":row.averageDropPercent+"%"}.`,"");
  if(check.status==="ready"&&!check.sevenDayReady)lines.push("The seven-day baseline is still collecting history.");
  lines.push("Alerts require a 30% drop, at least five lost page views, and a baseline of at least 20 page views.","Known test/staff order sessions are excluded. Other test browsing cannot yet be identified.","Analysis and recommendations: https://dusty-dogfish-660.convex.site/founder/index.html");
  return lines.join("\n");
}
export function retryAllowed(row:{status:string;createdAt:number;updatedAt:number},now:number){
  // Resend retains an idempotency key for 24 hours. Never retry beyond that window.
  return row.status!=="sent"&&now-row.createdAt<23*3600000&&(row.status!=="pending"||now-row.updatedAt>=600000);
}
