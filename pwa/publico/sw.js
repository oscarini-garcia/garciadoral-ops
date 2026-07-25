/**
 * Service worker: el armazón siempre disponible.
 *
 * La aplicación es local-first, de modo que lo que se cachea aquí es solo el
 * armazón —HTML, estilos, módulos e iconos—. Los datos viven en IndexedDB y no
 * pasan por esta caché: guardar respuestas de la API sería guardar una
 * instantánea filtrada para un titular en un almacén que no distingue titulares.
 *
 * Las peticiones a la API van siempre a la red. Si no hay red, fallan y el
 * motor de sincronización lo resuelve; lo que nunca hacen es servirse de una
 * copia vieja que pudiera contener algo ya retirado.
 */

const VERSION = 'agenda-v2';

const ARMAZON = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/estilos.css',
  '/js/app.js',
  '/js/almacen.js',
  '/js/demo.js',
  '/js/modelo.js',
  '/js/native.js',
  '/js/semana.js',
  '/js/sesion.js',
  '/js/sincronizacion.js',
  '/js/ui.js',
  '/js/vistas/buscar.js',
  '/js/vistas/familia.js',
  '/js/vistas/regalos.js',
  '/js/vistas/semana.js',
  '/iconos/icono.svg',
  '/iconos/icono-192.png',
  '/iconos/icono-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ARMAZON))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  if (evento.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) return;
  if (url.pathname === '/config.json') return;

  // Navegaciones: red primero para recoger despliegues nuevos, con el armazón
  // cacheado como red de seguridad cuando no hay conexión.
  if (evento.request.mode === 'navigate') {
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put('/index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  evento.respondWith(
    caches.match(evento.request).then((cacheada) => cacheada || fetch(evento.request).then((respuesta) => {
      if (respuesta.ok) {
        const copia = respuesta.clone();
        caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
      }
      return respuesta;
    })),
  );
});
