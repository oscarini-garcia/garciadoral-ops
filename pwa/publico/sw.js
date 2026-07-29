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

// Los módulos y los estilos se sirven de la caché antes que de la red, así que
// un cambio en ellos no llega a quien ya tiene la aplicación abierta hasta que
// esta constante cambia: es lo que reinstala el armazón y borra el anterior.
const VERSION = 'agenda-v46';

const ARMAZON = [
  '/',
  '/index.html',
  // Sin `.html`, que es como las sirve Pages. Con la extensión responde un 308
  // hacia la dirección corta, y una respuesta redirigida guardada en caché hace
  // fallar la navegación que la use: el service worker no puede devolverla para
  // una navegación. Solo se notaría sin conexión, que es justo cuando esto
  // importa.
  '/privacidad',
  '/soporte',
  '/manifest.webmanifest',
  '/css/estilos.css',
  '/js/app.js',
  '/js/almacen.js',
  '/js/avisos.js',
  '/js/comentarios.js',
  '/js/demo.js',
  '/js/gente.js',
  '/js/lio.js',
  '/js/modelo.js',
  '/js/native.js',
  '/js/semana.js',
  '/js/sesion.js',
  '/js/sincronizacion.js',
  '/js/sitios.js',
  '/js/ui.js',
  '/js/version.js',
  '/js/vistas/familia.js',
  '/js/vistas/hoy.js',
  '/js/vistas/regalos.js',
  '/js/vistas/semana.js',
  '/js/vistas/sitios.js',
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
  //
  // Cada página se guarda bajo su propia dirección, y solo la raíz cuenta como
  // armazón. Guardarlas todas como `/index.html` —que es lo que hacía antes de
  // que existieran páginas sueltas— dejaba la aplicación abriendo la política
  // de privacidad, o el «aquí no hay nada» del 404, la siguiente vez que se
  // abriera sin conexión.
  if (evento.request.mode === 'navigate') {
    const esArmazon = url.pathname === '/' || url.pathname === '/index.html';
    evento.respondWith(
      fetch(evento.request)
        .then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(esArmazon ? '/index.html' : evento.request, copia));
          }
          return respuesta;
        })
        .catch(() => caches.match(esArmazon ? '/index.html' : evento.request)
          .then((cacheada) => cacheada || caches.match('/index.html'))),
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
