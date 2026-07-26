/**
 * Lo que la agenda le pide a un modelo de Anthropic: contar un día y proponer
 * un regalo.
 *
 * La llamada sale de aquí y no del teléfono por tres motivos, en orden de
 * importancia: la clave es una credencial de pago del hogar y no debe viajar a
 * ningún dispositivo; el texto que se le manda al modelo se compone en el
 * servidor a partir del registro canónico, así que el cliente no puede
 * inyectarle nada; y la respuesta se puede limitar por persona y por minuto,
 * que es lo único que impide que una sesión legítima gaste la cuenta.
 *
 * Lo que el cliente manda son identificadores: una fecha y unos eventos, o una
 * persona. Cada uno se comprueba contra la instantánea filtrada de quien pide
 * —la misma que le transmite `/api/sync`—, de modo que por aquí no puede salir
 * hacia el modelo nada que esa persona no pueda ver.
 *
 * La única excepción es la pista de la sugerencia de regalo, que es texto libre
 * y va explicada donde se compone: es lo que quien pide acaba de escribir en su
 * propio formulario, y vuelve a su propia pantalla.
 */

const ANTHROPIC = 'https://api.anthropic.com/v1';
const VERSION_API = '2023-06-01';

/** Lista de reserva, y a la vez cadena de repuesto cuando un modelo falla. El
 *  orden es de más barato a más caro: el trabajo es de dos frases. */
