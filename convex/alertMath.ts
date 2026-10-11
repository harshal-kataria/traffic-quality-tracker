import type { Doc } from "./_generated/dataModel";
import { excluded } from "./founderMath";
const dayMs = 86400000;
const istOffset = 330 * 60000;
export function dayWindow(now: number) {
  const end = Math.floor((now + istOffset) / dayMs) * dayMs - istOffset;
  const start = end - dayMs;
  return { start, end, baselineStart: start - 7 * dayMs, day: new Date(start + istOffset).toISOString().slice(0,10) };
}
export function trafficDrops(visits: Doc<"visits">[], orders: Doc<"orders">[], now: number) {
  const window = dayWindow(now);
  const excludedSessions = new Set(orders.filter(excluded).map(order => order.sessionId));
  const groups = new Map<string, { page: string; source: string; previousVisits: number; currentVisits: number }>();
  for (const visit of visits) {
    if ((visit.eventName && visit.eventName !== "page_view") || excludedSessions.has(visit.sessionId) || visit.time < window.baselineStart || visit.time >= window.end) continue;
    let page: string;
    try { const url = new URL(visit.pageUrl); page = url.origin + url.pathname; } catch { continue; }
    const source = (visit.source || visit.utm_source || "direct").trim().toLowerCase();
    const key = JSON.stringify([page,source]);
    let row = groups.get(key);
    if (!row) { row = {page,source,previousVisits:0,currentVisits:0}; groups.set(key,row); }
    if (visit.time < window.start) row.previousVisits++; else row.currentVisits++;
  }
  return [...groups.values()].flatMap(row => {
    const previousAverage = row.previousVisits / 7;
    const lostVisits = previousAverage - row.currentVisits;
    // Integer comparison avoids a floating-point miss at exactly 30%.
    if (previousAverage < 20 || lostVisits < 5 || row.currentVisits * 10 > row.previousVisits) return [];
    const dropPercent = Math.round(100 * lostVisits / previousAverage);
    return [{page:row.page,source:row.source,previousAverage,currentVisits:row.currentVisits,dropPercent}];
  }).sort((a,b) => b.dropPercent - a.dropPercent || a.page.localeCompare(b.page) || a.source.localeCompare(b.source));
}
