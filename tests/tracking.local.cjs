const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ConvexHttpClient } = require('convex/browser');
const { makeFunctionReference } = require('convex/server');
const { createPage } = require('./tracker-harness.cjs');
const root = path.resolve(__dirname, '..');
const client = new ConvexHttpClient('http://127.0.0.1:3210');
function admin(name, args) {
  return JSON.parse(execFileSync(path.join(root, 'node_modules/.bin/convex'), ['run', `tracking:${name}`, JSON.stringify(args)], { cwd: path.join(root, '.local-convex'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}
const scope = () => ({ storeId: `edge-test-${crypto.randomUUID()}`, sessionId: crypto.randomUUID(), visitorId: crypto.randomUUID(), source: 'instagram', utm_source: 'Instagram ', utm_medium: ' Paid_Social ', utm_campaign: 'Traveler ', utm_content: null, browser: 'browser', userAgent: 'Mozilla/5.0' });
const orderFields = { orderValue: 149900, currency: 'INR', items: [{ name: 'Traveler Backpack', quantity: 1, pricePaise: 149900 }], paymentMethod: 'COD', couponCode: 'TRAVELER', isTest: true, isStaff: false };
const ref = name => makeFunctionReference(`tracking:${name}`);

test('server timestamps, clean URLs, normalized attribution, retry IDs, bots and store isolation', async () => {
  const base = scope();
  const args = { ...base, eventId: crypto.randomUUID(), eventName: 'page_view', pageUrl: 'http://store.test/?utm_source=Instagram%20&email=person%40example.com&phone=9876543210' };
  const before = Date.now(); const id = await client.mutation(ref('visit'), args);
  assert.equal(await client.mutation(ref('visit'), args), id);
  assert.equal(await client.mutation(ref('visit'), { ...args, eventId: crypto.randomUUID(), userAgent: 'Googlebot' }), null);
  const rows = admin('rowsForSession', { storeId: base.storeId, sessionId: base.sessionId });
  assert.equal(rows.visits.length, 1); assert.ok(rows.visits[0].time >= before);
  assert.equal(rows.visits[0].pageUrl, 'http://store.test/?utm_source=instagram');
  assert.equal(rows.visits[0].utm_medium, 'paid_social');
  assert.equal(admin('rowsForSession', { storeId: 'another-store', sessionId: base.sessionId }).visits.length, 0);
});

test('orders retain last non-direct attribution across direct sessions, validate totals and retain statuses', async () => {
  const base = scope();
  await client.mutation(ref('visit'), { ...base, eventId: crypto.randomUUID(), eventName: 'page_view', pageUrl: 'http://store.test/' });
  const direct = { ...base, sessionId: crypto.randomUUID(), source: 'direct', utm_source: null, utm_medium: null, utm_campaign: null };
  const orderId = `order-${crypto.randomUUID()}`;
  const args = { ...direct, ...orderFields, orderId, eventId: crypto.randomUUID() };
  const id = await client.mutation(ref('order'), args);
  await assert.rejects(client.mutation(ref('order'), { ...args, eventId: crypto.randomUUID(), orderValue: 1 }), /Items must/);
  let rows = admin('rowsForSession', { storeId: base.storeId, sessionId: direct.sessionId });
  assert.equal(rows.orders[0].source, 'instagram'); assert.equal(rows.orders[0].status, 'unconfirmed');
  assert.equal(rows.orders[0].excludedFromMetrics, true); assert.equal(rows.orders[0].couponCode, 'TRAVELER');
  const otherStore = { ...args, eventId: crypto.randomUUID(), storeId: `${base.storeId}-other` };
  assert.notEqual(await client.mutation(ref('order'), otherStore), id);
  assert.equal(admin('updateOrderStatus', { storeId: base.storeId, orderId, status: 'refunded' }), id);
  rows = admin('rowsForSession', { storeId: base.storeId, sessionId: direct.sessionId });
  assert.equal(rows.orders.length, 1); assert.equal(rows.orders[0].status, 'refunded');
});

test('heartbeat retries are idempotent and simultaneous tabs cannot double visible time', async () => {
  const base = scope();
  await client.mutation(ref('visit'), { ...base, eventId: crypto.randomUUID(), eventName: 'page_view', pageUrl: 'http://store.test/' });
  const initial = admin('rowsForSession', { storeId: base.storeId, sessionId: base.sessionId });
  const args = { ...base, eventId: crypto.randomUUID(), elapsedMs: 15000 };
  await client.mutation(ref('heartbeat'), args);
  const first = admin('rowsForSession', { storeId: base.storeId, sessionId: base.sessionId }).sessions[0];
  await client.mutation(ref('heartbeat'), args);
  const replay = admin('rowsForSession', { storeId: base.storeId, sessionId: base.sessionId }).sessions[0];
  assert.equal(first.visibleTimeMs, replay.visibleTimeMs);
  await Promise.all(Array.from({ length: 2 }, () => client.mutation(ref('heartbeat'), { ...args, eventId: crypto.randomUUID() }, { skipQueue: true })));
  const last = admin('rowsForSession', { storeId: base.storeId, sessionId: base.sessionId }).sessions[0];
  assert.ok(last.visibleTimeMs <= Date.now() - initial.sessions[0].startedAt);
});

test('local snippet proof: tagged visit and repeated COD order produce real Convex rows', async () => {
  const storeId = `proof-${crypto.randomUUID()}`;
  // A deliberately wrong browser clock must never become the stored event time.
  const page = createPage({ storeId, now: 1, url: 'http://store.test/test.html?utm_source=%20Instagram%20&utm_campaign=Traveler&email=test%40example.com', fetch });
  assert.ok(await page.tracker.ready);
  const order = { orderId: `proof-order-${crypto.randomUUID()}`, orderValuePaise: 149900, currency: 'INR', items: [{ name: 'Traveler Backpack', quantity: 2, pricePaise: 74950 }], paymentMethod: 'COD', couponCode: 'TRAVELER', isTest: true };
  const checkout = createPage({ storeId, storage: page.storage, now: 2, url: 'http://store.test/thank-you.html', order, fetch });
  assert.ok(await checkout.tracker.ready); assert.ok(await checkout.tracker.orderReady);
  for (let reload = 0; reload < 3; reload++) {
    const next = createPage({ storeId, storage: page.storage, now: 3 + reload, url: 'http://store.test/thank-you.html', order, fetch });
    await next.tracker.ready; await next.tracker.orderReady;
  }
  const rows = admin('rowsForSession', { storeId, sessionId: page.tracker.sessionId });
  assert.equal(rows.visits.length, 5); assert.equal(rows.orders.length, 1);
  assert.equal(rows.orders[0].source, 'instagram'); assert.ok(rows.visits[0].time > 1);
  assert.equal(rows.orders[0].sessionId, rows.visits[0].sessionId);
  console.log('RAW_CONVEX_PROOF\n' + JSON.stringify({ visit: rows.visits[0], order: rows.orders[0] }, null, 2));
});