export const MODELOS_DE_RESERVA = [
  { id: 'claude-haiku-4-5', nombre: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-5', nombre: 'Claude Sonnet 5' },
  { id: 'claude-opus-5', nombre: 'Claude Opus 5' },
];

export const MODELO_POR_DEFECTO = MODELOS_DE_RESERVA[0].id;

export const INSTRUCCION_POR_DEFECTO = [
  'Eres quien escribe los recados de una familia. Te doy lo que hay en un día o',
  'en unos cuantos días seguidos. Escribe un mensaje corto para WhatsApp que lo',
  'cuente en dos o tres frases —cuatro si son muchos días—, en español de España,',
  'en tono llano y cálido.',
  'No inventes nada que no esté en la lista, no añadas saludo ni despedida,',
  'y no uses emojis. Responde solo con el mensaje.',
].join(' ');

export const INSTRUCCION_REGALO_POR_DEFECTO = [
  'Propones regalos para una familia. Te doy lo que se sabe de la persona: su',
  'edad, lo que se le ha apuntado, lo que ella misma ha pedido, las ideas que ya',
  'hay para ella y lo que ya ha recibido otros años.',
  'Propón un solo regalo, concreto y comprable —no una categoría—, que no repita',
  'ninguna de las ideas ni de los regalos que te doy y que encaje con su edad.',
  'Responde en dos líneas y nada más: la primera, el regalo en menos de ocho',
  'palabras; la segunda, una frase corta que diga por qué encaja.',
  'En español de España, sin emojis, sin viñetas y sin comillas.',
].join(' ');

const MAXIMO_EVENTOS = 20;
// Un periodo da para más, pero no para todo: un mes cargado son cuarenta o
// cincuenta líneas, y por encima de ahí el modelo ya no cuenta nada, resume.
const MAXIMO_EVENTOS_PERIODO = 60;
const MAXIMO_DIAS = 40;
// Doce por lista: más allá de eso el modelo deja de leer y empieza a resumir, y
// lo que importa de estas listas es no repetir lo que ya hay.
const MAXIMO_POR_LISTA = 12;
const TOPE_DE_PISTA = 200;
const LIMITE_POR_MINUTO = 6;
const TOPE_DE_SALIDA = 400;

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ------------------------------------------------------------ Configuración --

const CLAVES = {
  clave: 'ia.clave',
  modelo: 'ia.modelo',
  instruccion: 'ia.instruccion',
  regalo: 'ia.regalo',
};

export async function leerConfiguracion(db) {
  const { results } = await db
    .prepare("SELECT clave, valor, actualizado_en FROM configuracion WHERE clave LIKE 'ia.%'")
    .all();

  const filas = new Map((results || []).map((f) => [f.clave, f]));
  const clave = filas.get(CLAVES.clave);
  return {
    clave: clave?.valor || '',
    guardada_en: clave?.actualizado_en || null,
    modelo: filas.get(CLAVES.modelo)?.valor || MODELO_POR_DEFECTO,
    instruccion: filas.get(CLAVES.instruccion)?.valor || INSTRUCCION_POR_DEFECTO,
    regalo: filas.get(CLAVES.regalo)?.valor || INSTRUCCION_REGALO_POR_DEFECTO,
  };
}

/**
 * Lo que se le puede enseñar a un administrador.
 *
 * La clave nunca vuelve entera: se devuelven los cuatro últimos caracteres y la
 * fecha en que se guardó, que es lo que hace falta para reconocer cuál está
 * puesta sin poder copiarla de la pantalla de nadie.
 */
export function configuracionPublica(configuracion) {
  return {
    hay_clave: Boolean(configuracion.clave),
    cola: configuracion.clave ? configuracion.clave.slice(-4) : null,
    guardada_en: configuracion.guardada_en,
    modelo: configuracion.modelo,
    instruccion: configuracion.instruccion,
    regalo: configuracion.regalo,
  };
}

/** Guarda solo lo que venga. Una cadena vacía en `clave` la borra —que es como
 *  se apaga la función— y deja el resto en pie. */
export async function guardarConfiguracion(db, persona, campos = {}) {
  const escrituras = [];
  for (const [nombre, clave] of Object.entries(CLAVES)) {
    const valor = campos[nombre];
    if (valor === undefined || valor === null) continue;

    if (valor === '') {
      escrituras.push(db.prepare('DELETE FROM configuracion WHERE clave = ?').bind(clave));
      continue;
    }
    escrituras.push(
      db
        .prepare(
          `INSERT INTO configuracion (clave, valor, actualizado_en, actualizado_por)
           VALUES (?, ?, datetime('now'), ?)
           ON CONFLICT(clave) DO UPDATE SET
             valor = excluded.valor,
             actualizado_en = excluded.actualizado_en,
             actualizado_por = excluded.actualizado_por`,
        )
        .bind(clave, String(valor), persona.id),
    );
  }
  if (escrituras.length) await db.batch(escrituras);
  return leerConfiguracion(db);
}

// ------------------------------------------------------------------ Modelos --

/** El configurado primero y el resto detrás, sin repetirlo. */
export function cadenaDeModelos(modelo) {
  const reserva = MODELOS_DE_RESERVA.map((m) => m.id);
  const primero = modelo || MODELO_POR_DEFECTO;
  return [primero, ...reserva.filter((id) => id !== primero)];
}

/**
 * Los modelos que Anthropic ofrece a esa cuenta. Si no contesta —o no hay
 * clave— se devuelve la lista de reserva, que es la misma por la que baja la
 * redacción cuando un modelo falla.
 */
export async function modelosDisponibles(clave, buscar = fetch) {
  if (!clave) return { modelos: MODELOS_DE_RESERVA, de: 'reserva' };

  try {
    const respuesta = await buscar(`${ANTHROPIC}/models?limit=100`, {
      headers: { 'x-api-key': clave, 'anthropic-version': VERSION_API },
    });
    if (!respuesta.ok) return { modelos: MODELOS_DE_RESERVA, de: 'reserva' };

    const datos = await respuesta.json();
    const modelos = (datos.data || [])
      .map((m) => ({ id: m.id, nombre: m.display_name || m.id }))
      .filter((m) => m.id);
    return modelos.length ? { modelos, de: 'anthropic' } : { modelos: MODELOS_DE_RESERVA, de: 'reserva' };
  } catch {
    return { modelos: MODELOS_DE_RESERVA, de: 'reserva' };
  }
}

// -------------------------------------------------------------- El material --

function partes(fecha) {
  const [anio, mes, dia] = String(fecha).split('-').map(Number);
  return { anio, mes: mes || 1, dia: dia || 1 };
}

function formatearFecha(fecha) {
  const { anio, mes, dia } = partes(fecha);
  const momento = new Date(Date.UTC(anio, mes - 1, dia));
  return `${NOMBRES_DIA[momento.getUTCDay()]} ${dia} de ${MESES[mes - 1]}`;
}

/** «del 20 al 26 de Julio de 2026», con el mes y el año repetidos solo cuando
 *  el tramo los cruza. Es el encabezado que ve el modelo, y también lo único
 *  que le dice de cuándo se está hablando. */
function formatearRango(desde, hasta) {
  const a = partes(desde);
  const b = partes(hasta);
  if (a.anio !== b.anio) {
    return `del ${a.dia} de ${MESES[a.mes - 1]} de ${a.anio} al ${b.dia} de ${MESES[b.mes - 1]} de ${b.anio}`;
  }
  if (a.mes !== b.mes) {
    return `del ${a.dia} de ${MESES[a.mes - 1]} al ${b.dia} de ${MESES[b.mes - 1]} de ${b.anio}`;
  }
  if (a.dia === b.dia) return `${formatearFecha(desde)} de ${a.anio}`;
  return `del ${a.dia} al ${b.dia} de ${MESES[b.mes - 1]} de ${b.anio}`;
}

function horaDe(evento) {
  if (evento.jornada_completa) return null;
  const hora = String(evento.inicio || '').split('T')[1];
  return hora ? hora.slice(0, 5) : null;
}

/**
 * El texto que se le da al modelo, compuesto **solo** con lo que el observador
 * puede ver: los identificadores que no estén en su instantánea se descartan en
 * silencio. Sin emojis: el adorno es cosa de la lista que se comparte tal cual,
 * y aquí solo estorbaría al modelo.
 */
export function componerMaterial(instantanea, fecha, ids = []) {
  const visibles = new Map((instantanea.eventos || []).map((e) => [e.id, e]));
  const lineas = [];

  for (const id of ids.slice(0, MAXIMO_EVENTOS)) {
    const evento = visibles.get(id);
    if (evento) lineas.push(lineaDe(evento));
  }

  return { titulo: formatearFecha(fecha), lineas };
}

function lineaDe(evento) {
  const hora = horaDe(evento);
  return [hora ? `${hora} ·` : 'todo el día ·', evento.titulo, evento.ubicacion ? `· ${evento.ubicacion}` : null]
    .filter(Boolean)
    .join(' ');
}

/**
 * Lo mismo, pero de un tramo de días: la semana o el mes que se está mirando,
 * o lo que viene en los próximos siete.
 *
 * El reparto por días lo manda el dispositivo, y a propósito: una repetición se
 * expande allí, y traer esa regla al Worker sería una tercera copia de algo que
 * este repositorio ya duplica a conciencia solo dos veces. Lo que el cliente
 * manda son fechas e identificadores —nunca texto—, así que por aquí sigue sin
 * poder colarse nada: el título, la hora y el sitio salen de la instantánea
 * filtrada de quien pide, y el encabezado se compone aquí a partir del tramo.
 */
export function componerMaterialDePeriodo(instantanea, { desde, hasta, dias = [] }) {
  const visibles = new Map((instantanea.eventos || []).map((e) => [e.id, e]));
  const lineas = [];
  let cuenta = 0;

  for (const jornada of dias.slice(0, MAXIMO_DIAS)) {
    const delDia = [];
    for (const id of jornada.eventos || []) {
      if (cuenta >= MAXIMO_EVENTOS_PERIODO) break;
      const evento = visibles.get(id);
      if (!evento) continue;
      delDia.push(`  ${lineaDe(evento)}`);
      cuenta += 1;
    }
    // Los días sin nada no se le cuentan al modelo: son la mayoría de un mes y
    // solo servirían para que redactara sobre lo que no pasa.
    if (delDia.length) lineas.push(`${formatearFecha(jornada.fecha)}:`, ...delDia);
  }

  return { titulo: formatearRango(desde, hasta), lineas };
}

/**
 * Lo que se le cuenta al modelo de una persona para que proponga un regalo.
 *
 * Sale entero de la instantánea filtrada de quien pide: sus datos, lo que ella
 * misma ha pedido, las ideas que ya hay para ella y lo que recibió en las
 * ocasiones cerradas. Si algo de eso está oculto para quien pide, aquí no está,
 * porque aquí no se lee el registro sino lo que ya se le transmitió.
 *
 * La `pista` es la excepción del módulo: texto libre, y es lo que quien pide
 * acaba de escribir en el formulario de la idea —«algo para el verano»—. No
 * abre ninguna puerta, porque lo que el modelo conteste vuelve a la pantalla de
 * quien lo escribió y a ningún otro sitio; se recorta por si acaso.
 */
export function componerMaterialDeRegalo(instantanea, { personaId, pista = '', hoy = null } = {}) {
  const persona = (instantanea.personas || []).find((p) => p.id === personaId);
  if (!persona) return { titulo: '', lineas: [] };

  const senas = [persona.parentesco, edadDe(persona, hoy)].filter(Boolean).join(', ');
  const lineas = [`Para ${persona.nombre}${senas ? ` (${senas})` : ''}`];

  const bloque = (titulo, valores) => {
    const utiles = valores.filter(Boolean).slice(0, MAXIMO_POR_LISTA);
    if (utiles.length) lineas.push(`${titulo}:`, ...utiles.map((valor) => `  ${valor}`));
  };

  const suya = (idea) => (idea.orientaciones || []).some((o) => o.persona_id === personaId);
  const ideas = (instantanea.ideas || []).filter((i) => i.estado !== 'descartada');

  bloque('Lo que se sabe de ella', (instantanea.atributos_persona || [])
    .filter((a) => a.persona_id === personaId)
    .map((a) => `${a.clave}: ${a.valor}`));

  bloque('Lo que ha pedido', ideas
    .filter((i) => i.tipo === 'deseo' && i.autor_id === personaId)
    .map((i) => i.titulo));

  bloque('Ideas que ya hay apuntadas para ella', ideas
    .filter((i) => i.tipo === 'sugerencia' && suya(i))
    .map((i) => i.titulo));

  const cerradas = new Map(
    (instantanea.ocasiones || []).filter((o) => o.estado === 'cerrada').map((o) => [o.id, o.nombre]),
  );
  const titulos = new Map(ideas.map((i) => [i.id, i.titulo]));
  bloque('Lo que ya ha recibido', (instantanea.regalos || [])
    .filter((r) => cerradas.has(r.ocasion_id))
    .filter((r) => r.destinatario_principal_id === personaId || (r.codestinatarios || []).includes(personaId))
    .map((r) => {
      const que = titulos.get(r.idea_id) || 'un regalo';
      return `${que} (${cerradas.get(r.ocasion_id)})`;
    }));

  const dicha = String(pista || '').replace(/\s+/g, ' ').trim().slice(0, TOPE_DE_PISTA);
  if (dicha) bloque('Lo que apunta quien lo pide', [dicha]);

  return { titulo: `Un regalo para ${persona.nombre}`, lineas };
}

/** Los años que cumple este año, que es como se habla de la edad al pensar un
 *  regalo. Sin fecha de nacimiento no se dice nada: inventarla sería peor. */
function edadDe(persona, hoy) {
  if (!persona.fecha_nacimiento) return null;
  const nacimiento = partes(persona.fecha_nacimiento);
  const referencia = partes(hoy || new Date().toISOString().slice(0, 10));
  if (!nacimiento.anio || !referencia.anio) return null;

  let anios = referencia.anio - nacimiento.anio;
  if (referencia.mes < nacimiento.mes || (referencia.mes === nacimiento.mes && referencia.dia < nacimiento.dia)) {
    anios -= 1;
  }
  return anios >= 0 && anios < 130 ? `${anios} años` : null;
}

// ----------------------------------------------------------------- Llamada --

async function intentar({ clave, modelo, instruccion, material, buscar }) {
  const arranque = Date.now();
  const cuerpo = {
    model: modelo,
    max_tokens: TOPE_DE_SALIDA,
    system: instruccion,
    messages: [{
      role: 'user',
      content: `${material.titulo}\n${material.lineas.join('\n')}`,
    }],
  };

  // Sin parámetros de muestreo ni de razonamiento: los modelos nuevos rechazan
  // `temperature` y `budget_tokens` con un 400, y para dos frases no hacen falta.
  const respuesta = await buscar(`${ANTHROPIC}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': clave,
      'anthropic-version': VERSION_API,
      'content-type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });

  const ms = Date.now() - arranque;
  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    return {
      modelo,
      ms,
      estado: respuesta.status,
      tipo: datos?.error?.type || 'error',
      mensaje: datos?.error?.message || `la API respondió ${respuesta.status}`,
    };
  }

  // Un rechazo por política llega con 200 y sin texto útil: cuenta como intento
  // fallido y se prueba con el siguiente modelo.
  if (datos.stop_reason === 'refusal') {
    return { modelo, ms, estado: 200, tipo: 'refusal', mensaje: 'el modelo declinó redactarlo' };
  }

  const texto = (datos.content || [])
    .filter((bloque) => bloque.type === 'text')
    .map((bloque) => bloque.text)
    .join('')
    .trim();

  if (!texto) {
    return { modelo, ms, estado: 200, tipo: 'vacio', mensaje: 'la respuesta no traía texto' };
  }

  return { modelo, ms, estado: 200, texto, uso: datos.usage || null };
}

/**
 * Redacta bajando por la cadena de modelos hasta que uno conteste.
 *
 * Devuelve siempre la traza entera —modelo, código, tipo, mensaje y
 * milisegundos de cada intento—, que es lo que se enseña al probar desde
 * Ajustes. Sin eso, un fallo de configuración se investiga a ciegas.
 *
 * `instruccion` es el encargo, y cada función tiene el suyo: contar un día o
 * proponer un regalo. Sin ella se usa el de contar, que es el que la
 * configuración llama así desde que era el único.
 */
export async function redactar({ configuracion, material, instruccion, buscar = fetch }) {
  if (!configuracion.clave) {
    return { texto: null, modelo: null, intentos: [], motivo: 'no hay clave configurada' };
  }
  if (!material.lineas.length) {
    return { texto: null, modelo: null, intentos: [], motivo: 'ese día no tiene nada que contar' };
  }

  const intentos = [];
  for (const modelo of cadenaDeModelos(configuracion.modelo)) {
    let intento;
    try {
      intento = await intentar({
        clave: configuracion.clave,
        modelo,
        instruccion: instruccion || configuracion.instruccion || INSTRUCCION_POR_DEFECTO,
        material,
        buscar,
      });
    } catch (error) {
      intento = { modelo, ms: null, estado: null, tipo: 'red', mensaje: String(error.message || error) };
    }

    intentos.push(intento);
    if (intento.texto) return { texto: intento.texto, modelo, intentos };
  }

  return { texto: null, modelo: null, intentos, motivo: 'ningún modelo ha contestado' };
}

// ------------------------------------------------------------------- Freno --

/**
 * Un contador por persona y por minuto. Devuelve si la petición cabe.
 *
 * Se purga lo viejo en la misma escritura: la tabla no tiene por qué guardar
 * más que el minuto en curso de quien está usando la aplicación ahora.
 */
export async function cabeUnaMas(db, personaId, limite = LIMITE_POR_MINUTO) {
  const ventana = new Date().toISOString().slice(0, 16);

  await db.batch([
    db.prepare("DELETE FROM redaccion_uso WHERE ventana < ?").bind(ventana),
    db
      .prepare(
        `INSERT INTO redaccion_uso (persona_id, ventana, cuenta) VALUES (?, ?, 1)
         ON CONFLICT(persona_id, ventana) DO UPDATE SET cuenta = cuenta + 1`,
      )
      .bind(personaId, ventana),
  ]);

  const fila = await db
    .prepare('SELECT cuenta FROM redaccion_uso WHERE persona_id = ? AND ventana = ?')
    .bind(personaId, ventana)
    .first();

  return (fila?.cuenta || 0) <= limite;
}
