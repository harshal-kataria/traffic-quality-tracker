(function () {
  "use strict";
  if (window.StoreTracker) return;
  var noop = function () { return Promise.resolve(null); };
  var disabled = { ready: Promise.resolve(null), trackOrder: noop, trackEvent: noop, decorateCheckoutUrl: function (url) { return url; }, sessionId: null };
  try {
    var script = document.currentScript;
    var settings = script ? script.dataset : {};
    var endpoint = settings.convexUrl;
    var storeId = settings.storeId || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "local-test-store" : null);
    var prefix = "store-tracker:" + storeId + ":";
    var ua = navigator.userAgent || "";
    var gateway = /razorpay|phonepe|paytm|paypal|stripe|cashfree|payu|juspay/i;
    var checkoutHosts = (settings.checkoutHosts || "").split(",").map(function (host) { return host.trim().toLowerCase(); }).filter(Boolean);
    var storeHosts = (settings.storeHosts || location.hostname).split(",").map(function (host) { return host.trim().toLowerCase(); });
    var initialParams = new URL(location.href).searchParams;
    function read(key) {
      var local = null, cookie = null;
      try { local = JSON.parse(localStorage.getItem(prefix + key)); } catch (_) {}
      if (key === "session" || key === "visitor") {
        try {
          var name = encodeURIComponent(prefix + key) + "=";
          (document.cookie || "").split(";").some(function (part) {
            part = part.trim();
            if (part.indexOf(name) !== 0) return false;
            cookie = JSON.parse(decodeURIComponent(part.slice(name.length))); return true;
          });
        } catch (_) {}
      }
      if (key === "session" && cookie && local) return cookie.expiresAt > local.expiresAt ? cookie : local;
      return local || cookie;
    }
    function write(key, value) {
      try { localStorage.setItem(prefix + key, JSON.stringify(value)); } catch (_) {}
      if (key === "session" || key === "visitor") {
        try {
          var age = key === "session" ? Math.max(0, Math.ceil((value.expiresAt - Date.now()) / 1000)) : 31536000;
          document.cookie = encodeURIComponent(prefix + key) + "=" + encodeURIComponent(JSON.stringify(value)) +
            "; Path=/; SameSite=Lax; Max-Age=" + age + (new URL(location.href).protocol === "https:" ? "; Secure" : "");
        } catch (_) {}
      }
    }
    if (initialParams.get("notrack") === "1") write("disabled", true);
    if (!endpoint || !storeId || read("disabled") || initialParams.get("notrack") === "1" || /bot\b|crawler|spider|headless|lighthouse|facebookexternalhit|preview|slurp/i.test(ua)) {
      window.StoreTracker = disabled; return;
    }
    var browser = /Instagram/i.test(ua) ? "instagram_app" : /FBAN|FBAV|FB_IAB/i.test(ua) ? "facebook_app" : "browser";
    var memorySession;
    var visitorId = read("visitor") || crypto.randomUUID();
    var handedSession = initialParams.get("st_sid");
    var handedVisitor = initialParams.get("st_vid");
    var handedStore = initialParams.get("st_store");
    if (handedStore === storeId && /^[\w-]{1,100}$/.test(handedVisitor || "")) { visitorId = handedVisitor; write("visitor", visitorId); }
    function normalize(value) {
      var result = (value || "").trim().toLowerCase().slice(0, 200);
      return /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ().-]{6,}\d/.test(result) ? null : result || null;
    }
    function cleanUrl(value) {
      var url = new URL(value, location.href);
      url.username = ""; url.password = ""; url.hash = "";
      url.pathname = decodeURIComponent(url.pathname).replace(/[^/\s@]+@[^/\s@]+\.[^/\s@]+|\+?\d[\d ().-]{6,}\d/g, "redacted");
      var params = new URLSearchParams();
      ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (key) {
        var value = normalize(url.searchParams.get(key)); if (value) params.set(key, value);
      });
      url.search = params.toString(); return url.href;
    }
    function incoming() {
      var params = new URL(location.href).searchParams;
      var source = normalize(params.get("utm_source"));
      var medium = normalize(params.get("utm_medium"));
      if (!source && params.has("fbclid")) { source = browser === "instagram_app" ? "instagram" : "facebook"; medium = medium || "paid_social"; }
      if (!source && params.has("gclid")) { source = "google"; medium = medium || "cpc"; }
      if (!source && document.referrer) {
        try {
          var host = new URL(document.referrer).hostname.toLowerCase();
          if (storeHosts.indexOf(host) < 0 && checkoutHosts.indexOf(host) < 0 && !gateway.test(host)) {
            source = /(^|\.)instagram\.com$/.test(host) ? "instagram" : /(^|\.)facebook\.com$/.test(host) ? "facebook" : /(^|\.)google\.[a-z.]+$/.test(host) ? "google" : host;
            medium = medium || "referral";
          }
        } catch (_) {}
      }
      if (source && gateway.test(source)) source = null;
      if (!source && browser !== "browser") source = browser;
      return { source: source || "direct", utm_source: source, utm_medium: medium,
        utm_campaign: normalize(params.get("utm_campaign")), utm_content: normalize(params.get("utm_content")),
        explicit: !!normalize(params.get("utm_source")) && !gateway.test(normalize(params.get("utm_source"))) };
    }
    var lastProcessedUtm = null;
    if (handedStore === storeId && /^[\w-]{1,100}$/.test(handedSession || "")) {
      memorySession = { id: handedSession, expiresAt: Date.now() + 1800000, source: normalize(initialParams.get("st_source")) || "direct",
        utm_source: normalize(initialParams.get("st_source")), utm_medium: normalize(initialParams.get("st_medium")),
        utm_campaign: normalize(initialParams.get("st_campaign")), utm_content: normalize(initialParams.get("st_content")) };
      write("session", memorySession);
    }
    function session(allowIncoming, refreshActivity) {
      var now = Date.now();
      var saved = read("session") || memorySession;
      // Time pings measure visibility, not human activity. They must neither
      // renew an idle session nor create a new one without a page view.
      if (refreshActivity === false && (!saved || !saved.id || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now)) return null;
      if (refreshActivity === false) {
        if (window.StoreTracker) window.StoreTracker.sessionId = saved.id;
        return saved;
      }
      var incomingSource = allowIncoming ? incoming() : null;
      var arriving = incomingSource && incomingSource.explicit && incomingSource.utm_source !== lastProcessedUtm;
      var changed = saved && arriving && incomingSource.utm_source !== saved.utm_source;
      if (incomingSource) lastProcessedUtm = incomingSource.explicit ? incomingSource.utm_source : null;
      if (!saved || typeof saved.id !== "string" || !saved.id || typeof saved.source !== "string" || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now || changed) {
        var source = incomingSource || incoming();
        saved = { id: crypto.randomUUID(), expiresAt: now + 1800000, source: source.source,
          utm_source: source.utm_source, utm_medium: source.utm_medium, utm_campaign: source.utm_campaign, utm_content: source.utm_content };
      }
      if (refreshActivity !== false) saved.expiresAt = now + 1800000;
      memorySession = saved; write("session", saved);
      if (window.StoreTracker) window.StoreTracker.sessionId = saved.id;
      return saved;
    }
    function context(allowIncoming, refreshActivity) {
      var saved = session(allowIncoming, refreshActivity);
      if (!saved) return null;
      // Initialise under the same cross-tab lock as the session.
      visitorId = read("visitor") || visitorId;
      if (refreshActivity !== false) write("visitor", visitorId);
      return { storeId: storeId, sessionId: saved.id, visitorId: visitorId, source: saved.source,
        utm_source: saved.utm_source, utm_medium: saved.utm_medium, utm_campaign: saved.utm_campaign, utm_content: saved.utm_content,
        browser: browser, userAgent: ua };
    }
    // Each event has its own storage key, so tabs cannot overwrite each other's
    // pending events. Replayed events are safe because their IDs stay unchanged.
    var queue = [];
    try {
      var outboxPrefix = prefix + "outbox:";
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (key) {
        if (!key || key.indexOf(outboxPrefix) !== 0) return;
        var event = JSON.parse(localStorage.getItem(key));
        if (event && event.args && event.args.storeId === storeId && Date.now() - event.createdAt < 86400000) queue.push(event);
        else localStorage.removeItem(key);
      });
      queue.sort(function (a, b) { return a.createdAt - b.createdAt; });
      while (queue.length > 100) localStorage.removeItem(prefix + "outbox:" + queue.shift().args.eventId);
    } catch (_) {}
    var running = false;
    var retryTimer;
    var waiters = {};
    function persist() { queue.forEach(function (event) { write("outbox:" + event.args.eventId, event); }); }
    function forget(event) { try { localStorage.removeItem(prefix + "outbox:" + event.args.eventId); } catch (_) {} }
    async function drain() {
      if (running || !queue.length) return;
      running = true;
      while (queue.length) {
        var event = queue[0];
        try {
          var response = await fetch(endpoint.replace(/\/$/, "") + "/api/mutation", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "tracking:" + event.name, args: event.args, format: "json" }), keepalive: true,
            signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
          var result = await response.json();
          if (!response.ok || result.status !== "success") {
            // Bad payloads must not block the rest of the queue.
            if ((result.status === "error" && /ArgumentValidationError|Invalid|Items must|Missing store/.test(result.errorMessage || "")) || (response.status >= 400 && response.status < 500)) { queue.shift(); forget(event); persist(); if (waiters[event.args.eventId]) waiters[event.args.eventId](null); continue; }
            throw new Error("Send failed");
          }
          queue.shift(); forget(event); persist();
          if (waiters[event.args.eventId]) { waiters[event.args.eventId](result.value); delete waiters[event.args.eventId]; }
        } catch (_) {
          Object.keys(waiters).forEach(function (id) { waiters[id](null); delete waiters[id]; });
          clearTimeout(retryTimer); retryTimer = setTimeout(drain, 5000); break;
        }
      }
      running = false;
    }
    function shared(task) {
      // Web Locks serialises session creation across same-origin tabs. The
      // lock is released after enqueueing, without waiting for the network.
      if (navigator.locks && navigator.locks.request) return navigator.locks.request(prefix + "session", task);
      return Promise.resolve(task());
    }
    function enqueue(name, args, allowIncoming) {
      var details = context(allowIncoming == null ? name === "visit" : allowIncoming, name !== "heartbeat");
      if (!details) return { promise: noop() };
      var event = { name: name, args: Object.assign(details, args, { eventId: crypto.randomUUID() }), createdAt: Date.now() };
      if (queue.length >= 100) { var removed = queue.shift(); forget(removed); if (waiters[removed.args.eventId]) waiters[removed.args.eventId](null); }
      queue.push(event); persist();
      var promise = new Promise(function (resolve) { waiters[event.args.eventId] = resolve; });
      drain(); return { promise: promise };
    }
    function send(name, args) {
      // A final beat must be queued synchronously before pagehide flushes it.
      // Heartbeats only read shared state, so they do not need a creation lock.
      if (name === "heartbeat") { try { return enqueue(name, args).promise; } catch (_) { return noop(); } }
      try { return shared(function () { return enqueue(name, args); }).then(function (result) { return result.promise; }).catch(function () { return null; }); }
      catch (_) { return noop(); }
    }
    function pageView() { return send("visit", { pageUrl: cleanUrl(location.href), eventName: "page_view" }); }
    function decorateCheckoutUrl(value) {
      try {
        var url = new URL(value, location.href);
        if (!["https:", "http:"].includes(url.protocol) || checkoutHosts.indexOf(url.hostname.toLowerCase()) < 0) return value;
        var saved = session(false);
        var carry = { st_store: storeId, st_sid: saved.id, st_vid: visitorId, st_source: saved.source,
          st_medium: saved.utm_medium, st_campaign: saved.utm_campaign, st_content: saved.utm_content };
        Object.keys(carry).forEach(function (key) { if (carry[key]) url.searchParams.set(key, carry[key]); });
        return url.href;
      } catch (_) { return value; }
    }
    window.StoreTracker = {
      sessionId: null, ready: Promise.resolve(null), decorateCheckoutUrl: decorateCheckoutUrl,
      trackEvent: function (name) { if (name !== "add_to_cart" && name !== "begin_checkout") return noop(); return send("visit", { pageUrl: cleanUrl(location.href), eventName: name }); },
      trackOrder: function (order) {
        try {
          // Preferred contract: net merchandise value and item prices in whole paise.
          var amount = order.orderValuePaise;
          if (amount == null) amount = Math.round((Number(order.orderValue) - Number(order.shippingValue || 0)) * 100);
          var items = order.items;
          if (!items && order.productNames && order.productNames.length === 1) items = [{ name: order.productNames[0], quantity: 1, pricePaise: amount }];
          if (!Number.isSafeInteger(amount) || amount < 0 || !Array.isArray(items)) return noop();
          var payload = { orderValue: amount, currency: (order.currency || "INR").toUpperCase(), items: items.map(function (item) { return { name: item.name, quantity: item.quantity, pricePaise: item.pricePaise }; }),
            paymentMethod: order.paymentMethod, couponCode: order.couponCode || null, isTest: order.isTest === true || settings.testMode === "true" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname), isStaff: order.isStaff === true || settings.staffMode === "true" };
          if (typeof order.orderId === "string" && order.orderId.trim()) payload.orderId = order.orderId.trim();
          return send("order", payload);
        } catch (_) { return noop(); }
      },
    };
    window.StoreTracker.ready = pageView();
    if (window.storeTrackerOrder) window.StoreTracker.orderReady = window.StoreTracker.trackOrder(window.storeTrackerOrder);
    var lastUrl = location.href;
    function navigation() { if (location.href !== lastUrl) { lastUrl = location.href; pageView(); } }
    ["pushState", "replaceState"].forEach(function (name) {
      var original = history[name]; history[name] = function () { var result = original.apply(this, arguments); navigation(); return result; };
    });
    window.addEventListener("popstate", navigation);
    window.addEventListener("hashchange", navigation);
    window.addEventListener("pageshow", function (event) { if (event.persisted) { lastUrl = location.href; pageView(); } });
    window.addEventListener("online", drain);
    function activity(event) {
      if (event.isTrusted === false) return;
      try {
        shared(function () {
          var previous = read("session") || memorySession;
          var expired = !previous || !Number.isFinite(previous.expiresAt) || previous.expiresAt <= Date.now();
          if (expired) return enqueue("visit", { pageUrl: cleanUrl(location.href), eventName: "page_view" }, false);
          session(false); return { promise: noop() };
        }).catch(function () {});
      } catch (_) {}
    }
    ["pointerdown", "click", "keydown", "touchstart"].forEach(function (name) { document.addEventListener(name, activity, true); });
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a[href]");
      if (link) link.href = decorateCheckoutUrl(link.href);
    }, true);
    document.addEventListener("submit", function (event) {
      var form = event.target;
      if (form && form.action) {
        var decorated = decorateCheckoutUrl(form.action);
        if (form.method.toLowerCase() === "get") {
          var url = new URL(decorated);
          url.searchParams.forEach(function (value, key) {
            if (key.indexOf("st_") !== 0) return;
            var input = form.querySelector('input[name="' + key + '"]');
            if (!input) { input = document.createElement("input"); input.type = "hidden"; input.name = key; form.appendChild(input); }
            input.value = value;
          });
        } else form.action = decorated;
      }
    }, true);
    var visibleSince = document.visibilityState === "visible" ? performance.now() : null;
    function heartbeat() {
      if (visibleSince === null) return;
      var now = performance.now(); var elapsed = Math.min(15000, Math.max(0, now - visibleSince)); visibleSince = now;
      if (elapsed) send("heartbeat", { elapsedMs: elapsed });
    }
    setInterval(function () { if (document.visibilityState === "visible") heartbeat(); navigation(); }, 15000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { heartbeat(); visibleSince = null; flush(); }
      else { visibleSince = performance.now(); drain(); }
    });
    function flush() {
      persist();
      if (!navigator.sendBeacon) return;
      queue.forEach(function (event) {
        try { navigator.sendBeacon(endpoint.replace(/\/$/, "") + "/api/mutation", new Blob([JSON.stringify({ path: "tracking:" + event.name, args: event.args, format: "json" })], { type: "application/json" })); } catch (_) {}
      });
    }
    window.addEventListener("pagehide", function () { heartbeat(); flush(); });
  } catch (_) { window.StoreTracker = disabled; }
})();
