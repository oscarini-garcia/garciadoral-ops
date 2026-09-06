/**
 * Qué cambió cada versión, en el idioma de quien la usa — el registro detrás
 * de las tarjetas de Ajustes → Novedades.
 *
 * Se escribe a mano al final de cada vuelta, porque no se deriva: el código
 * dice qué es cierto de una versión, no qué notaría quien tiene el teléfono
 * en la mano. La primera entrada describe la versión que se está subiendo, y
 * `pwa/test/novedades.test.js` la sujeta a la de `pwa/package.json` y
 * `pwa/publico/js/version.js` — entre la prueba y la costumbre de subir las
 * tres versiones juntas, «las novedades viajan con cada mergeo» deja de
 * depender de que alguien se acuerde.
 *
 * Pocas líneas por versión, la más nueva primero, en el mismo tono que el
 * resto de la aplicación: qué cambió en la pantalla, no qué módulo se tocó.
 * La pantalla enseña las cuatro últimas; el resto es historial que no cuesta
 * nada conservar. La idea es de `meeting-ops-air`, que lleva su propia
 * versión de esto desde hace más tiempo.
 */
export const NOVEDADES = [
  {
    version: '1.71.0',
    fecha: '2026-09-06',
    titulo: 'Quién lleva un día suelto se acuerda, y el aviso previo llega del servidor',
    lineas: [
      'En el día de una actividad, cogerlo tú se escribe en el acto; pedirle a otro que lleve o recoja le llega como petición, con Acepto y No puedo.',
      'Con los avisos del teléfono puestos, «Mañana: …» lo manda el servidor cada mañana con la antelación de cada plugin, sin que haga falta abrir la aplicación.',
      'Lío tiene en cuenta quién está fuera también en su frase y en los avisos de turno.',
    ],
  },
  {
    version: '1.70.0',
    fecha: '2026-09-06',
    titulo: 'La agenda se compone de plugins, y cada uno tiene su hoja',
    lineas: [
      'En la Agenda, un botón junto al periodo abre «Qué hay en la agenda»: Lío, Viajes, Cumpleaños y santos, Puntuales, Extraescolares y Fin de semana.',
      'Cada uno con su interruptor, hasta qué círculo llega y con cuánto aviso; Lío estrena dos filas de atajo, «L a V» y «S y D».',
      'El «+» pregunta qué es: un evento, una actividad con sus días y quién lleva y recoge, o una escapada con su sitio, quién va y si Lío viene.',
      'Las fechas se eligen en un calendario propio, no en la rueda del sistema.',
      'El santo sale de la ficha como el cumpleaños, con un botón que lo busca; y en la ficha se apunta quién está fuera, y sus turnos de Lío pasan a quien cubra.',
      'Los vuelos de Flighty los pega cada uno con su enlace; ida y vuelta se leen como un viaje y los días de en medio dicen «Óscar fuera».',
    ],
  },
  {
    version: '1.69.0',
    fecha: '2026-09-06',
    titulo: 'Arreglo: al caducar la sesión, la aplicación se quedaba atascada',
    lineas: [
      'Si la sesión caducaba con una hoja abierta, la hoja se quedaba encima tapando la pantalla de «vuelve a entrar».',
      'Y el aviso decía «sesion-caducada» en vez de explicarlo con palabras.',
    ],
  },
  {
    version: '1.68.0',
    fecha: '2026-08-14',
    titulo: 'Ajustes vuelve a la esquina de arriba',
    lineas: [
      'El botón de Ajustes deja la barra de abajo y vuelve a la cabecera, arriba a la derecha, que es donde se busca.',
      'La barra se queda con las cinco secciones y nada más.',
    ],
  },
  {
    version: '1.67.0',
    fecha: '2026-08-14',
    titulo: 'Arreglo: campos rellenados por Safari, en modo claro',
    lineas: [
      'El nombre de la pantalla de espera, y cualquier otro campo que Safari ofrezca rellenar solo, ya no se queda sin letras visibles con el tema claro puesto.',
    ],
  },
  {
    version: '1.66.0',
    fecha: '2026-08-14',
    titulo: 'Añadir en Sitios, alineado bajo el rótulo',
    lineas: [
      'La casilla de «Añadir a...» pasa a estar debajo de la barra de la sección, alineada con el texto de la lista de debajo.',
    ],
  },
  {
    version: '1.65.0',
    fecha: '2026-08-14',
    titulo: 'Añadir en Sitios ya no queda al final',
    lineas: [
      'La casilla de «Añadir a...» de cada grupo pasa a estar arriba, justo debajo del rótulo, en vez de después de toda la lista.',
    ],
  },
  {
    version: '1.64.0',
    fecha: '2026-08-14',
    titulo: 'Marcar algo en Sitios ya se ve en el momento',
    lineas: [
      'Tocar «hecho» o añadir algo a una lista ya no vuelve al principio de la pantalla: el cambio se ve donde se ha tocado.',
    ],
  },
  {
    version: '1.63.0',
    fecha: '2026-08-14',
    titulo: 'Ajustes cuenta qué ha cambiado',
    lineas: [
      'Un apartado nuevo, «Novedades», con lo último que ha cambiado en la aplicación, en tarjetas que se pasan deslizando.',
      'Empieza plegado, justo debajo de Sincronización: primero se mira qué versión hay, y solo a veces qué trajo.',
    ],
  },
  {
    version: '1.62.0',
    fecha: '2026-08-14',
    titulo: 'Dar acceso ya no se limita a los cuatro de casa',
    lineas: [
      'Al aprobar a quien espera, ahora se puede vincular con cualquiera del registro, no solo con Familia.',
      'Quien ya tiene cuenta se sigue viendo, apagado y con el motivo escrito.',
    ],
  },
  {
    version: '1.61.0',
    fecha: '2026-08-14',
    titulo: 'Gente ya no se agrupa por ramas',
    lineas: [
      'Se quita el campo de familia del formulario, la hoja de ordenar y los separadores de la tabla.',
      'Nada se borra: lo que cada uno ya tuviera escrito se queda donde estaba.',
    ],
  },
  {
    version: '1.60.0',
    fecha: '2026-08-09',
    titulo: 'Las secciones de un sitio pesan menos',
    lineas: [
      'Cada clase de un sitio —Llevar, Hacer, Ir, Saber— tiene ahora una cabecera compacta con su propio color.',
      'Menos rayas dentro y más aire entre una sección y la siguiente.',
    ],
  },
  {
    version: '1.59.0',
    fecha: '2026-08-09',
    titulo: 'Los grupos de un sitio se pliegan y lo recuerdan',
    lineas: [
      'Cada clase se puede plegar, con el total en el rótulo, y la aplicación recuerda cómo se dejó.',
      'La lista de Llevar se corrige tocando el texto, sin borrar y volver a escribir.',
    ],
  },
  {
    version: '1.58.0',
    fecha: '2026-08-09',
    titulo: 'Añadir a un sitio, de un tirón',
    lineas: [
      'Escribir y pulsar Intro varias veces seguidas ya no espera ni pierde una letra por el camino.',
    ],
  },
];
