const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPage } = require('./tracker-harness.cjs');
const order = { orderId: 'example-order', orderValuePaise: 149900, currency: 'INR', items: [{ name: 'Backpack', quantity: 1, pricePaise: 149900 }], paymentMethod: 'COD', couponCode: 'TRAVELER', isTest: true };

test('UTMs persist across pages, are normalized, URLs lose personal data, and money uses paise', async () => {
  const page = createPage({ url: 'http://store.test/?utm_source=%20Instagram%20&utm_campaign=Traveler&email=a%40b.com&phone=9876543210#email', order });
  await page.tracker.ready; await page.tracker.orderReady;
  const visit = page.sent[0].args; const purchase = page.sent[1].args;
  assert.equal(visit.utm_source, 'instagram'); assert.equal(visit.utm_campaign, 'traveler');
  assert.equal(visit.pageUrl, 'http://store.test/?utm_source=instagram&utm_campaign=traveler');
  assert.equal('time' in visit, false); assert.equal(purchase.orderValue, 149900);
  assert.equal(purchase.sessionId, visit.sessionId); assert.equal(purchase.orderId, 'example-order');
  const next = createPage({ storage: page.storage, url: 'http://store.test/thank-you', order });
  await next.tracker.ready; await next.tracker.orderReady;
  assert.equal(next.sent[0].args.utm_campaign, 'traveler'); assert.equal(next.tracker.sessionId, page.tracker.sessionId);
});

test('new UTM source starts a new session; self and gateway referrals keep the session', async () => {
  const storage = new Map();
  const first = createPage({ storage, url: 'http://store.test/?utm_source=test' }); await first.tracker.ready;
  for (const referrer of ['https://store.test/cart', 'https://api.razorpay.com/checkout']) {
    const next = createPage({ storage, referrer }); await next.tracker.ready; assert.equal(next.tracker.sessionId, first.tracker.sessionId);
  }
  const changed = createPage({ storage, url: 'http://store.test/?utm_source=google' }); await changed.tracker.ready;
  assert.notEqual(changed.tracker.sessionId, first.tracker.sessionId);
});

test('checkout URLs carry the same store, visitor, session and attribution to the configured domain', async () => {
  const first = createPage({ url: 'http://store.test/?utm_source=google&utm_campaign=traveler' }); await first.tracker.ready;
  const decorated = first.tracker.decorateCheckoutUrl('https://checkout.test/thank-you');
  const checkout = createPage({ url: decorated }); await checkout.tracker.ready;
  assert.equal(checkout.tracker.sessionId, first.tracker.sessionId); assert.equal(checkout.sent[0].args.utm_source, 'google');
  assert.equal(first.tracker.decorateCheckoutUrl('https://unrelated.test/'), 'https://unrelated.test/');
});

test('in-app browsers and click IDs fall back before external referrers and direct', async () => {
  for (const [options, source] of [
    [{ ua: 'Instagram 123' }, 'instagram_app'], [{ ua: 'FBAN/FBIOS;FBAV/123' }, 'facebook_app'],
    [{ url: 'http://store.test/?fbclid=abc', referrer: 'https://google.com' }, 'facebook'],
    [{ url: 'http://store.test/?gclid=abc' }, 'google'], [{ referrer: 'https://instagram.com/a' }, 'instagram'], [{}, 'direct'],
  ]) { const page = createPage(options); await page.tracker.ready; assert.equal(page.sent[0].args.source, source); }
});

test('bots and persistent notrack opt-out send nothing', async () => {
  const bot = createPage({ ua: 'Googlebot' }); await bot.tracker.ready; assert.equal(bot.sent.length, 0);
  const page = createPage({ url: 'http://store.test/?notrack=1' }); await page.tracker.ready;
  const next = createPage({ storage: page.storage }); await next.tracker.ready; assert.equal(next.sent.length, 0);
});

test('SPA navigation and cache restores save page views; only fixed funnel names are accepted', async () => {
  const page = createPage(); await page.tracker.ready;
  page.history.pushState({}, '', '/products'); page.emit('pageshow', { persisted: true });
  await page.tracker.trackEvent('add_to_cart'); await page.tracker.trackEvent('begin_checkout'); await page.tracker.trackEvent('custom');
  assert.deepEqual(page.sent.map(row => row.args.eventName), ['page_view', 'page_view', 'page_view', 'add_to_cart', 'begin_checkout']);
});

test('only visible tabs send time; page close uses a beacon', async () => {
  const page = createPage(); await page.tracker.ready; page.advance(15000); page.timers[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.sent[1].args.elapsedMs, 15000);
  page.document.visibilityState = 'hidden'; page.emit('visibilitychange'); page.advance(15000); page.timers[0]();
  assert.equal(page.sent.filter(row => row.path === 'tracking:heartbeat').length, 1);
  const offline = createPage({ fetch: async () => { throw new Error('offline'); } }); await offline.tracker.ready;
  offline.emit('pagehide'); assert.ok(offline.sent.some(row => row.beacon));
});

test('failed sends retry with the same event ID and without throwing', async () => {
  let calls = 0;
  const page = createPage({ fetch: async () => { if (++calls === 1) throw new Error('offline'); return { ok: true, json: async () => ({ status: 'success', value: 'saved' }) }; } });
  assert.equal(await page.tracker.ready, null); page.emit('online'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.sent[0].args.eventId, page.sent[1].args.eventId); assert.equal(calls, 2);
});

test('session expiry uses 30 minutes of inactivity and does not split at midnight', async () => {
  const now = Date.parse('2026-10-10T18:29:00Z'); const page = createPage({ now }); await page.tracker.ready;
  const next = createPage({ now: now + 120000, storage: page.storage }); await next.tracker.ready; assert.equal(next.tracker.sessionId, page.tracker.sessionId);
  const expired = createPage({ now: now + 32 * 60000, storage: page.storage }); await expired.tracker.ready; assert.notEqual(expired.tracker.sessionId, page.tracker.sessionId);
});

test('tabs follow the shared session instead of replaying an old campaign; offline events survive reload', async () => {
  const storage = new Map();
  const first = createPage({ storage, url: 'http://store.test/?utm_source=instagram' }); await first.tracker.ready;
  const second = createPage({ storage, url: 'http://store.test/?utm_source=google' }); await second.tracker.ready;
  await first.tracker.trackEvent('add_to_cart');
  assert.equal(first.sent[1].args.sessionId, second.tracker.sessionId);
  const offline = createPage({ fetch: async () => { throw new Error('offline'); } }); await offline.tracker.ready;
  const retryId = offline.sent[0].args.eventId;
  const loaded = createPage({ storage: offline.storage }); await loaded.tracker.ready;
  assert.equal(loaded.sent[0].args.eventId, retryId);
  assert.equal([...offline.storage.keys()].filter(key => key.includes('outbox:')).length, 0);
});
