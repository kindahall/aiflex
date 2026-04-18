/* eslint-disable no-restricted-globals */

/**
 * AIflex Service Worker — push notifications + offline caching.
 */

const CACHE_NAME = "aiflex-v2";
const OFFLINE_URL = "/offline";

// Assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/offline",
  "/favicon.svg",
  "/manifest.json",
];

// --- Install: pre-cache essential assets ---
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// --- Activate: clean old caches ---
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames
            .filter(function (name) {
              return name !== CACHE_NAME;
            })
            .map(function (name) {
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

// --- Fetch: stale-while-revalidate for pages, cache-first for static ---
self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);

  // Skip non-GET requests and API calls
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (images, CSS, JS, fonts) — cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|ico)$/) ||
    url.pathname.startsWith("/_next/static/")
  ) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request)
          .then(function (response) {
            if (response.ok) {
              var responseClone = response.clone();
              caches.open(CACHE_NAME).then(function (cache) {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(function () {
            return new Response("", { status: 503 });
          });
      })
    );
    return;
  }

  // HTML pages — network-first with offline fallback
  if (event.request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(event.request)
        .then(function (response) {
          if (response.ok) {
            var responseClone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match(event.request).then(function (cached) {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }
});

// --- Push notifications ---
self.addEventListener("push", function (event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || "AIflex";
  var options = {
    body: data.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: data.url || "/" },
    actions: [{ action: "open", title: "Ouvrir" }],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = event.notification.data?.url || "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            client.focus();
            client.navigate(url);
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});

// --- Background sync (for offline-created content) ---
self.addEventListener("sync", function (event) {
  if (event.tag === "sync-queue") {
    event.waitUntil(
      // Process any queued actions when back online
      caches.open("aiflex-sync-queue").then(function (cache) {
        return cache.keys().then(function (requests) {
          return Promise.all(
            requests.map(function (request) {
              return cache.match(request).then(function (response) {
                if (!response) return;
                return fetch(request)
                  .then(function () {
                    return cache.delete(request);
                  })
                  .catch(function () {
                    // Will retry on next sync
                  });
              });
            })
          );
        });
      })
    );
  }
});
