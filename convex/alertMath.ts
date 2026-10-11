import type { Doc } from "./_generated/dataModel";
import { excluded } from "./founderMath";
const dayMs = 86400000;
const istOffset = 330 * 60000;
export function dayWindow(now: number) {
  const end = Math.floor((now + istOffset) / dayMs) * dayMs - istOffset;
  const start = end - dayMs;
  return { start, end, baselineStart: start - 7 * dayMs, day: new Date(start + istOffset).toISOString().slice(0,10) };
}
export function trafficDrops(visits: Doc<"visits">[], orders: Doc<"orders">[], now: number, readiness = {dayBeforeReady:true,sevenDayReady:true}) {
  const window = dayWindow(now);
  const excludedSessions = new Set(orders.filter(excluded).map(order => order.sessionId));
  const groups = new Map<string, { page: string; source: string; previousVisits: number; dayBeforeVisits: number; currentVisits: number }>();
  for (const visit of visits) {
    if ((visit.eventName && visit.eventName !== "page_view") || excludedSessions.has(visit.sessionId) || visit.time < window.baselineStart || visit.time >= window.end) continue;
    let page: string;
    try { const url = new URL(visit.pageUrl); page = url.origin + url.pathname; } catch { continue; }
    const source = (visit.source || visit.utm_source || "direct").trim().toLowerCase();
    const key = JSON.stringify([page,source]);
    let row = groups.get(key);
    if (!row) { row = {page,source,previousVisits:0,dayBeforeVisits:0,currentVisits:0}; groups.set(key,row); }
    if (visit.time < window.start) { row.previousVisits++; if (visit.time >= window.start-dayMs) row.dayBeforeVisits++; } else row.currentVisits++;
  }
  return [...groups.values()].flatMap(row => {
    const previousAverage = row.previousVisits / 7;
    const dayBeforeDropPercent = readiness.dayBeforeReady && row.dayBeforeVisits ? Math.round(100*(row.dayBeforeVisits-row.currentVisits)/row.dayBeforeVisits) : null;
    const averageDropPercent = readiness.sevenDayReady && previousAverage ? Math.round(100*(previousAverage-row.currentVisits)/previousAverage) : null;
    const dayBeforeTriggered = readiness.dayBeforeReady && row.dayBeforeVisits >= 20 && row.dayBeforeVisits-row.currentVisits >= 5 && row.currentVisits*10 <= row.dayBeforeVisits*7;
    // Integer comparison avoids a floating-point miss at exactly 30%.
    const averageTriggered = readiness.sevenDayReady && previousAverage >= 20 && previousAverage-row.currentVisits >= 5 && row.currentVisits*10 <= row.previousVisits;
    if (!dayBeforeTriggered && !averageTriggered) return [];
    const dropPercent = Math.max(dayBeforeTriggered ? dayBeforeDropPercent! : 0,averageTriggered ? averageDropPercent! : 0);
    return [{page:row.page,source:row.source,previousAverage,currentVisits:row.currentVisits,dropPercent,dayBeforeVisits:row.dayBeforeVisits,dayBeforeDropPercent,averageDropPercent,...readiness}];
  }).sort((a,b) => b.dropPercent - a.dropPercent || a.page.localeCompare(b.page) || a.source.localeCompare(b.source));
}
