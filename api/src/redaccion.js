/**
 * Lo que la agenda le pide a un modelo de Anthropic: contar un día, proponer un
 * regalo y felicitar un cumpleaños.
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
 *
 * Los tres encargos son el mismo mecanismo con instrucciones distintas, y cada
 * uno se puede reescribir desde Ajustes. Lo que cambia entre ellos es el
 * material: de un día se le cuentan los eventos; de un regalo, lo que se sabe de
 * quien lo recibe; de una felicitación, **solo lo que esa persona ya sabe de sí
 * misma**, porque el texto se le manda a ella.
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
  'Propón CINCO regalos distintos entre sí, concretos y comprables —no',
  'categorías—, que no repitan ninguna de las ideas ni de los regalos que te doy',
  'y que encajen con su edad.',
  'Responde con cinco líneas y nada más, numeradas del 1 al 5, cada una con esta',
  'forma: «regalo en menos de ocho palabras — una frase corta que diga por qué',
  'encaja».',
  'En español de España, sin emojis, sin viñetas y sin comillas.',
].join(' ');

/**
 * El encargo de la felicitación, que es el único de los tres con emojis.
 *
 * Va a WhatsApp y va a la persona que cumple, así que se le pide gracia y se le
 * prohíbe la crueldad fácil —la edad, el cuerpo— y la invención: lo que no esté
 * en el material no se pone, porque quien lo reciba lo va a leer sabiendo si es
 * verdad.
 */
export const INSTRUCCION_FELICITACION_POR_DEFECTO = [
  'Escribes felicitaciones de cumpleaños para mandar por WhatsApp. Te doy quién',
  'cumple, los años que cumple, qué es en la familia y lo que se sabe de esa',
  'persona.',
  'Escribe CINCO felicitaciones distintas entre sí, de una o dos frases cada una,',
  'con gracia y con cariño, en español de España y tuteando, y pon en cada una dos',
  'o tres emojis.',
  'La gracia sale de lo que sabes de ella —lo que le gusta, sus manías, lo que',
  'hace—, no de un chiste de calendario. No te metas con su edad ni con su cuerpo,',
  'y no inventes nada que no te haya dado: lo va a leer quien cumple.',
  'Responde con cinco líneas y nada más, numeradas del 1 al 5, cada línea la',
  'felicitación entera, sin comillas y sin explicar nada.',
].join(' ');

/**
 * El encargo de los apuntes de un sitio, que es el cuarto y el más acotado.
 *
 * Se le dice qué sitio, de qué clase se le pide y **lo que ya está apuntado
 * ahí**, que es lo que lo hace útil: sin eso, la primera propuesta de «llevar» a
 * una playa es siempre la crema solar, que ya está escrita desde el primer día,
 * y la tanda se gasta en repetir lo que uno ya sabe.
 *
 * Se le pide el porqué en la misma línea porque el porqué es el apunte: «crema
 * solar» no vale nada; «allí el viento engaña y se quema todo el mundo el primer
 * día» es la razón por la que este módulo existe.
 */
