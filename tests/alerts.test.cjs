const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const compiled = new Module(path.resolve('convex/alertMath.ts'),module);
compiled._compile(buildSync({entryPoints:['convex/alertMath.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,path.resolve('convex/alertMath.ts'));
const {trafficDrops,dayWindow} = compiled.exports;
const now = Date.parse('2026-10-11T03:30:00Z');
const {start,end,baselineStart} = dayWindow(now);
const visit = (time,source='instagram',pageUrl='https://store.test/product/sunset.html',sessionId='normal') => ({time,source,pageUrl,sessionId,eventName:'page_view'});
const baseline = count => Array.from({length:count},(_,i) => visit(baselineStart + i));

test('yesterday and seven prior full days use IST boundaries, not device time', () => {
  assert.equal(start,Date.parse('2026-10-09T18:30:00Z'));
  assert.equal(end,Date.parse('2026-10-10T18:30:00Z'));
  assert.equal(end-start,86400000); assert.equal(start-baselineStart,7*86400000);
});
test('a 30% drop at sufficient volume alerts once per page/source and ignores partial today', () => {
  const rows = trafficDrops([...baseline(140),...Array.from({length:14},() => visit(start)),visit(end)],[],now);
  assert.equal(rows.length,1); assert.equal(rows[0].previousAverage,20); assert.equal(rows[0].currentVisits,14);
  assert.equal(rows[0].dropPercent,30); assert.equal(rows[0].page,'https://store.test/product/sunset.html');
});
test('low traffic and small drops do not alert; zero traffic does; pages and sources stay separate', () => {
  assert.equal(trafficDrops(baseline(139),[],now).length,0);
  assert.equal(trafficDrops([...baseline(140),...Array.from({length:15},() => visit(start))],[],now).length,0);
  const rows = trafficDrops([...baseline(140),visit(start,'google')],[],now);
  assert.equal(rows.length,1); assert.equal(rows[0].currentVisits,0); assert.equal(rows[0].dropPercent,100);
});
test('known test/staff sessions, non-page events, UTMs, and window boundaries cannot inflate alerts', () => {
  const visits = baseline(140).map(v => ({...v,pageUrl:v.pageUrl+'?utm_campaign=test'}));
  visits.push(visit(start-1,'instagram',undefined,'staff'),{...visit(start),eventName:'add_to_cart'},visit(baselineStart-1));
  const rows = trafficDrops(visits,[{sessionId:'staff',isStaff:true}],now);
  assert.equal(rows.length,1); assert.equal(rows[0].previousAverage,20); assert.equal(rows[0].currentVisits,0);
  assert.equal(trafficDrops(baseline(140).map(v=>({...v,sessionId:'staff'})),[{sessionId:'staff',isTest:true}],now).length,0);
});
