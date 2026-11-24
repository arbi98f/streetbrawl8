'use strict';
// Service worker de Street Brawl 8: permite instalar el juego y jugar sin conexión (offline, práctica, historia).
// La versión llega en la URL de registro (sw.js?v=...), así que al subir SB8_VERSION se renueva solo el caché.
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'sb8-' + V;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        const c = await caches.open(CACHE);
        const urls = new Set(['./', 'index.html', 'manifest.webmanifest', 'js/vendor/peerjs.min.js', 'icons/icon-192.png', 'icons/icon-512.png',
            'css/tailwind.css?v=' + V, 'css/estilos.css?v=' + V]);
        try {
            const html = await (await fetch('index.html', { cache: 'reload' })).text();
            for (const m of html.matchAll(/'(js\/[\w\-./]+\.js)'/g)) urls.add(m[1] + '?v=' + V);
        } catch (err) { /* sin red al instalar: se irá guardando al usarlo */ }
        await Promise.all([...urls].map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
        self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        for (const k of await caches.keys()) if (k.startsWith('sb8-') && k !== CACHE) await caches.delete(k);
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Fuentes: se sirven del caché y se refrescan en segundo plano
    if (FONT_HOSTS.includes(url.hostname)) {
        e.respondWith((async () => {
            const c = await caches.open(CACHE);
            const hit = await c.match(req);
            const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
            return hit || net;
        })());
        return;
    }
    // Todo lo demás de otros dominios (PeerJS, TURN...) pasa sin tocar
    if (url.origin !== self.location.origin) return;

    // Página: primero la red (para recibir actualizaciones), y sin conexión el caché
    if (req.mode === 'navigate') {
        e.respondWith((async () => {
            const c = await caches.open(CACHE);
            try {
                const r = await fetch(req);
                if (r.ok) c.put('index.html', r.clone());
                return r;
            } catch (err) {
                return (await c.match('index.html')) || (await c.match('./')) || Response.error();
            }
        })());
        return;
    }
    // Archivos del juego: caché primero (llevan ?v=, así que son inmutables por versión)
    e.respondWith((async () => {
        const c = await caches.open(CACHE);
        const hit = await c.match(req);
        if (hit) return hit;
        try {
            const r = await fetch(req);
            if (r.ok) c.put(req, r.clone());
            return r;
        } catch (err) {
            return (await c.match(url.pathname.replace(/^\//, ''), { ignoreSearch: true })) || Response.error();
        }
    })());
});
