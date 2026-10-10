(function () {
  "use strict";
  if (window.StoreTracker) return;
  var script = document.currentScript;
  var endpoint = script && script.dataset.convexUrl;
  var key = "store-tracker-session";
  var ttl = 30 * 60 * 1000;
  var memorySession;

  function session() {
    var now = Date.now();
    var saved = memorySession;
    try { saved = JSON.parse(localStorage.getItem(key)) || saved; } catch (_) {}
    if (!saved || typeof saved.id !== "string" || !saved.id ||
        !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now) {
      saved = { id: crypto.randomUUID(), expiresAt: now + ttl };
    }
    saved.expiresAt = now + ttl;
    memorySession = saved;
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch (_) {}
    return saved.id;
  }

  async function send(name, args) {
    if (!endpoint) throw new Error("Set data-convex-url on the tracking script");
    var response = await fetch(endpoint.replace(/\/$/, "") + "/api/mutation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "tracking:" + name, args: args, format: "json" }),
      keepalive: true,
    });
    var result = await response.json();
    if (!response.ok || result.status !== "success") throw new Error(result.errorMessage || "Tracking failed");
    return result.value;
  }

  var params = new URLSearchParams(location.search);
  var visit = { sessionId: session(), pageUrl: location.href, time: Date.now() };
  ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach(function (name) {
    visit[name] = params.get(name);
  });
  var ready = send("visit", visit);
  // Keep a rejected request observable without an unhandled rejection.
  ready.catch(function (error) { console.error("Visit tracking:", error); });
  window.StoreTracker = {
    ready: ready,
    sessionId: visit.sessionId,
    trackOrder: async function (order) {
      await ready;
      var payload = {
        sessionId: session(), orderValue: order.orderValue,
        productNames: order.productNames, paymentMethod: order.paymentMethod, time: Date.now(),
      };
      if (typeof order.orderId === "string" && order.orderId.trim()) payload.orderId = order.orderId.trim();
      return send("order", payload);
    },
  };
  if (window.storeTrackerOrder) {
    window.StoreTracker.orderReady = window.StoreTracker.trackOrder(window.storeTrackerOrder);
    window.StoreTracker.orderReady.catch(function (error) { console.error("Order tracking:", error); });
  }
})();
