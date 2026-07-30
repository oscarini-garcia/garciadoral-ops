/**
 * Consultas sobre la instantánea local.
 *
 * Todo lo que hay aquí opera sobre datos **ya filtrados** por el servidor. La
 * aplicación no vuelve a evaluar la visibilidad: si un elemento está en el
 * almacén es porque su titular puede verlo. El único cálculo relacionado con la
 * ocultación que se hace en el dispositivo es el aviso «Por aquí no se mira»,
 * que se deriva de una condición estática —¿es mío este evento?— y nunca de un
 * recuento recibido del servidor, que sería por sí mismo el dato que se
 * pretende ocultar (spec funcional §9).
 */

import { ciudadDeAeropuerto } from './aeropuertos.js';

export const EMOJI_POR_DEFECTO = '📌';

/**
 * Un emoji tal como hay que escribirlo para que se vea como un emoji.
 *
 * Hay un puñado —🏖, 🏝, ⛺, ☀ y compañía— que Unicode define **con presentación
 * de texto por defecto**: sin el selector de variación detrás, el sistema los
 * dibuja como un glifo monocromo a trazo, que en un título de 29 puntos en
 * serifa parece un icono roto. Pasaba con Bolonia, y lo que pasaba no era que
 * faltara el emoji: estaba, y se dibujaba en blanco y negro.
 *
 * Se añade al pintar y no solo al guardar, porque lo que ya está escrito en la
 * base también tiene que verse bien. Lo que ya trae selector, un tono de piel o
 * un enlazador de ancho cero se deja como está.
 */
export const emojiVisible = (texto) => String(texto || '').replace(
  /(\p{Extended_Pictographic})(?![\uFE0E\uFE0F\u200D]|\p{Emoji_Modifier})/gu,
  '$1\uFE0F',
);

/**
 * Los tres círculos, y cómo se llaman en pantalla.
 *
 * Son cerrados y no un catálogo editable: cada círculo que se añadiera sería una
 * pregunta más en cada alta, y la pantalla de personas está construida justo
 * para no tener que hacerla —el «+» vive dentro de su grupo y ya sabe a cuál
 * añade (specs/ux.md §7.1).
 */
export const CIRCULOS = {
  familia: 'Familia',
  extendida: 'Familia Extendida',
  amigos: 'Amigos',
};

/** Cuántos caben en «Familia». Es el hogar, no un grupo que crece. */
export const TAMANO_FAMILIA = 4;

/**
 * Los parentescos que se ofrecen al dar de alta a alguien, por círculo.
 *
 * Antes era un campo libre, y un campo libre aquí se llena de variantes de lo
 * mismo —«mamá», «madre», «Mama»— que luego no se pueden leer. Dentro de casa
 * importa además que se escriban tal cual, porque de ahí sale lo que cada uno
 * ve bajo el nombre de los demás (specs/ux.md §7.1).
 *
 * Están en orden de cercanía y no alfabético: se elige de una lista corta
 * mirando, no leyéndola entera.
 */
export const PARENTESCOS = {
  // «Lóver» se traduce a «mamá» o «papá» para quien mira desde abajo, según el
  // género. Cuando esa pareja no es madre ni padre de las crías están
  // «madrastra» y «padrastro», que se leen tal cual y no se traducen.
  familia: ['madre', 'padre', 'hija', 'hijo', 'lóver', 'madrastra', 'padrastro'],
  extendida: [
    // De dentro hacia fuera, y dentro de cada escalón la sangre antes que lo
    // que llega por matrimonio.
    'lóver',
    'hermana', 'hermano',
    'abuela', 'abuelo',
    'bisabuela', 'bisabuelo',
    'nieta', 'nieto',
    'tía', 'tío',
    'tía abuela', 'tío abuelo',
    'tía segunda', 'tío segundo',
    'prima', 'primo',
    'prima segunda', 'primo segundo',
    'sobrina', 'sobrino',
    'sobrina segunda', 'sobrino segundo',
    'suegra', 'suegro',
    'cuñada', 'cuñado',
    'nuera', 'yerno',
    'madrastra', 'padrastro',
    'hermanastra', 'hermanastro',
    'madrina', 'padrino',
    'ahijada', 'ahijado',
  ],
  amigos: ['amiga', 'amigo', 'vecina', 'vecino', 'compañera', 'compañero'],
};

/** El valor que abre el campo libre, para lo que no entre en ninguna lista. */
export const PARENTESCO_OTRO = '__otro';

