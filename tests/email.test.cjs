const {test}=require('node:test'),assert=require('node:assert/strict'),{buildSync}=require('esbuild'),Module=require('node:module'),path=require('node:path');
const compiled=new Module(path.resolve('convex/emailMath.ts'),module);compiled._compile(buildSync({entryPoints:['convex/emailMath.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,path.resolve('convex/emailMath.ts'));
const {digest,retryAllowed}=compiled.exports;
test('email preserves both full-day comparisons and does not invent a missing seven-day baseline',()=>{
  const text=digest({status:'ready',day:'2026-10-10',sevenDayReady:false},[{page:'https://store.test/product/sunset.html',source:'instagram',currentVisits:10,dayBeforeVisits:20,previousAverage:20,dayBeforeDropPercent:50,averageDropPercent:null,sevenDayReady:false}]);
  assert.ok(text.includes('Yesterday: 10; day before: 20'));assert.ok(text.includes('average: collecting history'));assert.ok(text.includes('versus day before: 50%'));
});
test('email retries cannot duplicate a sent email or outlive the service duplicate-protection window',()=>{
  const now=100000000;assert.equal(retryAllowed({status:'sent',createdAt:now,updatedAt:now},now),false);assert.equal(retryAllowed({status:'pending',createdAt:now,updatedAt:now},now+100),false);
  assert.equal(retryAllowed({status:'failed',createdAt:now-24*3600000,updatedAt:now},now),false);assert.equal(retryAllowed({status:'failed',createdAt:now-1000,updatedAt:now},now),true);
});
test('the real email action skips missing settings, uses a stable duplicate key and saves provider acceptance',async()=>{
  const actionModule=new Module(path.resolve('convex/alertEmail.ts'),module);actionModule._compile(buildSync({entryPoints:['convex/alertEmail.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text,path.resolve('convex/alertEmail.ts'));
  const env={...process.env},previousFetch=global.fetch,calls=[];
  try{
    delete process.env.RESEND_API_KEY;delete process.env.ALERT_EMAIL_FROM;delete process.env.ALERT_EMAIL_TO;
    const ctx={runMutation:async(ref,args)=>{calls.push(args);return {id:'test-row',payload:'frozen digest'};},scheduler:{runAfter:async()=>{}}};
    await actionModule.exports.send._handler(ctx,{storeId:'chasma-kart',day:'2026-10-10'});assert.equal(calls.length,0);
    process.env.RESEND_API_KEY='test-only-placeholder';process.env.ALERT_EMAIL_FROM='sender@example.test';process.env.ALERT_EMAIL_TO='founder@example.test';
    global.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],'traffic-digest/chasma-kart/2026-10-10');assert.deepEqual(JSON.parse(options.body).to,['founder@example.test']);return {ok:true,json:async()=>({id:'provider-proof'})};};
    await actionModule.exports.send._handler(ctx,{storeId:'other-store',day:'2026-10-10'});assert.equal(calls.length,0);
    await actionModule.exports.send._handler(ctx,{storeId:'chasma-kart',day:'2026-10-10'});assert.equal(calls[1].providerId,'provider-proof');
    global.fetch=async()=>{throw new Error('network down')};let retries=0;ctx.scheduler.runAfter=async()=>{retries++;};
    await actionModule.exports.send._handler(ctx,{storeId:'chasma-kart',day:'2026-10-10',attempt:2});assert.equal(retries,0);assert.ok(calls.at(-1).error);
  }finally{global.fetch=previousFetch;for(const key of ['RESEND_API_KEY','ALERT_EMAIL_FROM','ALERT_EMAIL_TO']){if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}}
});
