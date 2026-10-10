const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('coupon totals stay exact, checkout records test items, and receipt reload reuses the order ID', async () => {
  const storage = new Map();
  const listeners = {};
  const nodes = new Map();
  const events = [], orders = [];
  const location = { pathname: '/chasma-kart/index.html', search: '' };
  const document = {
    querySelector: selector => { if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} }, focus() {}, scrollIntoView() {} }); return nodes.get(selector); },
    addEventListener: (name, fn) => listeners[name] = fn,
  };
  const window = { scrollTo() {}, addEventListener() {}, StoreTracker: { trackEvent: async name => events.push(name), trackOrder: async order => { orders.push(order); return 'saved-row'; } } };
  const context = {
    document, window, location, localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value) },
    history: { pushState: (_,__,path) => { const url = new URL(path,'http://store.test'); location.pathname = url.pathname; location.search = url.search; } },
    crypto: { randomUUID: () => 'stable-order-id' }, Intl, URL, URLSearchParams, setTimeout: () => 1, clearTimeout() {}, queueMicrotask,
    FormData: class { constructor(form) { this.form = form; } get(key) { return this.form[key]; } },
  };
  const run = () => vm.runInNewContext(fs.readFileSync('public/chasma-kart/store.js','utf8'), context);
  run();
  const click = (selector, data) => listeners.click({ button: 0, preventDefault() {}, target: { closest: name => name === selector ? data : null } });
  click('[data-add]', {dataset:{add:'sunset-club'}});
  click('a[data-link],a[data-shop],a[data-testing]', {href:'http://store.test/chasma-kart/cart.html'});
  listeners.submit({ preventDefault() {}, target: { id:'coupon-form', coupon:'CHASMA10' } });
  assert.match(nodes.get('#app').innerHTML, /₹1,349\.1/);
  click('a[data-link],a[data-shop],a[data-testing]', {href:'http://store.test/chasma-kart/checkout.html'});
  listeners.submit({ preventDefault() {}, target: { id:'payment-form', payment:'COD' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['add_to_cart','begin_checkout']);
  assert.equal(orders[0].orderValuePaise, 134910);
  assert.equal(orders[0].items[0].pricePaise,134910);
  assert.equal(orders[0].paymentMethod,'COD');
  assert.equal(orders[0].isTest,true);
  assert.equal(orders[0].couponCode,'CHASMA10');
  run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(orders[1].orderId,orders[0].orderId);
  assert.equal(JSON.parse(storage.get('chasma-kart-cart')).constructor, Object);
  assert.deepEqual(JSON.parse(storage.get('chasma-kart-cart')),{});
  storage.set('chasma-kart-order:stable-order-id', JSON.stringify({ ...orders[0], items: [null] }));
  assert.doesNotThrow(run);
  assert.match(nodes.get('#app').innerHTML, /No test order here yet/);
});