export const INSTRUCCION_APUNTE_POR_DEFECTO = [
  'Apuntas lo que conviene saber de un sitio al que va una familia. Te doy el',
  'sitio, de qué va lo que te pido —cosas que LLEVAR, cosas que HACER, sitios a',
  'los que IR o cosas que SABER— y lo que ya hay apuntado ahí.',
  'Propón CINCO cosas de esa clase, concretas y distintas entre sí, que no',
  'repitan ninguna de las que ya hay ni sean variantes suyas.',
  'Responde con cinco líneas y nada más, numeradas del 1 al 5, cada una con esta',
  'forma: «la cosa en menos de ocho palabras — una frase corta que diga por qué o',
  'qué hay que saber».',
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
// Las ya propuestas se le devuelven al modelo para que la tanda siguiente no
// repita a la anterior. Con más de treinta la lista pesa más que el encargo, y
// nadie pasa de ahí sin haberse rendido antes.
const MAXIMO_DESCARTADAS = 30;
const TOPE_DE_PISTA = 200;
const PROPUESTAS_POR_TANDA = 5;
// Los que el servidor no sabe resolver se devuelven para poder mirarlos, pero
// no en cantidad ilimitada: con unos pocos ya se ve de qué familia son.
const MAXIMO_OMITIDOS = 10;
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
  felicitacion: 'ia.felicitacion',
  apunte: 'ia.apunte',
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
    felicitacion: filas.get(CLAVES.felicitacion)?.valor || INSTRUCCION_FELICITACION_POR_DEFECTO,
    apunte: filas.get(CLAVES.apunte)?.valor || INSTRUCCION_APUNTE_POR_DEFECTO,
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
    felicitacion: configuracion.felicitacion,
    apunte: configuracion.apunte,
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
/**
 * Lo que el observador puede ver, por identificador.
 *
 * No basta con `instantanea.eventos`: los cumpleaños no son filas de `evento`.
 * Se derivan de la fecha de nacimiento de cada persona, en el dispositivo, con
 * un identificador compuesto —`derivado:cumpleanos:<persona>`— que aquí no
 * existe. Sin resolverlos, se caían en silencio y el modelo contaba una semana
 * sin el cumpleaños que la ocupaba.
 *
 * Lo que se copia de esa regla es solo el nombre —«Cumpleaños de X»—, no las
 * fechas: de cuándo cae cada uno sigue decidiéndolo el dispositivo, que es
 * quien expande las repeticiones. Y sale del registro de la persona, no de lo
 * que mande el cliente, de modo que por aquí sigue sin poder colarse texto: si
 * esa persona no está en la instantánea de quien pide, su cumpleaños tampoco.
 *
 * **Si algún día se deriva algo más en el dispositivo** —y el modelo de datos
 * deja la puerta abierta con `origen = 'derivado'`—, hay que resolverlo aquí
 * también. Lo que no puede volver a pasar es que se caiga sin ruido: por eso
 * los identificadores que no se reconocen se devuelven en `omitidos`, se
 * escriben en la traza del Worker y se enseñan al probar desde Ajustes. Un
 * evento de tipo «viaje» o uno importado de un calendario externo no entran en
 * esto: son filas de `evento` y llegan en la instantánea como los demás.
 */
function visiblesDe(instantanea) {
  const porId = new Map((instantanea.eventos || []).map((e) => [e.id, e]));

  for (const persona of instantanea.personas || []) {
    if (!persona.fecha_nacimiento) continue;
    if (persona.activa === 0 || persona.activa === false) continue;
    porId.set(`derivado:cumpleanos:${persona.id}`, {
      id: `derivado:cumpleanos:${persona.id}`,
      titulo: `Cumpleaños de ${persona.nombre}`,
      inicio: persona.fecha_nacimiento,
      jornada_completa: true,
    });
  }

  return porId;
}

export function componerMaterial(instantanea, fecha, ids = []) {
  const visibles = visiblesDe(instantanea);
  const lineas = [];
  const omitidos = [];

  for (const id of ids.slice(0, MAXIMO_EVENTOS)) {
    const evento = visibles.get(id);
    if (evento) lineas.push(lineaDe(evento));
    else if (omitidos.length < MAXIMO_OMITIDOS) omitidos.push(id);
  }

  return { titulo: formatearFecha(fecha), lineas, omitidos };
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
  const visibles = visiblesDe(instantanea);
  const lineas = [];
  const omitidos = [];
  let cuenta = 0;

  for (const jornada of dias.slice(0, MAXIMO_DIAS)) {
    const delDia = [];
    for (const id of jornada.eventos || []) {
      if (cuenta >= MAXIMO_EVENTOS_PERIODO) break;
      const evento = visibles.get(id);
      if (!evento) {
        if (omitidos.length < MAXIMO_OMITIDOS) omitidos.push(id);
        continue;
      }
      delDia.push(`  ${lineaDe(evento)}`);
      cuenta += 1;
    }
    // Los días sin nada no se le cuentan al modelo: son la mayoría de un mes y
    // solo servirían para que redactara sobre lo que no pasa.
    if (delDia.length) lineas.push(`${formatearFecha(jornada.fecha)}:`, ...delDia);
  }

  return { titulo: formatearRango(desde, hasta), lineas, omitidos };
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
export function componerMaterialDeRegalo(
  instantanea,
  { personaId, pista = '', descartadas = [], hoy = null } = {},
) {
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

  // Lo ya propuesto en esta misma sesión. Sin esto, pedir otra tanda devuelve
  // casi la anterior: el material que ve el modelo es idéntico.
  const yaDichas = descartadas
    .map((titulo) => String(titulo || '').trim())
    .filter(Boolean)
    .slice(0, MAXIMO_DESCARTADAS);
  if (yaDichas.length) {
    lineas.push('Ya has propuesto esto, no lo repitas ni propongas variantes suyas:');
    lineas.push(...yaDichas.map((titulo) => `  ${titulo}`));
  }

  return { titulo: `Un regalo para ${persona.nombre}`, lineas };
}

/**
 * Lo que se le cuenta al modelo para que felicite a quien cumple.
 *
 * Es el material más corto de los tres, y lo es a propósito: **la felicitación se
 * le manda a la persona que cumple**, así que aquí solo puede entrar lo que ella
 * ya sabe de sí misma —cómo se llama, qué es en la familia, los años que cumple y
 * lo que hay apuntado sobre ella—. Las ideas, los regalos y lo que recibió otros
 * años se quedan fuera: son justo lo que no debe leer, y un modelo al que se le
 * da un regalo pendiente lo acaba mencionando.
 *
 * Los años son los que **cumple**, no los cumplidos: el día del cumpleaños son
 * los mismos, y cualquier otro día de después se habla ya del siguiente.
 */
export function componerMaterialDeFelicitacion(
  instantanea,
  { personaId, descartadas = [], hoy = null } = {},
) {
  const persona = (instantanea.personas || []).find((p) => p.id === personaId);
  if (!persona) return { titulo: '', lineas: [] };

  const anios = aniosQueCumple(persona, hoy);
  const senas = [persona.parentesco, anios ? `cumple ${anios} años` : null].filter(Boolean).join(', ');
  const lineas = [`Felicita a ${persona.nombre}${senas ? ` (${senas})` : ''}`];

  const suyos = (instantanea.atributos_persona || [])
    .filter((a) => a.persona_id === personaId)
    .slice(0, MAXIMO_POR_LISTA)
    .map((a) => `  ${a.clave}: ${a.valor}`);
  if (suyos.length) lineas.push('Lo que se sabe de ella:', ...suyos);

  const yaDichas = descartadas
    .map((texto) => String(texto || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAXIMO_DESCARTADAS);
  if (yaDichas.length) {
    lineas.push('Ya has escrito estas, escribe otras distintas:');
    lineas.push(...yaDichas.map((texto) => `  ${texto}`));
  }

  return { titulo: `Una felicitación para ${persona.nombre}`, lineas };
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

/**
 * Lo que se le cuenta al modelo para apuntar cosas de un sitio.
 *
 * Cuatro cosas: qué sitio, de qué clase se pide, **lo que ya hay apuntado ahí**
 * y quiénes son de casa. Lo tercero es lo que hace que sirva —sin ello repite lo
 * que ya está escrito—; lo cuarto no es para adivinar gustos, que sería
 * inventar, sino para el tono y para la edad de la casa: «llevar» cambia
 * bastante si el modelo sabe que en el viaje va una niña.
 *
 * Sale entero de la instantánea filtrada de quien pide, como los otros tres, así
 * que aquí no puede asomar nada que quien pregunta no pudiera ver ya.
 */
export function componerMaterialDeApunte(
  instantanea,
  { lugarId, clase = 'saber', descartadas = [] } = {},
) {
  const lugar = (instantanea.lugares || []).find((l) => l.id === lugarId);
  if (!lugar) return { titulo: '', lineas: [] };

  const COMO_SE_PIDE = {
    llevar: 'cosas que LLEVAR',
    hacer: 'cosas que HACER',
    ir: 'sitios a los que IR',
    saber: 'cosas que SABER',
  };

  const lineas = [
    `Sitio: ${lugar.nombre}`,
    `Te pido: ${COMO_SE_PIDE[clase] || COMO_SE_PIDE.saber}`,
  ];

  const bloque = (titulo, valores) => {
    const utiles = valores.filter(Boolean).slice(0, MAXIMO_POR_LISTA);
    if (utiles.length) lineas.push(`${titulo}:`, ...utiles.map((valor) => `  ${valor}`));
  };

  const suyos = (instantanea.apuntes || []).filter((a) => a.lugar_id === lugarId);
  bloque('Ya está apuntado ahí, de esta misma clase', suyos
    .filter((a) => (a.clase || 'saber') === clase)
    .map((a) => a.titulo));
  bloque('Y esto de otras clases, para que te hagas una idea del sitio', suyos
    .filter((a) => (a.clase || 'saber') !== clase)
    .map((a) => a.titulo));

  bloque('En casa son', (instantanea.personas || [])
    .filter((p) => (p.circulo || 'extendida') === 'familia')
    .map((p) => [p.nombre, p.parentesco, edadDe(p)].filter(Boolean).join(', ')));

  const yaDichas = descartadas
    .map((titulo) => String(titulo || '').trim())
    .filter(Boolean)
    .slice(0, MAXIMO_DESCARTADAS);
  if (yaDichas.length) {
    lineas.push('Ya has propuesto esto, no lo repitas ni propongas variantes suyas:');
    lineas.push(...yaDichas.map((titulo) => `  ${titulo}`));
  }

  return { titulo: `Apuntes para ${lugar.nombre}`, lineas };
}

/**
 * Los años que cumple en su próximo cumpleaños, contando hoy como suyo si hoy es.
 *
 * No es la edad de `edadDe`: el 25 de julio, quien nació el 1 de agosto de 2010
 * tiene 15 años cumplidos y **cumple 16**, y eso es lo que dice una felicitación.
 * Pasado su cumpleaños se habla ya del siguiente, que es cuando se vuelve a
 * escribir una.
 */
function aniosQueCumple(persona, hoy) {
  if (!persona.fecha_nacimiento) return null;
  const nacimiento = partes(persona.fecha_nacimiento);
  const referencia = partes(hoy || new Date().toISOString().slice(0, 10));
  if (!nacimiento.anio || !referencia.anio) return null;

  let anios = referencia.anio - nacimiento.anio;
  const yaPaso = referencia.mes > nacimiento.mes
    || (referencia.mes === nacimiento.mes && referencia.dia > nacimiento.dia);
  if (yaPaso) anios += 1;
  return anios > 0 && anios < 130 ? anios : null;
}

// ----------------------------------------------------------------- Llamada --

async function intentar({ clave, modelo, instruccion, material, tope, buscar }) {
  const arranque = Date.now();
  const cuerpo = {
    model: modelo,
    max_tokens: tope || TOPE_DE_SALIDA,
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
export async function redactar({ configuracion, material, instruccion, tope, buscar = fetch }) {
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
        tope,
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

/**
 * Las cinco propuestas, sacadas del texto que devuelve el modelo.
 *
 * Se le pide una línea por propuesta, numerada, con el regalo y el porqué
 * separados por una raya. Se interpreta con la manga ancha que conviene a algo
 * escrito por un modelo: sirve cualquier numeración, cualquiera de las tres
 * rayas o los dos puntos, y una línea sin separador vale igual —queda el regalo
 * y se pierde el porqué, que es lo prescindible—.
 *
 * Interpretar aquí y no en el teléfono no es un capricho: así el cliente recibe
 * una lista, y el formato de la respuesta se prueba en las pruebas del Worker,
 * que es donde se sabe qué se le pidió al modelo.
 */
export function interpretarPropuestas(texto, cuantas = PROPUESTAS_POR_TANDA) {
  const propuestas = [];

  for (const cruda of String(texto || '').split('\n')) {
    const linea = cruda.replace(/^\s*(?:\d+\s*[.)\-—–:]?|[-*•])\s*/, '').trim();
    if (!linea) continue;

    const corte = linea.match(/\s+[—–-]\s+|:\s+/);
    const que = (corte ? linea.slice(0, corte.index) : linea).replace(/^[«"']|[»"'.]$/g, '').trim();
    const porque = corte ? linea.slice(corte.index + corte[0].length).trim() : '';
    if (!que) continue;

    propuestas.push({ que, porque });
    if (propuestas.length >= cuantas) break;
  }

  return propuestas;
}

/**
 * Las cinco felicitaciones, que son cinco textos enteros y no un par de campos.
 *
 * Aquí no se parte la línea por la raya: una felicitación lleva rayas, comas y
 * signos dentro, y cortarla por la primera dejaría media. Se le quita la
 * numeración y las comillas **cuando envuelven la línea entera**, y lo demás se
 * conserva tal cual —emojis y puntuación final incluidos—, porque se va a pegar
 * en un WhatsApp. Una comilla suelta a media frase se queda: es más probable que
 * sea una cita dentro del texto que un adorno del modelo.
 *
 * La numeración exige separador, a diferencia de la de los regalos: sin él,
 * «16 años y sigues igual 🎉» perdería los años al confundirlos con un número de
 * lista.
 */
export function interpretarFelicitaciones(texto, cuantas = PROPUESTAS_POR_TANDA) {
  const felicitaciones = [];

  for (const cruda of String(texto || '').split('\n')) {
    const linea = cruda
      .replace(/^\s*(?:\d+\s*[.)\-—–:]|[-*•])\s*/, '')
      .trim()
      .replace(/^[«"'](.*)[»"']$/, '$1')
      .trim();
    if (!linea) continue;

    felicitaciones.push(linea);
    if (felicitaciones.length >= cuantas) break;
  }

  return felicitaciones;
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
