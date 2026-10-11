/* =====================================================================
   Cuadre · service-worker.js
   Hace que la app abra rápido y también sin conexión.

   IMPORTANTE: cada vez que cambies index.html, app.js o los iconos, sube
   el número de VERSION (por ejemplo 'cuadre-v2'). Así los teléfonos
   descargan la versión nueva.

   Lo que guarda: solo los archivos de la app (y la librería de Supabase).
   Lo que NUNCA guarda: las llamadas a Supabase, a la tasa del dólar ni los
   datos financieros. Esos siempre van directo a internet.
   ===================================================================== */
const VERSION = 'cuadre-v15';
const SHELL = [
  './',
  'index.html',
  'app.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];
const LIBRARY_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Archivos de la propia app: se sirve lo guardado y se actualiza en segundo plano.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request, { ignoreSearch: true });
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => null);
        if (cached) { event.waitUntil(network); return cached; }
        const fresh = await network;
        if (fresh) return fresh;
        // Sin conexión y sin copia: para una página, mostrar la app guardada.
        if (request.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('./'));
        return new Response('', { status: 504, statusText: 'Sin conexión' });
      })
    );
    return;
  }

  // Librería de Supabase (versión fija): primero lo guardado.
  if (url.hostname === LIBRARY_HOST) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Todo lo demás (Supabase, tasa del dólar, fuentes): directo a internet, sin guardar.
});

// Recibe avisos push enviados por el emisor seguro de Supabase configurado con VAPID.
// La programación y el envío viven en supabase/functions/send-reminders, no en este archivo.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    try { payload = { body: event.data ? event.data.text() : '' }; } catch (_) { payload = {}; }
  }
  const title = (payload && payload.title) || 'Cuadre';
  const options = {
    body: (payload && payload.body) || 'Tienes una novedad en tus finanzas.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: (payload && payload.tag) || 'cuadre-push',
    data: { url: (payload && payload.url) || './' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar un aviso, abre (o enfoca) la app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const target = (event.notification.data && event.notification.data.url) || './';
      return list.length ? list[0].focus().then(() => { try { list[0].navigate(target); } catch (_) {} }) : self.clients.openWindow(target);
    }
    )
  );
});
