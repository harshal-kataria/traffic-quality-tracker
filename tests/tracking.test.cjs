const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('public/tracker.js', 'utf8');

test('tagged visit and COD order share a session; inactivity expires it after 30 minutes', async () => {
  let now = 1000000;
  let id = 0;
  const storage = new Map();
  const sent = [];
  const localStorage = { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) };
  async function page(url, order) {
    const window = { storeTrackerOrder: order };
    class Clock extends Date { static now() { return now; } }
    vm.runInNewContext(source, {
      window, document: { currentScript: { dataset: { convexUrl: 'http://localhost:3210' } } },
      location: { href: url, search: new URL(url).search }, localStorage,
      crypto: { randomUUID: () => `session-${++id}` }, Date: Clock, URLSearchParams, console,
      fetch: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ status: 'success', value: 'row-id' }) }; },
    });
    await window.StoreTracker.ready;
    if (order) await window.StoreTracker.orderReady;
    return window.StoreTracker.sessionId;
  }
  const first = await page('http://store.test/?utm_source=test&utm_campaign=traveler');
  now += 29 * 60 * 1000;
  assert.equal(await page('http://store.test/thank-you', { orderValue: 1499, productNames: ['Traveler Backpack'], paymentMethod: 'COD' }), first);
  assert.equal(sent[0].args.utm_source, 'test');
  assert.equal(sent[0].args.utm_campaign, 'traveler');
  assert.equal(sent[0].args.utm_medium, null);
  assert.equal(sent[2].args.paymentMethod, 'COD');
  assert.equal(sent[2].args.sessionId, first);
  now += 30 * 60 * 1000;
  assert.notEqual(await page('http://store.test/'), first);
});