/**
 * El nombre entero, con los apellidos si los hay.
 *
 * Es lo que va en las listas donde se lee un nombre y no se habla de alguien:
 * los apellidos son lo que distingue a dos Marías, y hay quien está dado de
 * alta sin ellos —«la abuela»—, así que se pega solo lo que exista. Dentro de
 * una frase no se usa: «un regalo para Marta Ruiz Gómez» no lo dice nadie.
 */
export const nombreCompleto = (persona) =>
  [persona?.nombre, persona?.apellidos].filter(Boolean).join(' ');

/**
 * «de Marta», pero «del abuelo».
 *
 * Aquí hay gente dada de alta con el artículo dentro del nombre —«la abuela»,
 * «el abuelo»—, que es como se la llama en casa y por tanto como debe figurar.
 * Con «el» delante, la preposición se contrae, y «Cumpleaños de el abuelo» es
 * de las cosas que hacen que una pantalla parezca escrita por una máquina.
 *
 * Solo el artículo suelto, no cualquier palabra que empiece por esas dos
 * letras: «de Elena» se queda como está.
 */
export const deQuien = (nombre) => {
  const texto = String(nombre || '');
  return /^el\s/i.test(texto) ? `del ${texto.slice(3)}` : `de ${texto}`;
};

/**
 * El género, que solo existe para afinar cómo se nombra a cada uno.
 *
 * No es un dato del que la aplicación saque nada más: sirve para elegir entre
 * «mamá» y «papá», entre «hermana» y «hermano», cuando lo que hay escrito en el
 * parentesco no lo dice —«lóver», o cualquier cosa puesta a mano en «Otro»—.
 * Por eso puede quedarse sin poner, y entonces se deduce de la propia palabra.
 */
export const GENEROS = { f: 'Femenino', m: 'Masculino' };

/**
 * Emoji con el que arranca un título, si es que arranca con uno.
 *
 * Cuenta como uno solo la secuencia entera —el emoji, su selector de
 * presentación, el tono de piel y lo que venga unido con el enlazador de ancho
 * cero—, porque «👩‍🍳» es un símbolo y no tres.
 */
const EMOJI_INICIAL = /^(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)\s*/u;

/**
 * Parte un texto en el emoji con el que empieza y lo demás.
 *
 * Es el mismo trato que tienen los eventos —«para otro emoji, empieza el título
 * con él»— y por eso se comparte: en esta aplicación un emoji se escribe donde
 * se escribe el nombre, y no en un campo aparte.
 */
export function partirEmoji(texto) {
  const entero = String(texto || '').trim();
  const hallado = entero.match(EMOJI_INICIAL);
  if (!hallado) return { emoji: null, resto: entero };
  return { emoji: hallado[1], resto: entero.slice(hallado[0].length).trim() || entero };
}

