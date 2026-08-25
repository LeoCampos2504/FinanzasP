const CACHE = "finanzas-el-tigre-v1";
const SHELL = ["/", "/login", "/manifest.webmanifest", "/icon.svg"];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET" || event.request.url.includes("/api/")) return; event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))); });
