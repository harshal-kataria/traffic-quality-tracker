const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPage, createLocks } = require('./tracker-harness.cjs');
const now = Date.parse('2026-10-11T10:00:00Z');
const landing = 'https://store.test/products/sunglasses?utm_source=Instagram&utm_medium=paid_social&utm_campaign=traveler';
const ua = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Instagram 350.0.0';
function views(...pages) { return pages.flatMap(page => page.sent.filter(event => event.args?.eventName === 'page_view').map(event => event.args)); }
function proof(t, rows) {
  t.diagnostic(JSON.stringify({ visits: rows.map(row => ({ pageUrl: row.pageUrl, source: row.source, browser: row.browser, sessionId: row.sessionId })), sessionCount: new Set(rows.map(row => row.sessionId)).size }));
}

test('step 1 journey: Instagram in-app UTMs -> Razorpay redirect -> store return credits Instagram in one session', async t => {
  const first = createPage({ now, url: landing, ua }); await first.tracker.ready;
  first.history.pushState({}, '', '/cart'); await new Promise(resolve => setImmediate(resolve));
  first.emit('pagehide');
  // No tracker runs on Razorpay; the next store load receives its referrer.
  const returned = createPage({ now: now + 5 * 60000, url: 'https://store.test/thank-you', referrer: 'https://api.razorpay.com/v1/checkout/public', ua, storage: first.storage, cookies: first.cookies });
  await returned.tracker.ready;
  const rows = views(first, returned);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.source === 'instagram'));
  assert.ok(rows.every(row => row.browser === 'instagram_app'));
  assert.ok(rows.every(row => row.utm_campaign === 'traveler'));
  assert.equal(new Set(rows.map(row => row.sessionId)).size, 1);
  proof(t, rows);
});

test('step 2 journey: Instagram visit -> second tab with cookie fallback -> Razorpay return -> reload shares one Instagram session', async t => {
  const cookies = new Map(), storage = new Map(), locks = createLocks();
  const first = createPage({ now, url: landing, ua, cookies, storage, locks }); await first.tracker.ready;
  const second = createPage({ now: now + 60000, url: 'https://store.test/cart', ua, cookies, storageUnavailable: true, locks }); await second.tracker.ready;
  second.emit('pagehide');
  const returned = createPage({ now: now + 6 * 60000, url: 'https://store.test/thank-you', referrer: 'https://api.razorpay.com/v1/checkout/public', ua, cookies, storageUnavailable: true, locks }); await returned.tracker.ready;
  const reload = createPage({ now: now + 7 * 60000, url: 'https://store.test/thank-you', ua, cookies, storage, locks }); await reload.tracker.ready;
  const rows = views(first, second, returned, reload);
  assert.equal(rows.length, 4);
  assert.ok(rows.every(row => row.source === 'instagram'));
  assert.equal(new Set(rows.map(row => row.sessionId)).size, 1);
  assert.equal(new Set(rows.map(row => row.visitorId)).size, 1);
  assert.ok([...cookies.keys()].some(key => key.endsWith('session')));
  proof(t, rows);
});

test('simultaneously opened tabs create one shared session', async () => {
  const cookies = new Map(), storage = new Map(), locks = createLocks();
  const a = createPage({ now, url: landing, ua, cookies, storage, locks });
  const b = createPage({ now, url: landing, ua, cookies, storage, locks });
  await Promise.all([a.tracker.ready, b.tracker.ready]);
  assert.equal(new Set(views(a, b).map(row => row.sessionId)).size, 1);
  assert.equal(new Set(views(a, b).map(row => row.visitorId)).size, 1);
});

test('visible heartbeats do not renew the 30-minute human inactivity window', async () => {
  const page = createPage({ now, url: landing, ua }); await page.tracker.ready;
  const original = page.tracker.sessionId;
  for (let i = 0; i < 124; i++) { page.advance(15000); page.timers[0](); await new Promise(resolve => setImmediate(resolve)); }
  const reload = createPage({ now: now + 31 * 60000, url: 'https://store.test/products/sunglasses', ua, storage: page.storage, cookies: page.cookies }); await reload.tracker.ready;
  assert.notEqual(reload.tracker.sessionId, original);
  assert.equal(new Set(views(page, reload).map(row => row.sessionId)).size, 2);
});

test('a human interaction renews the session; interaction after expiry records a new session', async () => {
  const page = createPage({ now, url: landing, ua }); await page.tracker.ready;
  const original = page.tracker.sessionId;
  page.advance(29 * 60000); page.emit('keydown', { isTrusted: true }); await new Promise(resolve => setImmediate(resolve));
  const next = createPage({ now: now + 31 * 60000, url: 'https://store.test/cart', ua, storage: page.storage, cookies: page.cookies }); await next.tracker.ready;
  assert.equal(next.tracker.sessionId, original);
  next.advance(31 * 60000); next.emit('keydown', { isTrusted: true }); await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(next.tracker.sessionId, original);
  assert.equal(views(next).length, 2);
});

test('UTMs and click IDs win over app browser tags and referrers', async () => {
  for (const [url, agent, source] of [
    ['https://store.test/?utm_source=google&fbclid=synthetic', ua, 'google'],
    ['https://store.test/?fbclid=synthetic', ua, 'instagram'],
    ['https://store.test/?utm_source=instagram', 'FBAN/FBIOS;FBAV/123', 'instagram'],
    ['https://store.test/?gclid=synthetic', ua, 'google'],
  ]) { const page = createPage({ now, url, ua: agent, referrer: 'https://facebook.com' }); await page.tracker.ready; assert.equal(views(page)[0].source, source); }
  const referral = createPage({ now, url: 'https://store.test/', ua, referrer: 'https://google.com' }); await referral.tracker.ready;
  assert.equal(views(referral)[0].source, 'google');
});

test('shared-session locking keeps the final visible-time beat in the pagehide beacon', async () => {
  let offline = false;
  const page = createPage({ now, url: landing, ua, locks: createLocks(), fetch: async () => {
    if (offline) throw new Error('Offline');
    return { ok: true, json: async () => ({ status: 'success', value: 'visit-id' }) };
  } });
  await page.tracker.ready;
  offline = true; page.advance(5000); page.emit('pagehide');
  const beacons = await Promise.all(page.sent.filter(event => event.beacon).map(async event => JSON.parse(await event.beacon.text())));
  assert.ok(beacons.some(event => event.path === 'tracking:heartbeat' && event.args.elapsedMs === 5000));
});
