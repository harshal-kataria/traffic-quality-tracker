const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const Module=require('node:module');
const path=require('node:path');
const compiled=new Module(path.resolve('convex/insightMath.ts'),module);
compiled._compile(buildSync({entryPoints:['convex/insightMath.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,path.resolve('convex/insightMath.ts'));
const {analyze}=compiled.exports;
const sessions=n=>Array.from({length:n},(_,i)=>({sessionId:`s${i}`,source:'instagram',startedAt:i,visibleTimeMs:60000}));
const event=(i,eventName,time=10,page='/product/sunset.html')=>({sessionId:`s${i}`,eventName,time,pageUrl:`https://store.test${page}`,utm_campaign:' Traveler ',utm_medium:' Paid ',source:'instagram'});
const order=(i,extra={})=>({sessionId:`s${i}`,time:100,orderValue:10000,currency:'INR',paymentMethod:'prepaid',status:'paid',...extra});
test('analysis uses unique sessions, ordered journeys, and excludes entire known test/staff sessions',()=>{
  const result=analyze(sessions(3),[event(0,'begin_checkout',30),event(0,'page_view',10),event(0,'add_to_cart',20),event(0,'add_to_cart',21),event(1,'page_view'),event(2,'page_view')],[order(0),order(1,{isTest:true}),order(2,{isStaff:true})]);
  assert.equal(result.sources[0].sessions,1); assert.equal(result.sources[0].cartSessions,1);assert.equal(result.sources[0].confirmedSessions,1);
  assert.equal(result.campaigns[0].campaign,'traveler'); assert.equal(result.landings[0].page,'https://store.test/product/sunset.html');
  assert.deepEqual(result.journeys[0].steps.map(x=>x.event),['page_view','add_to_cart','add_to_cart','begin_checkout','purchase']);
  assert.equal(result.excludedSessions,2);
});
test('money stays separated by currency and unconfirmed COD is not a confirmed purchase',()=>{
  const result=analyze(sessions(2),[event(0,'page_view'),event(1,'page_view')],[order(0,{paymentMethod:'COD',status:'unconfirmed'}),order(1,{currency:'USD'}),order(1,{status:'refunded'})]);
  assert.equal(result.sources[0].purchasingSessions,2);assert.equal(result.sources[0].confirmedSessions,1);
  assert.deepEqual(result.sources[0].values,[{currency:'INR',valuePaise:10000},{currency:'USD',valuePaise:10000}]);
  assert.equal(result.sources[0].cartToPurchaseRate,null);
});
test('recommendations need enough data and give specific checks without claiming causes or profit',()=>{
  assert.equal(analyze(sessions(99),[],[]).recommendations.length,0);
  const visits=Array.from({length:100},(_,i)=>event(i,'page_view'));
  const result=analyze(sessions(100),visits,[]);
  assert.ok(result.recommendations.some(x=>x.kind==='landing'));
  assert.ok(result.recommendations.every(x=>x.evidence&&x.action&&x.followUp));
  assert.ok(!result.recommendations.some(x=>x.kind==='source'));
});
test('checkout drop-off and stronger sources use confirmed purchases and minimum sample sizes',()=>{
  const s=sessions(200).map((x,i)=>({...x,source:i<100?'instagram':'google'}));
  const visits=s.flatMap((x,i)=>[event(i,'page_view'),...(i<20?[event(i,'add_to_cart',20),event(i,'begin_checkout',30)]:[])]);
  const orders=Array.from({length:10},(_,i)=>order(100+i));
  const result=analyze(s,visits,orders);
  assert.ok(result.recommendations.some(x=>x.kind==='checkout'));
  assert.ok(result.recommendations.some(x=>x.kind==='source'&&x.subject==='google'));
});
test('cart drop-off only counts checkout starts belonging to those same cart sessions',()=>{
  const visits=Array.from({length:40},(_,i)=>event(i,i<20?'add_to_cart':'begin_checkout'));
  const result=analyze(sessions(40),visits,[]);
  assert.equal(result.sources[0].cartCheckoutSessions,0);
  assert.ok(result.recommendations.some(x=>x.kind==='cart'&&x.evidence.includes('0 of 20')));
});