/** Normaliza la duración que escribe Flighty: «1 hr, 43 min» → «1 h 43 min». */
function normalizarDuracion(bruto) {
  return String(bruto).replace(/\bhr\b/gi, 'h').replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Lee las notas de un vuelo de Flighty y saca lo legible, o `null` si no tienen
 * esa forma. Se ancla en las flechas ↗ (salida) y ↘ (llegada); la ruta es lo que
 * hay entre el número de vuelo y « to », y el enlace, el `flighty://`. Lo demás
 * —«Open in Flighty», «Synced by Flighty www.flighty.app»— se descarta.
 */
export function analizarVuelo(notas) {
  const texto = String(notas || '');
  if (!/flighty/i.test(texto)) return null;

  const salida = texto.match(/↗\s*(\d{1,2}:\d{2})\s*([A-Z]{2,5})?/);
  const llegada = texto.match(/↘\s*(\d{1,2}:\d{2})\s*([A-Z]{2,5})?/);
  if (!salida || !llegada) return null;

  const antes = texto.slice(0, texto.indexOf('↗'));
  const ruta = antes.replace(/^.*\d+\s+/, '').match(/^(.*?)\s+to\s+(.+?)\s*$/i);
  const duracion = texto.match(/Flight time\s+([^]*?)(?=\s+Open in Flighty|\s+Synced by|$)/i);
  const enlace = texto.match(/flighty:\/\/\S+/);

  return {
    origen: ruta ? ruta[1].trim() : null,
    destino: ruta ? ruta[2].trim() : null,
    salida: salida[1],
    husoSalida: salida[2] || null,
    llegada: llegada[1],
    husoLlegada: llegada[2] || null,
    duracion: duracion ? normalizarDuracion(duracion[1]) : null,
    enlaceFlighty: enlace ? enlace[0] : null,
  };
}

/**
 * Los dos códigos de aeropuerto y el número de vuelo que Flighty escribe en el
 * título —«CDG→BCN · AF 1248»—, o `null` si el título no tiene esa forma.
 *
 * Va aparte del parseo de las notas a propósito: el título basta para nombrar el
 * vuelo por sus ciudades, y así se sigue nombrando bien aunque las notas vengan
 * vacías o con otro formato.
 *
 * **No se enumera qué hay entre los dos códigos ni delante del número.** Se
 * probó con una lista de separadores —flecha, guion, barra— y lo que llegó fue
 * otro: entre los códigos una flecha larga y antes del número un `•` en vez del
 * `·` que se esperaba, así que el vuelo se quedó sin reconocer y la pantalla lo
 * enseñó al revés, con el código en el título y la ciudad dentro. Vale
 * cualquier cosa que no sea letra ni número.
 *
 * Lo que sí se exige es que **los dos códigos estén en la tabla de
 * aeropuertos**: es lo que impide que un título cualquiera con dos palabras de
 * tres letras en mayúscula se lea como si fuera un vuelo.
 */
function rutaDelTitulo(titulo) {
  const texto = String(titulo || '');
  const codigos = texto.match(/\b([A-Z]{3})\b[^A-Za-z0-9]+\b([A-Z]{3})\b/);
  if (!codigos) return null;
  if (!ciudadDeAeropuerto(codigos[1]) || !ciudadDeAeropuerto(codigos[2])) return null;

  const resto = texto.slice(codigos.index + codigos[0].length);
  return {
    codigoOrigen: codigos[1],
    codigoDestino: codigos[2],
    numero: resto.replace(/^[^A-Za-z0-9]+/, '').trim() || null,
  };
}

/**
 * Presentación completa de un vuelo importado: junta lo que dice el título
 * —los códigos de aeropuerto y el número de vuelo— con lo que dicen las notas
 * —horas, duración, huso y enlace—. Devuelve `null` si el evento no es un vuelo
 * reconocible. Es presentación, no dato: el contenido se corrige en el
 * calendario de origen (calendario-viajes §9).
 *
 * **La ciudad sale de la tabla de aeropuertos**, no de las notas: la tabla la
 * dice en castellano —«Londres», no «London»— y acierta con los aeropuertos que
 * no están en la ciudad que anuncian. Lo de las notas queda de reserva.
 */
export function presentarVuelo(evento) {
  if (!evento || evento.origen !== 'importado') return null;
  const ruta = rutaDelTitulo(evento.titulo);
  const vuelo = analizarVuelo(evento.notas);
  if (!ruta && !vuelo) return null;

  return {
    ...(vuelo || {}),
    codigoOrigen: ruta?.codigoOrigen || null,
    codigoDestino: ruta?.codigoDestino || null,
    numero: ruta?.numero || null,
    origen: ciudadDeAeropuerto(ruta?.codigoOrigen) || vuelo?.origen || null,
    destino: ciudadDeAeropuerto(ruta?.codigoDestino) || vuelo?.destino || null,
  };
}

/** El título de un vuelo en nombres de ciudad —«París → Barcelona · AF 1248»—,
 *  o `null` si el evento no es un vuelo. El código de aeropuerto se lee de un
 *  vistazo pero no dice a dónde vas; la ciudad, sí. */
export function tituloDeVuelo(evento) {
  const vuelo = presentarVuelo(evento);
  if (!vuelo || !vuelo.origen || !vuelo.destino) return null;
  return vuelo.numero
    ? `${vuelo.origen} → ${vuelo.destino} · ${vuelo.numero}`
    : `${vuelo.origen} → ${vuelo.destino}`;
}

/**
 * ¿Sigue vivo este registro?
 *
 * El borrado nunca es físico: se marca como inactivo (specs/modelo-datos.md
 * §1). Lo que hay que mirar con cuidado es **cómo** viene marcado: D1 guarda
 * `activo` como entero, así que por la sincronización llega un `0`, mientras
 * que la escritura optimista del propio dispositivo también escribe `0`. Un
 * `!== false` a secas deja pasar los dos, y lo borrado se queda en pantalla.
 */
export const estaActivo = (registro, campo = 'activo') => {
  const valor = registro?.[campo];
  if (valor === undefined || valor === null) return true;
  return valor !== false && valor !== 0 && valor !== '0';
};

/**
 * ¿Hay una clave de Anthropic puesta en el servidor?
 *
 * La instantánea trae la bandera y nunca la clave. Sirve para no ofrecer el
 * botón de contar el día cuando detrás no hay nada: pulsarlo daría siempre el
 * mismo error, y un botón que solo sabe fallar sobra.
 */
export const redaccionDisponible = (instantanea) => Boolean(instantanea?.redaccion?.disponible);

/** Texto comparable: sin mayúsculas y sin acentos. Lo usan la búsqueda global y
 *  el buscador de gente del formulario de una idea, que tienen que encontrar lo
 *  mismo escribiendo lo mismo. */
export const normalizar = (texto) =>
  String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const nuevoId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const ahora = () => new Date().toISOString();

export function crearVista(instantanea) {
  const personas = new Map((instantanea.personas || []).map((p) => [p.id, p]));
  const categorias = new Map((instantanea.categorias || []).map((c) => [c.id, c]));
  const tipos = new Map((instantanea.tipos_evento || []).map((t) => [t.id, t]));
  const etiquetas = new Map((instantanea.etiquetas || []).map((e) => [e.id, e]));
  const yo = instantanea.yo || {};

  const api = {
    datos: instantanea,
    yo,

    persona: (id) => personas.get(id) || null,
    nombre: (id) => personas.get(id)?.nombre || '—',
    personas: () => [...personas.values()].filter((p) => estaActivo(p, 'activa')),
    personasConCuenta: () => api.personas().filter((p) => p.tiene_cuenta),
    personasSinCuenta: () => api.personas().filter((p) => !p.tiene_cuenta),
    // Quien venga de un registro anterior a los círculos no trae el campo. Cae
    // en «extendida», que es el valor por defecto también en la base.
    personasDe: (circulo) => api.personas().filter((p) => (p.circulo || 'extendida') === circulo),
    categoria: (id) => categorias.get(id) || null,
    categorias: () => [...categorias.values()],
    tipoEvento: (id) => tipos.get(id) || null,
    tiposEvento: () => [...tipos.values()],
    etiqueta: (id) => etiquetas.get(id) || null,
    etiquetas: () => [...etiquetas.values()],
    esAdministrador: () => yo.rol === 'administrador',

    evento: (id) => (instantanea.eventos || []).find((e) => e.id === id) || null,
    idea: (id) => (instantanea.ideas || []).find((i) => i.id === id) || null,
    ocasion: (id) => (instantanea.ocasiones || []).find((o) => o.id === id) || null,
    regalo: (id) => (instantanea.regalos || []).find((r) => r.id === id) || null,

    emojiDe(evento) {
      return api.caraDe(evento).emoji;
    },

    /**
     * La cara del evento: con qué emoji se le reconoce y con qué título se
     * escribe.
     *
     * Si el título ya empieza por un emoji, ese manda y el del tipo sobra: dos
     * emojis seguidos en una fila de una sola línea no dicen el doble, estorban.
     * El del título se saca del texto y se pone en su sitio, de modo que la
     * columna de emojis de la semana sigue cuadrando y el título no lo repite.
     */
    caraDe(evento) {
      if (!evento) return { emoji: EMOJI_POR_DEFECTO, titulo: '' };
      const titulo = evento.titulo || '';
      const propio = titulo.match(EMOJI_INICIAL);

      // Un vuelo importado se nombra por sus ciudades —«París → Barcelona»— y no
      // por los códigos de aeropuerto que trae Flighty en el título: el código
      // se lee de un vistazo pero no dice a dónde vas.
      //
      // Se resuelve **antes** de mirar si el título empieza por un emoji. Cuando
      // eso se hacía después, un título con el avión delante salía de aquí por
      // la otra puerta y se quedaba sin traducir: el detalle enseñaba la ficha
      // bien, con los códigos, y encima el título en códigos también.
      const deVuelo = tituloDeVuelo(evento);

      if (propio) {
        return { emoji: propio[1], titulo: deVuelo || titulo.slice(propio[0].length) || titulo };
      }
      return {
        emoji: evento.emoji || tipos.get(evento.tipo_id)?.emoji || EMOJI_POR_DEFECTO,
        titulo: deVuelo || titulo,
      };
    },

    /** Valor propuesto por el tipo, salvo que el evento lo haya corregido.
     *  Un entreno o una revisión del coche no deben mostrar campos que nunca se
     *  van a rellenar (spec funcional §4.4). */
    llevaRegalos(evento) {
      if (!evento) return false;
      if (evento.lleva_regalos !== null && evento.lleva_regalos !== undefined) return Boolean(evento.lleva_regalos);
      return Boolean(tipos.get(evento.tipo_id)?.lleva_regalos);
    },

    protagonistas: (evento) => (evento?.participantes || []).filter((p) => p.rol === 'protagonista').map((p) => p.persona_id),
    participantes: (evento) => (evento?.participantes || []).map((p) => p.persona_id),

    /** ¿Este evento va de mí? Es la condición estática que enciende el aviso. */
    esMio(evento) {
      if (!evento || !yo.id) return false;
      if (evento.persona_origen_id === yo.id) return true;
      return api.protagonistas(evento).includes(yo.id);
    },

    ocasionDeEvento: (eventoId) => (instantanea.ocasiones || []).find((o) => o.evento_id === eventoId) || null,
    regalosDe: (ocasionId) => (instantanea.regalos || []).filter((r) => r.ocasion_id === ocasionId && estaActivo(r)),

    regalosPara(ocasionId, personaId) {
      return api.regalosDe(ocasionId).filter(
        (r) => r.destinatario_principal_id === personaId || (r.codestinatarios || []).includes(personaId),
      );
    },

    comentariosDe: (tipo, id) =>
      (instantanea.comentarios || []).filter((c) => c.objeto_tipo === tipo && c.objeto_id === id && estaActivo(c)),

    /**
     * Hasta cuándo se ha mirado este objeto, o `null` si nunca.
     *
     * Es lo que separa un comentario nuevo de uno ya leído, y de ahí salen las
     * dos cosas que lo dicen: la raya de «sin leer» dentro del hilo y el
     * renglón del sobre. La instantánea solo trae las filas de quien mira —el
     * Worker no manda las de nadie más—, así que aquí no hay a quién
     * comparar: lo que esté, es mío.
     */
    vistoHasta: (tipo, id) =>
      (instantanea.vistos || []).find((v) => v.objeto_tipo === tipo && v.objeto_id === id)?.hasta || null,

    /** Banco de ideas: lo activo y lo que está en curso, que permanece a la
     *  vista señalado con su ocasión para que nadie lo registre por su cuenta. */
    banco: () => (instantanea.ideas || []).filter(
      (i) => estaActivo(i, 'activa') && i.tipo === 'sugerencia' && ['activa', 'en_curso'].includes(i.estado),
    ),

    deseosDe: (personaId) =>
      (instantanea.ideas || []).filter(
        (i) => estaActivo(i, 'activa') && i.tipo === 'deseo' && i.autor_id === personaId && i.estado !== 'descartada',
      ),

    /**
     * A quiénes se les apuntan más ideas en el hogar, de más a menos.
     *
     * Es lo que rellena «los últimos» mientras este dispositivo no tenga los
     * suyos: abrir el buscador y encontrar un hueco vacío la primera vez sería
     * la peor bienvenida posible. Se deduce de la instantánea, así que no hay
     * nada que mantener ni que sincronizar.
     */
    masRegaladas() {
      const cuenta = new Map();
      for (const idea of instantanea.ideas || []) {
        if (!estaActivo(idea, 'activa') || idea.estado === 'descartada') continue;
        for (const orientacion of idea.orientaciones || []) {
          if (!orientacion.persona_id) continue;
          cuenta.set(orientacion.persona_id, (cuenta.get(orientacion.persona_id) || 0) + 1);
        }
      }
      return [...cuenta.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    },

    /** Quiénes aparecen en más eventos. Es el respaldo del buscador de gente en
     *  la agenda, igual que `masRegaladas` lo es en los regalos. */
    masEnEventos() {
      const cuenta = new Map();
      for (const evento of instantanea.eventos || []) {
        if (!estaActivo(evento)) continue;
        for (const participante of evento.participantes || []) {
          if (!participante.persona_id) continue;
          cuenta.set(participante.persona_id, (cuenta.get(participante.persona_id) || 0) + 1);
        }
      }
      return [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    },

    ideasPara: (personaId) =>
      (instantanea.ideas || []).filter(
        (i) => estaActivo(i, 'activa') && i.tipo === 'sugerencia'
          && (i.orientaciones || []).some((o) => o.persona_id === personaId),
      ),

    /**
     * Los regalos que están en marcha, cada uno con la ocasión de la que cuelga.
     *
     * En marcha es todo lo que cuelga de una ocasión **abierta**, esté comprado
     * o no y haya pasado su fecha o no. Lo que se cierra deja de estar en marcha
     * y pasa al histórico de quien lo recibió, que se consulta en su ficha: son
     * las dos mitades de lo mismo y por eso se leen de la misma condición
     * (specs/ux.md §6.2).
     *
     * La ocasión viene pegada porque de ella salen la fecha y el nombre, que es
     * lo que sitúa cada regalo; buscarla después, fila a fila, sería recorrer la
     * lista de ocasiones una vez por regalo.
     */
    regalosEnMarcha() {
      const abiertas = new Map(
        (instantanea.ocasiones || [])
          .filter((o) => estaActivo(o, 'activa') && o.estado === 'abierta')
          .map((o) => [o.id, o]),
      );
      return (instantanea.regalos || [])
        .filter((r) => estaActivo(r) && abiertas.has(r.ocasion_id))
        .map((regalo) => ({ regalo, ocasion: abiertas.get(regalo.ocasion_id) }));
    },

    /** Histórico derivado por consulta sobre las ocasiones cerradas: no existe
     *  entidad de histórico, de modo que no puede divergir del dato de origen. */
    historicoDe(personaId) {
      const cerradas = new Set((instantanea.ocasiones || []).filter((o) => o.estado === 'cerrada').map((o) => o.id));
      return (instantanea.regalos || []).filter(
        (r) => estaActivo(r) && cerradas.has(r.ocasion_id)
          && (r.destinatario_principal_id === personaId || (r.codestinatarios || []).includes(personaId)),
      );
    },

    atributosDe: (personaId) =>
      (instantanea.atributos_persona || []).filter((a) => a.persona_id === personaId && estaActivo(a)),

    /** Gasto registrado y número de regalos sin importe. Distinguir ambas cosas
     *  evita mostrar una desviación favorable inexistente (spec funcional §6.3).
     *
     *  El panel que lo pintaba está retirado de la interfaz mientras se decide
     *  qué forma tiene; el dato lo sigue transmitiendo el servidor y la consulta
     *  se conserva para cuando vuelva. */
    gastoDe(ocasionId, personaId) {
      const regalos = api.regalosPara(ocasionId, personaId);
      const conImporte = regalos.filter((r) => typeof r.coste_real === 'number');
      return {
        regalos: regalos.length,
        registrado: conImporte.reduce((suma, r) => suma + r.coste_real, 0),
        sinImporte: regalos.length - conImporte.length,
      };
    },
  };

  return api;
}

/**
 * Cómo va un regalo. Tres estados, y ninguno de adorno.
 *
 * «Envuelto» era el cuarto y se ha ido: no lo marcaba nadie, de modo que su
 * único efecto era añadir una opción más a un desplegable que contesta a una
 * pregunta de sí o no. «Entregado» se queda porque es el que cierra el ciclo:
 * es lo que pasa la idea a cerrada y manda el regalo al histórico de quien lo
 * recibió (specs/modelo-datos.md §4).
 *
 * Se llaman por lo que hay que hacer con ellos y no por su nombre en la base:
 * «pendiente» no dice qué falta, «Por comprar» sí.
 */
export const ESTADOS_REGALO = [
  { valor: 'pendiente', texto: 'Por comprar' },
  { valor: 'comprado', texto: 'Listo' },
  { valor: 'entregado', texto: 'Entregado' },
];

/**
 * El estado de un regalo, leído a prueba de lo que ya está escrito.
 *
 * La migración convierte a «comprado» lo que estuviera «envuelto», pero la
 * instantánea puede llegar antes que ella —el despliegue de la aplicación y el
 * de la API son dos—. Sin esto, un regalo así caería en un desplegable que no
 * tiene su valor, y el desplegable enseñaría el primero de la lista: diría «por
 * comprar» de algo ya comprado.
 */
export const estadoDeRegalo = (regalo) => (regalo?.estado === 'envuelto' ? 'comprado' : regalo?.estado || 'pendiente');

/** Cómo se escribe ese estado en pantalla. */
export const textoDeEstado = (regalo) =>
  ESTADOS_REGALO.find((e) => e.valor === estadoDeRegalo(regalo))?.texto || estadoDeRegalo(regalo);

export const REPETICIONES = [
  { valor: 'ninguna', texto: 'No se repite' },
  { valor: 'semanal', texto: 'Cada semana' },
  { valor: 'mensual', texto: 'Cada mes' },
  { valor: 'anual', texto: 'Cada año' },
];

export function formatearImporte(valor) {
  if (typeof valor !== 'number') return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(valor);
}
