const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('public/tracker.js', 'utf8');
function createPage(options = {}) {
  const storage = options.storage || new Map();
  const sent = [];
  const listeners = {};
  const timers = [];
  let now = options.now || Date.now();
  let elapsed = 0;
  let url = new URL(options.url || 'http://store.test/');
  const location = { get href() { return url.href; }, get hostname() { return url.hostname; } };
  const window = { storeTrackerOrder: options.order, addEventListener(name, fn) { (listeners[name] ||= []).push(fn); } };
  const document = { currentScript: { dataset: { convexUrl: 'http://127.0.0.1:3210', storeId: options.storeId || 'test-store', checkoutHosts: 'checkout.test', storeHosts: 'store.test', ...options.settings } },
    referrer: options.referrer || '', visibilityState: options.visible === false ? 'hidden' : 'visible',
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); } };
  const history = { pushState(_s, _t, value) { url = new URL(value, url); }, replaceState(_s, _t, value) { url = new URL(value, url); } };
  class Clock extends Date { static now() { return now; } }
  vm.runInNewContext(source, { window, document, location, history,
    navigator: { userAgent: options.ua || 'Mozilla/5.0 Safari', sendBeacon(_url, data) { sent.push({ beacon: data }); return true; } },
    localStorage: { get length() { return storage.size; }, key: index => [...storage.keys()][index], removeItem: key => storage.delete(key), getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto, URL, URLSearchParams, Date: Clock, Blob, performance: { now: () => elapsed },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout() {}, setInterval(fn) { timers.push(fn); },
    fetch: async (endpoint, request) => { const event = JSON.parse(request.body); sent.push(event);
      if (options.fetch) return options.fetch(endpoint, request);
      return { ok: true, status: 200, json: async () => ({ status: 'success', value: 'row-id' }) }; },
  });
  return { tracker: window.StoreTracker, storage, sent, document, history, timers,
    advance(ms) { now += ms; elapsed += ms; },
    emit(name, event = {}) { for (const fn of listeners[name] || []) fn(event); },
  };
}
module.exports = { createPage };
