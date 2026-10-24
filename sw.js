/* The Bratanic Adventure: service worker of the tablet web version (made by tools/build_web.py, do not edit by hand).
   It keeps a copy of the game on the tablet, so the game plays with no internet after the first visit.
   - the game page: the newest one from the internet when online (waits up to 4 seconds), otherwise the saved copy
   - the icons and the manifest: the saved copy first
   A new version or build gets a new cache name; the old copies are deleted when the new one takes over. */
'use strict';
var VERSION = '2.2.1';
var BUILD = 'd3d09b30d9';
var PREFIX = 'bratanic-adventure-web-';
var CACHE = PREFIX + 'v' + VERSION + '-' + BUILD;
var PAGE = 'index.html';
var FILES = ["index.html", "manifest.webmanifest", "icons/apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"];
var TIMEOUT_MS = 4000;

function full(path) { return new URL(path, self.registration.scope).href; }

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(FILES.map(function (f) { return new Request(full(f), { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function plain(res) {  /* a followed redirect cannot answer a page request: copy it into a fresh response */
  if (!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
}

function page(event) {
  return caches.open(CACHE).then(function (cache) {
    var fromNet = fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        try { event.waitUntil(cache.put(full(PAGE), res.clone()).catch(function () {})); } catch (e) {}
      }
      return res;
    });
    var timer = 0;
    var late = new Promise(function (resolve) { timer = setTimeout(resolve, TIMEOUT_MS, null); });
    try { event.waitUntil(fromNet.catch(function () {})); } catch (e) {}
    return Promise.race([fromNet.catch(function () { return null; }), late]).then(function (res) {
      clearTimeout(timer);
      if (res && res.ok) return plain(res);
      return cache.match(full(PAGE)).then(function (saved) {
        if (saved) return saved;
        return res ? plain(res) : fromNet.then(plain);  /* nothing saved yet: wait for the internet after all */
      });
    });
  });
}

function saved(event, path) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(full(path)).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          try { event.waitUntil(cache.put(full(path), res.clone()).catch(function () {})); } catch (e) {}
        }
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var scope = self.registration.scope;
  if (req.url.indexOf(scope) !== 0) return;  /* other sites and other folders: not ours */
  var path = new URL(req.url).pathname.slice(new URL(scope).pathname.length);
  if (path === '' || path === PAGE) { event.respondWith(page(event)); return; }
  if (FILES.indexOf(path) >= 0) event.respondWith(saved(event, path));
});
