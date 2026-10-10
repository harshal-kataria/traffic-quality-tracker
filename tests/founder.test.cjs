const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const Module = require('node:module');
const path = require('node:path');
const output = buildSync({entryPoints:['convex/founderMath.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const compiled = new Module(path.resolve('convex/founderMath.ts'),module);
compiled._compile(output,path.resolve('convex/founderMath.ts'));
const {summarize} = compiled.exports;
const visit = (source,eventName='page_view',pageUrl='https://store.test/chasma-kart/product/sunset-club.html') => ({source,eventName,pageUrl});
const order = overrides => ({productNames:['Sunset Club'],items:[{name:'Sunset Club',pricePaise:134910,quantity:1}],currency:'INR',source:'instagram',orderValue:134910,status:'paid',...overrides});

test('product/source totals count only page views and exclude every test/staff flag, cancellations and refunds', () => {
  const orders = [order({}),order({isTest:true}),order({isStaff:true}),order({excludedFromMetrics:true}),order({status:'cancelled'}),order({status:'refunded'})];
  const result = summarize([visit(' Instagram '),visit('instagram','add_to_cart'),visit('instagram','begin_checkout')],orders);
  assert.deepEqual(result.rows,[{product:'Sunset Club',source:'instagram',currency:'INR',visits:1,orders:1,orderValuePaise:134910}]);
  assert.equal(result.excludedOrders,3);
  assert.equal(summarize([visit('instagram')],[order({isTest:true})]).rows[0].orders,0);
});
test('multi-product orders allocate item value once and use saved attribution without mixing currencies', () => {
  const result = summarize([], [order({source:'direct',attribution:{source:'Instagram'},items:[{name:'Sunset Club',pricePaise:10000,quantity:2},{name:'Sunset Club',pricePaise:10000,quantity:1},{name:'Jet Black',pricePaise:15000,quantity:1}],productNames:['Sunset Club','Jet Black'],orderValue:45000}),order({currency:'USD',orderValue:100,items:[{name:'Sunset Club',pricePaise:100,quantity:1}]})]);
  assert.equal(result.rows.find(row => row.product === 'Sunset Club' && row.currency === 'INR').orderValuePaise,30000);
  assert.equal(result.rows.find(row => row.product === 'Sunset Club' && row.currency === 'INR').orders,1);
  assert.equal(result.rows.find(row => row.product === 'Jet Black').orderValuePaise,15000);
  assert.equal(result.rows.find(row => row.currency === 'USD').orderValuePaise,100);
});
