/**
 * Lo que Claude puede hacer con la agenda: consultar y apuntar, como quien tiene la aplicación abierta.
 *
 * Son las herramientas que sirve el punto MCP (`mcp/protocolo.js`), y cada una
 * trabaja **como la persona dueña del enlace**: lee de su instantánea —la misma
 * que recibiría su teléfono, ya recortada por `componerInstantanea`— y escribe
 * por `aplicarCambio`, con sus mismos permisos. Lo que la aplicación oculta a
 * alguien no puede salir por aquí, y lo que no podría apuntar desde el teléfono
 * no puede entrar.
 *
 * **Se escribe lo mismo que escribe la pantalla**: un evento con los campos del
 * formulario de «Nuevo evento», una idea con sus orientaciones —o un deseo si es
 * para uno mismo, como hace Regalos—, un apunte de Sitios con su clase, una noche
 * de Cenas enlazada al recetario si el plato está en él. Lo apuntado desde una
 * conversación no se distingue en nada de lo apuntado a mano.
 *
 * **Y se lee con las piezas que ya cuentan un día al modelo** de la redacción
 * (`lineaDe`, `lineaDeLio`) y con la expansión de repeticiones de los
 * recordatorios (`arranquesEntre`, `derivadosDe`): quién lleva y quién recoge, la
 * hora de cada día de una actividad, el turno de Lío con las ausencias. Una
 * tercera copia de esas reglas es justo lo que no se quería.
 *
 * Las respuestas son texto para un modelo, con las fechas en palabras. Lo que
 * Claude haya calculado —qué día es «el miércoles que viene»— vuelve escrito en
 * la confirmación, para que quien lo pidió vea si era ese. Y apuntar dos veces lo
 * mismo no lo duplica: una conversación repite una llamada con más facilidad que
 * una mano repite un toque.
 */

import { Rechazo } from './portero/errores.js';
import { arranquesEntre, derivadosDe } from './recordatorios.js';
import {
  edadDe, formatearFecha, formatearRango, lineaDe, lineaDeLio, nombreCorto, platoDe,
} from './redaccion.js';
import { esDeLaCasa } from './lio.js';
import { visible } from './visibilidad.js';
import { idCena } from './cenas.js';
import { TOPE_DE_MEJORA } from './repositorio.js';

/** Cómo se presenta este servidor en la lista de conectores de Claude. */
export const SERVIDOR = { name: 'agenda-familiar', title: 'Agenda de casa', version: '1.0.0' };

/** Lo más que se consulta de una vez: un mes cabe, un año no se lee. */
const MAXIMO_DIAS = 31;
/** Hasta aquí se cuentan también, cada día, Lío y la cena. */
const DIAS_CON_TODO = 7;
const TOPE_DE_TITULO = 200;
const TOPE_DE_TEXTO = 2000;

/** Las clases de un apunte, espejo de `pwa/publico/js/sitios.js`. */
const CLASES = { llevar: 'Llevar', hacer: 'Hacer', ir: 'Ir', saber: 'Saber' };
const CLASE_POR_DEFECTO = 'saber';

const REPETICIONES = { ninguna: null, semanal: 'cada semana', mensual: 'cada mes', anual: 'cada año' };

/** Los tipos que el formulario de un evento puntual no ofrece, porque tienen
 *  plugin propio (`TIPOS_DE_OTROS_PLUGINS` en `vistas/plugins.js`). */
const TIPOS_DE_OTROS_PLUGINS = ['cumpleanos', 'santo', 'viaje', 'recurrente'];

const ROTULO_DE_CIRCULO = { familia: 'Familia, en casa', extendida: 'Familia extendida', amigos: 'Amigos' };
const ESTADO_DE_REGALO = { pendiente: 'por comprar', comprado: 'listo', envuelto: 'listo', entregado: 'entregado' };

/** Lo que significa «para mí» dicho por quien habla. */
const AUTORREFERENCIAS = new Set(['yo', 'mi', 'me', 'para mi', 'a mi']);

/** Lo que se le dice al cliente de cada herramienta: si solo lee, si puede
 *  pisar algo y si repetirla con lo mismo cambia algo. Apuntar es idempotente
 *  porque lo ya apuntado no se repite; solo la cena puede sustituir lo que había. */
const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const SUSTITUYE = { ...ESCRITURA, destructiveHint: true };

// ------------------------------------------------------------- Utilidades --

const activo = (fila) => fila && fila.activo !== false && fila.activo !== 0 && fila.activa !== false && fila.activa !== 0;

const normalizar = (valor) => String(valor ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function esFecha(texto) {
  if (!FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const sumarDias = (iso, dias) => new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);

/** «miércoles 14 de Octubre de 2026», con el año: una confirmación no puede dejarlo a la imaginación. */
const conAnio = (iso) => `${formatearFecha(iso)} de ${iso.slice(0, 4)}`;

function cuandoEs(fecha, hoy) {
  const dias = diasEntre(hoy, fecha);
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `dentro de ${dias} días` : `hace ${-dias} días`;
}

function fechaDe(valor, campo) {
  const texto = String(valor ?? '').trim();
  if (!esFecha(texto)) throw new Rechazo(`«${campo}» tiene que ser una fecha AAAA-MM-DD; llegó «${texto}»`);
  return texto;
}

function horaDe(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  const partes = /^(\d{1,2}):(\d{2})$/.exec(texto);
  if (!partes || Number(partes[1]) > 23 || Number(partes[2]) > 59) {
    throw new Rechazo(`«hora» tiene que ser HH:MM; llegó «${texto}»`);
  }
  return `${partes[1].padStart(2, '0')}:${partes[2]}`;
}

/** Un título: una línea, sin espacios de más y con tope. */
function tituloDe(valor, campo, tope = TOPE_DE_TITULO) {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (!texto) throw new Rechazo(`falta «${campo}»`);
  if (texto.length > tope) throw new Rechazo(`«${campo}» son ${tope} caracteres como mucho`);
  return texto;
}

/** Un texto opcional de varias líneas, o vacío. */
function textoDe(valor, campo, tope = TOPE_DE_TEXTO) {
  const texto = String(valor ?? '').trim();
  if (texto.length > tope) throw new Rechazo(`«${campo}» son ${tope} caracteres como mucho`);
  return texto;
}

/** Una lista de nombres, venga como lista o como un nombre suelto. */
const listaDe = (valor) => (Array.isArray(valor) ? valor : valor ? [valor] : [])
  .map((nombre) => String(nombre ?? '').trim())
  .filter(Boolean);

const enumerar = (nombres) => (nombres.length < 2
  ? nombres.join('')
  : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`);

const EMOJI_INICIAL = /^(\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier}|‍\p{Extended_Pictographic})*)\s*/u;

/** El emoji con el que empieza un nombre y lo demás, como `partirEmoji` en la aplicación. */
function partirEmoji(texto) {
  const entero = String(texto || '').trim();
  const hallado = entero.match(EMOJI_INICIAL);
  if (!hallado) return { emoji: null, resto: entero };
  return { emoji: hallado[1], resto: entero.slice(hallado[0].length).trim() || entero };
}

const importe = (valor) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(valor)} €`;

// ------------------------------------------------------ Personas y sitios --

const personasDe = (instantanea) => (instantanea.personas || []).filter(activo);

function nombreEntero(persona) {
  const nombre = [persona.nombre, persona.apellidos].filter(Boolean).join(' ');
  return persona.apodo ? `${nombre} («${persona.apodo}»)` : nombre;
}

/**
 * A quién se refiere un nombre dicho en una conversación.
 *
 * De lo más estricto a lo más suelto —el nombre o el apodo enteros, una palabra
 * del nombre, el principio—, y en cuanto un criterio da a alguien se para: si
 * da a dos, se pregunta en vez de elegir. Apuntar una idea para la Ana que no era
 * se la enseñaría justo a quien no debía verla.
 */
function buscarPersona(instantanea, dicho, yoId) {
  const buscado = normalizar(dicho);
  if (!buscado) throw new Rechazo('falta a quién');
  const personas = personasDe(instantanea);

  if (AUTORREFERENCIAS.has(buscado)) {
    const yo = personas.find((p) => p.id === yoId);
    if (yo) return yo;
  }

  const formas = (p) => [p.nombre, p.apodo, [p.nombre, p.apellidos].filter(Boolean).join(' ')]
    .filter(Boolean).map(normalizar);
  const criterios = [
    (p) => formas(p).includes(buscado),
    (p) => formas(p).some((forma) => forma.split(' ').includes(buscado)),
    (p) => formas(p).some((forma) => forma.startsWith(buscado)),
  ];
  for (const criterio of criterios) {
    const halladas = personas.filter(criterio);
    if (halladas.length === 1) return halladas[0];
    if (halladas.length > 1) {
      throw new Rechazo(`«${dicho}» puede ser ${enumerar(halladas.map(nombreEntero))}: pregunta cuál.`);
    }
  }
  const conocidas = personas.slice(0, 25).map((p) => p.apodo || p.nombre);
  throw new Rechazo(
    `No hay nadie que se llame «${dicho}» en la agenda. Están: ${conocidas.join(', ')}`
    + `${personas.length > conocidas.length ? '…' : ''}. ver_gente los da todos.`,
  );
}

const nombreDeLugar = (lugar) => [lugar.emoji, lugar.nombre].filter(Boolean).join(' ');

/** El sitio que se nombra, o `null` si no hay ninguno; si hay dos, se pregunta. */
function buscarSitio(instantanea, dicho) {
  const buscado = normalizar(partirEmoji(dicho).resto);
  if (!buscado) throw new Rechazo('falta el sitio');
  const lugares = (instantanea.lugares || []).filter(activo);
  const criterios = [
    (l) => normalizar(l.nombre) === buscado,
    (l) => normalizar(l.nombre).split(' ').includes(buscado),
    (l) => normalizar(l.nombre).startsWith(buscado) || normalizar(l.nombre).includes(buscado),
  ];
  for (const criterio of criterios) {
    const hallados = lugares.filter(criterio);
    if (hallados.length === 1) return hallados[0];
    if (hallados.length > 1) {
      throw new Rechazo(`«${dicho}» puede ser ${enumerar(hallados.map(nombreDeLugar))}: pregunta cuál.`);
    }
  }
  return null;
}

/** La receta del recetario que se llama así, sin mirar mayúsculas, como en Cenas. */
function recetaPorNombre(instantanea, nombre) {
  const buscado = String(nombre || '').trim().toLocaleLowerCase('es');
  if (!buscado) return null;
  return (instantanea.recetas || [])
    .filter(activo)
    .find((r) => String(r.nombre || '').trim().toLocaleLowerCase('es') === buscado) || null;
}

// -------------------------------------------------------- La agenda --

/** Quiénes son los protagonistas de un evento, por su nombre corto. */
function deQuienEs(evento, instantanea) {
  return (evento.participantes || [])
    .filter((p) => p.rol === 'protagonista')
    .map((p) => nombreCorto(instantanea, p.persona_id))
    .filter(Boolean);
}

/** El dueño de un calendario importado: un vuelo es de alguien. */
function duenoDe(evento, instantanea) {
  const calendario = (instantanea.calendarios_externos || []).find((c) => c.id === evento.calendario_id);
  return calendario?.persona_id ? nombreCorto(instantanea, calendario.persona_id) : null;
}

/**
 * Una línea de un evento en un día. La base es la que ya se le cuenta al modelo
 * de la redacción, y aquí se le añade lo que en una consulta hace falta y en un
 * resumen sobraba: de quién es, hasta cuándo dura y si ese día se ha cancelado.
 */
function lineaDelEvento(evento, instantanea, dia, { sigue, ultimo, cancelado }) {
  if (sigue) return `todo el día · ${evento.titulo} (cont.)`;
  const partes = [lineaDe(evento, instantanea, dia)];

  if (String(evento.id).startsWith('derivado:cumpleanos:')) {
    const anios = Number(dia.slice(0, 4)) - Number(String(evento.inicio).slice(0, 4));
    if (anios > 0 && anios < 120) partes.push(`cumple ${anios}`);
  }
  const de = evento.plugin_id === 'finde' ? [] : deQuienEs(evento, instantanea);
  if (de.length) partes.push(`de ${enumerar(de)}`);
  if (evento.origen === 'importado') {
    const dueno = duenoDe(evento, instantanea);
    if (dueno) partes.push(`de ${dueno}`);
  }
  if (ultimo) partes.push(`hasta el ${formatearFecha(ultimo)}`);
  if (cancelado) partes.push('este día no hay');
  return partes.join(' · ');
}

/**
 * Lo que hay cada día entre dos fechas, ya en líneas y en orden.
 *
 * Las repeticiones se expanden con `arranquesEntre`, la misma que usa el aviso
 * previo; lo que dura varios días sale en todos, con «(cont.)» detrás del primero,
 * como en la semana. Los cumpleaños y los santos se derivan de las fichas con el
 * círculo de su plugin, y quien está fuera es una línea en cada día de su
 * ausencia.
 */
function repartirPorDias(instantanea, desde, hasta) {
  const porDia = new Map();
  const poner = (dia, linea) => {
    if (!porDia.has(dia)) porDia.set(dia, []);
    // Un mismo feed enganchado dos veces trae el vuelo dos veces: la línea
    // idéntica no dice nada nuevo.
    if (!porDia.get(dia).includes(linea)) porDia.get(dia).push(linea);
  };

  const cancelados = new Set((instantanea.dias_evento || [])
    .filter((d) => d.cancelado && activo(d))
    .map((d) => `${d.evento_id}:${d.fecha}`));

  const eventos = [...(instantanea.eventos || []).filter(activo), ...derivadosDe(instantanea)];
  for (const evento of eventos) {
    const primero = String(evento.inicio || '').slice(0, 10);
    if (!esFecha(primero)) continue;
    const ultimo = evento.fin && esFecha(String(evento.fin).slice(0, 10)) ? String(evento.fin).slice(0, 10) : primero;
    const dura = Math.max(0, diasEntre(primero, ultimo));
    for (const arranque of arranquesEntre(evento, sumarDias(desde, -dura), hasta)) {
      for (let paso = 0; paso <= dura; paso += 1) {
        const dia = sumarDias(arranque, paso);
        if (dia < desde || dia > hasta) continue;
        poner(dia, lineaDelEvento(evento, instantanea, dia, {
          sigue: paso > 0,
          ultimo: dura ? sumarDias(arranque, dura) : null,
          cancelado: cancelados.has(`${evento.id}:${dia}`),
        }));
      }
    }
  }

  for (const ausencia of (instantanea.ausencias || []).filter(activo)) {
    const quien = nombreCorto(instantanea, ausencia.persona_id);
    if (!quien || !esFecha(String(ausencia.desde))) continue;
    const cubre = ausencia.cubre_id ? nombreCorto(instantanea, ausencia.cubre_id) : null;
    const linea = ['todo el día', `${quien} fuera de casa`, ausencia.motivo || null, cubre ? `cubre ${cubre}` : null]
      .filter(Boolean).join(' · ');
    const hastaAusencia = esFecha(String(ausencia.hasta || '')) ? ausencia.hasta : ausencia.desde;
    for (let dia = ausencia.desde > desde ? ausencia.desde : desde; dia <= hasta && dia <= hastaAusencia; dia = sumarDias(dia, 1)) {
      poner(dia, linea);
    }
  }

  // Lo que dura el día entero va delante, y lo demás por su hora: las líneas
  // empiezan por «HH:MM ·», así que ordenarlas por ese principio basta.
  const clave = (linea) => (linea.startsWith('todo el día') ? '' : linea.slice(0, 5));
  for (const lineas of porDia.values()) lineas.sort((a, b) => clave(a).localeCompare(clave(b)));
  return porDia;
}

function lineaDeCena(instantanea, dia) {
  const cena = (instantanea.cenas || []).find((c) => c.fecha === dia && activo(c));
  const plato = cena ? platoDe(instantanea, cena.receta_id, cena.texto) : null;
  if (!plato) return null;
  const ninas = platoDe(instantanea, cena.ninas_receta_id, cena.ninas_texto);
  return `Cena: ${plato}${ninas ? ` (las niñas: ${ninas})` : ''}`;
}

async function verAgenda(argumentos, { leer, hoy }) {
  const desde = argumentos.desde ? fechaDe(argumentos.desde, 'desde') : hoy;
  const hasta = argumentos.hasta ? fechaDe(argumentos.hasta, 'hasta') : sumarDias(desde, 6);
  if (hasta < desde) throw new Rechazo('«hasta» no puede ir antes de «desde»');
  const dias = diasEntre(desde, hasta) + 1;
  if (dias > MAXIMO_DIAS) throw new Rechazo(`como mucho ${MAXIMO_DIAS} días de una vez; pide el resto en otra consulta`);

  const instantanea = await leer();
  const porDia = repartirPorDias(instantanea, desde, hasta);
  const conTodo = dias <= DIAS_CON_TODO;
  const deCasa = Boolean(instantanea.cenas) || (instantanea.lio_cuadro || []).length > 0;

  const tramo = desde === hasta ? `del ${conAnio(desde)}` : formatearRango(desde, hasta);
  const lineas = [`Hoy es ${conAnio(hoy)} (hora de Madrid).`, `Agenda ${tramo}:`];
  let hayAlgo = false;
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    const cosas = porDia.get(dia) || [];
    // Lío y la cena, cada día en una semana; en un tramo más largo, solo en
    // los días que tienen algo más, que son los que se quieren leer.
    const extras = conTodo || cosas.length
      ? [lineaDeLio(instantanea, dia), lineaDeCena(instantanea, dia)].filter(Boolean)
      : [];
    if (!conTodo && !cosas.length) continue;
    hayAlgo = hayAlgo || cosas.length > 0;
    lineas.push('', `${formatearFecha(dia)}${dia === hoy ? ' (hoy)' : ''}`);
    if (!cosas.length) lineas.push('  Nada apuntado.');
    lineas.push(...cosas.map((linea) => `  ${linea}`), ...extras.map((linea) => `  ${linea}`));
  }
  if (!conTodo && !hayAlgo) lineas.push('', 'Nada apuntado en esas fechas.');
  if (!conTodo && deCasa) lineas.push('', 'Los turnos de Lío y la cena de cada noche salen día a día si se pide una semana o menos.');
  return lineas.join('\n');
}

// -------------------------------------------------------------- La gente --

/** «15 de Octubre», sin día de la semana: en un año bisiesto, para que el 29 de
 *  febrero de quien nació ese día también exista. */
const diaYMes = (mesDia) => {
  const [mes, dia] = mesDia.split('-').map(Number);
  return formatearFecha(`2000-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`).split(' ').slice(1).join(' ');
};

async function verGente(_argumentos, { leer, hoy, lector }) {
  const instantanea = await leer();
  const lineas = [];
  for (const [circulo, rotulo] of Object.entries(ROTULO_DE_CIRCULO)) {
    const suyas = personasDe(instantanea)
      .filter((p) => (p.circulo || 'extendida') === circulo)
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    if (!suyas.length) continue;
    if (lineas.length) lineas.push('');
    lineas.push(`${rotulo}:`);
    for (const persona of suyas) {
      const nacimiento = String(persona.fecha_nacimiento || '');
      const santo = String(persona.santo || '');
      lineas.push(`  ${[
        nombreEntero(persona) + (persona.id === lector.id ? ' (quien habla)' : ''),
        persona.parentesco || null,
        edadDe(persona, hoy),
        FECHA.test(nacimiento) ? `cumpleaños el ${diaYMes(nacimiento.slice(5))}` : null,
        /^\d{2}-\d{2}$/.test(santo) ? `santo el ${diaYMes(santo)}` : null,
      ].filter(Boolean).join(' · ')}`);
    }
  }
  return lineas.join('\n') || 'No hay nadie en la agenda.';
}

// ------------------------------------------------------------- Regalos --

function lineaDeIdea(idea, instantanea) {
  const precio = typeof idea.precio_max === 'number' ? `unos ${importe(idea.precio_max)}` : null;
  const descripcion = idea.descripcion ? String(idea.descripcion).replace(/\s+/g, ' ').slice(0, 160) : null;
  return [
    idea.titulo,
    descripcion,
    precio,
    idea.establecimiento ? `en ${idea.establecimiento}` : null,
    idea.enlace || null,
    idea.tipo === 'deseo' ? null : `apuntada por ${nombreCorto(instantanea, idea.autor_id) || 'alguien'}`,
  ].filter(Boolean).join(' — ');
}

function lineaDeRegalo(regalo, instantanea) {
  const idea = (instantanea.ideas || []).find((i) => i.id === regalo.idea_id);
  const ocasion = (instantanea.ocasiones || []).find((o) => o.id === regalo.ocasion_id);
  const responsable = regalo.responsable_id ? nombreCorto(instantanea, regalo.responsable_id) : null;
  return [
    idea?.titulo || 'Regalo',
    ESTADO_DE_REGALO[regalo.estado] || regalo.estado,
    responsable ? `se encarga ${responsable}` : 'sin nadie que se encargue',
    ocasion ? `${ocasion.nombre}${esFecha(String(ocasion.fecha || '')) ? `, ${conAnio(ocasion.fecha)}` : ''}` : null,
  ].filter(Boolean).join(' — ');
}

async function verRegalos(argumentos, { leer, lector }) {
  const instantanea = await leer();
  const para = argumentos.para ? buscarPersona(instantanea, argumentos.para, lector.id) : null;

  const ideas = (instantanea.ideas || []).filter((i) => activo(i) && i.estado === 'activa');
  const regalos = (instantanea.regalos || []).filter((r) => activo(r) && r.estado !== 'entregado');
  const orientadaA = (idea, personaId) => (idea.orientaciones || []).some((o) => o.persona_id === personaId);
  const esPara = (regalo, personaId) => regalo.destinatario_principal_id === personaId
    || (regalo.codestinatarios || []).includes(personaId);

  const bloqueDe = (persona) => {
    const pide = ideas.filter((i) => i.tipo === 'deseo' && orientadaA(i, persona.id));
    const suyas = ideas.filter((i) => i.tipo !== 'deseo' && orientadaA(i, persona.id));
    const enMarcha = regalos.filter((r) => esPara(r, persona.id));
    if (!pide.length && !suyas.length && !enMarcha.length) return null;
    return [
      `${persona.apodo || persona.nombre}:`,
      ...pide.map((i) => `  · Pide: ${lineaDeIdea(i, instantanea)}`),
      ...suyas.map((i) => `  · Idea: ${lineaDeIdea(i, instantanea)}`),
      ...enMarcha.map((r) => `  · Regalo: ${lineaDeRegalo(r, instantanea)}`),
    ].join('\n');
  };

  // Lo de uno mismo: lo que pide, y nada más. Lo que otros le preparan no
  // viaja a su cuenta, y aquí no se insinúa que exista.
  if (para && para.id === lector.id) {
    const pide = ideas.filter((i) => i.tipo === 'deseo' && i.autor_id === lector.id);
    return [
      pide.length ? 'Lo que has pedido:' : 'No has pedido nada todavía.',
      ...pide.map((i) => `  · ${lineaDeIdea(i, instantanea)}`),
      'Lo que otros te preparen no se enseña a tu cuenta, igual que en la aplicación.',
    ].join('\n');
  }

  if (para) return bloqueDe(para) || `Para ${para.apodo || para.nombre} no hay nada apuntado que puedas ver.`;

  const bloques = personasDe(instantanea).filter((p) => p.id !== lector.id).map(bloqueDe).filter(Boolean);
  const sinNadie = ideas.filter((i) => !(i.orientaciones || []).some((o) => o.persona_id));
  if (sinNadie.length) {
    bloques.push(['Para nadie en concreto:', ...sinNadie.map((i) => `  · Idea: ${lineaDeIdea(i, instantanea)}`)].join('\n'));
  }
  return bloques.length ? bloques.join('\n\n') : 'No hay ideas ni regalos apuntados que puedas ver.';
}

// -------------------------------------------------------------- Sitios --

function soloDeCasa(lector, que) {
  if (!esDeLaCasa(lector)) throw new Rechazo(`${que} es de quien vive en casa, y tu cuenta no lo tiene.`);
}

async function verSitios(argumentos, { leer, lector }) {
  soloDeCasa(lector, 'Sitios');
  const instantanea = await leer();
  const lugares = (instantanea.lugares || []).filter(activo);
  const apuntesDe = (lugarId) => (instantanea.apuntes || []).filter((a) => a.lugar_id === lugarId && activo(a));

  if (!argumentos.sitio) {
    if (!lugares.length) return 'Todavía no hay ningún sitio.';
    return ['Sitios:', ...lugares.map((lugar) => {
      const cuantos = Object.keys(CLASES)
        .map((clase) => [clase, apuntesDe(lugar.id).filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase).length])
        .filter(([, n]) => n)
        .map(([clase, n]) => `${n} ${clase}`);
      return `  ${nombreDeLugar(lugar)}${cuantos.length ? ` — ${cuantos.join(' · ')}` : ' — vacío'}`;
    })].join('\n');
  }

  const lugar = buscarSitio(instantanea, argumentos.sitio);
  if (!lugar) {
    throw new Rechazo(`No hay ningún sitio «${argumentos.sitio}». Los que hay: ${lugares.map(nombreDeLugar).join(', ') || 'ninguno'}.`);
  }
  const votos = (instantanea.votos || []).filter(activo);
  const lineas = [nombreDeLugar(lugar)];
  for (const [clase, rotulo] of Object.entries(CLASES)) {
    const apuntes = apuntesDe(lugar.id).filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase);
    if (!apuntes.length) continue;
    lineas.push('', `${rotulo}:`);
    for (const apunte of apuntes) {
      if (clase === 'llevar') {
        lineas.push(`  [${apunte.hecho === true || apunte.hecho === 1 ? 'x' : ' '}] ${apunte.titulo}`);
        continue;
      }
      const quienes = votos.filter((v) => v.apunte_id === apunte.id).map((v) => nombreCorto(instantanea, v.persona_id)).filter(Boolean);
      lineas.push(`  · ${[apunte.titulo, apunte.detalle || null, quienes.length ? `les apetece a ${enumerar(quienes)}` : null].filter(Boolean).join(' — ')}`);
    }
  }
  if (lineas.length === 1) lineas.push('', 'Todavía no hay nada apuntado.');
  return lineas.join('\n');
}

// ------------------------------------------------------------- Mejoras --

async function verMejoras(_argumentos, { leer }) {
  const instantanea = await leer();
  const hecha = (m) => m.hecho === true || m.hecho === 1;
  const mejoras = (instantanea.mejoras || []).filter(activo)
    .sort((a, b) => (hecha(a) === hecha(b)
      ? String(b.creado_en || '').localeCompare(String(a.creado_en || ''))
      : Number(hecha(a)) - Number(hecha(b))));
  if (!mejoras.length) return 'No hay mejoras apuntadas.';
  return mejoras.map((m) => {
    const quien = nombreCorto(instantanea, m.autor_id);
    const cuando = FECHA.test(String(m.creado_en || '').slice(0, 10)) ? conAnio(String(m.creado_en).slice(0, 10)) : null;
    return `[${hecha(m) ? 'x' : ' '}] ${String(m.texto).replace(/\s+/g, ' ')}${quien || cuando ? ` — ${[quien, cuando].filter(Boolean).join(', ')}` : ''}`;
  }).join('\n');
}

// -------------------------------------------------------------- Escribir --

/** Escribe un lote por el camino de siempre y falla con el motivo si algo no entra. */
async function escribir(contexto, cambios) {
  const marca = new Date().toISOString();
  const { resultados, registro } = await contexto.escribir(cambios.map((c) => ({ ...c, actualizado_en: marca })));
  const fallido = resultados.find((resultado) => !resultado.aplicado);
  if (fallido) throw new Rechazo(`No se ha podido apuntar: ${fallido.motivo || 'el servidor no lo ha aceptado'}`);
  return registro;
}

async function apuntarEvento(argumentos, contexto) {
  const { leer, lector, hoy } = contexto;
  const titulo = tituloDe(argumentos.titulo, 'titulo');
  const fecha = fechaDe(argumentos.fecha, 'fecha');
  const hora = horaDe(argumentos.hora);
  const hasta = argumentos.hasta ? fechaDe(argumentos.hasta, 'hasta') : null;
  if (hasta && hasta < fecha) throw new Rechazo('«hasta» no puede ir antes de «fecha»');
  const repeticion = argumentos.repeticion ? String(argumentos.repeticion) : 'ninguna';
  if (!(repeticion in REPETICIONES)) throw new Rechazo(`«repeticion» es una de: ${Object.keys(REPETICIONES).join(', ')}`);
  const donde = textoDe(argumentos.donde, 'donde', TOPE_DE_TITULO);
  const notas = textoDe(argumentos.notas, 'notas');

  const instantanea = await leer();
  const tipos = (instantanea.tipos_evento || []).filter((t) => !TIPOS_DE_OTROS_PLUGINS.includes(t.id));
  const tipo = tipos.find((t) => t.id === (argumentos.tipo || 'otro')) || (argumentos.tipo ? null : tipos[0]);
  if (!tipo) throw new Rechazo(`«tipo» es uno de: ${tipos.map((t) => t.id).join(', ')}`);

  const protagonistas = [...new Set(listaDe(argumentos.de_quien).map((n) => buscarPersona(instantanea, n, lector.id).id))];
  const asistentes = [...new Set(listaDe(argumentos.quien_va).map((n) => buscarPersona(instantanea, n, lector.id).id))]
    .filter((id) => !protagonistas.includes(id));

  const repetido = (instantanea.eventos || []).find((e) => activo(e) && e.origen === 'manual'
    && normalizar(e.titulo) === normalizar(titulo) && String(e.inicio).slice(0, 10) === fecha);
  if (repetido) return `Ya estaba apuntado «${repetido.titulo}» el ${conAnio(fecha)}: no lo he repetido.`;

  // Los mismos campos que el formulario de «Nuevo evento»: un «hasta» igual al
  // día se guarda sin fin, y el fin lleva la misma hora que el inicio.
  const fin = hasta && hasta > fecha ? (hora ? `${hasta}T${hora}:00` : hasta) : null;
  await escribir(contexto, [{
    tipo: 'evento',
    id: crypto.randomUUID(),
    campos: {
      titulo,
      tipo_id: tipo.id,
      inicio: hora ? `${fecha}T${hora}:00` : fecha,
      fin,
      jornada_completa: hora ? 0 : 1,
      ubicacion: donde,
      notas,
      repeticion,
      categoria_id: null,
      origen: 'manual',
      autor_id: lector.id,
      activo: 1,
      participantes: [
        ...protagonistas.map((persona_id) => ({ persona_id, rol: 'protagonista' })),
        ...asistentes.map((persona_id) => ({ persona_id, rol: 'asistente' })),
      ],
    },
  }]);

  const nombres = (ids) => enumerar(ids.map((id) => nombreCorto(instantanea, id)));
  return [
    `Apuntado en la agenda: «${titulo}».`,
    `Cuándo: ${conAnio(fecha)} (${cuandoEs(fecha, hoy)}), ${hora ? `a las ${hora}` : 'todo el día'}`
      + `${fin ? `, hasta el ${conAnio(hasta)}` : ''}${REPETICIONES[repeticion] ? `, ${REPETICIONES[repeticion]}` : ''}.`,
    `Qué es: ${tipo.emoji} ${tipo.nombre}.`,
    donde ? `Dónde: ${donde}.` : null,
    protagonistas.length ? `De: ${nombres(protagonistas)}.` : null,
    asistentes.length ? `Van también: ${nombres(asistentes)}.` : null,
  ].filter(Boolean).join('\n');
}

async function apuntarIdea(argumentos, contexto) {
  const { leer, lector } = contexto;
  const titulo = tituloDe(argumentos.titulo, 'titulo');
  const dichos = listaDe(argumentos.para);
  if (!dichos.length) throw new Rechazo('falta «para»: a quién es la idea');
  const descripcion = textoDe(argumentos.descripcion, 'descripcion');
  const establecimiento = textoDe(argumentos.donde_se_compra, 'donde_se_compra', TOPE_DE_TITULO);
  const enlace = textoDe(argumentos.enlace, 'enlace', 1000);
  const precio = argumentos.precio === undefined || argumentos.precio === null || argumentos.precio === ''
    ? null : Number(argumentos.precio);
  if (precio !== null && !(Number.isFinite(precio) && precio >= 0)) throw new Rechazo('«precio» es un número de euros');

  const instantanea = await leer();
  const destinatarios = [...new Map(dichos.map((n) => {
    const persona = buscarPersona(instantanea, n, lector.id);
    return [persona.id, persona];
  })).values()];
  // Lo que se apunta para uno mismo y para nadie más es un deseo, como en la
  // pantalla: como idea, la ocultación se la quitaría de delante en el acto.
  const deseo = destinatarios.length === 1 && destinatarios[0].id === lector.id;
  const ids = destinatarios.map((p) => p.id).sort();

  const repetida = (instantanea.ideas || []).find((i) => activo(i) && ['activa', 'en_curso'].includes(i.estado)
    && normalizar(i.titulo) === normalizar(titulo)
    && JSON.stringify((i.orientaciones || []).map((o) => o.persona_id).filter(Boolean).sort()) === JSON.stringify(ids));
  if (repetida) return `Ya estaba apuntada «${repetida.titulo}» para ${enumerar(destinatarios.map((p) => p.apodo || p.nombre))}: no la he repetido.`;

  const id = crypto.randomUUID();
  const registro = await escribir(contexto, [{
    tipo: 'idea',
    id,
    campos: {
      titulo,
      descripcion,
      categoria_id: null,
      precio_max: precio,
      establecimiento,
      enlace,
      // «También las niñas» solo lo escribe quien administra, como en la pantalla.
      ...(lector.rol === 'administrador' ? { para_todos: argumentos.para_todos === true && !deseo ? 1 : 0 } : {}),
      orientaciones: destinatarios.map((p) => ({ persona_id: p.id })),
      tipo: deseo ? 'deseo' : 'sugerencia',
      estado: 'activa',
      autor_id: lector.id,
      activa: 1,
    },
  }]);

  // Quién la ve, contado con la misma función que decide qué viaja a cada
  // teléfono: así la respuesta no puede prometer una ocultación que no hay.
  const idea = (registro.ideas || []).find((i) => i.id === id);
  const conCuenta = (registro.personas || []).filter((p) => p.tiene_cuenta && activo(p));
  const nombre = (p) => p.apodo || p.nombre;
  const laVen = idea ? conCuenta.filter((p) => visible(registro, idea, 'idea', p)).map(nombre) : [];
  const noLaVen = idea ? conCuenta.filter((p) => !visible(registro, idea, 'idea', p)).map(nombre) : [];

  if (deseo) {
    return `Apuntado en tus deseos: «${titulo}». Lo ven ${enumerar(laVen) || 'solo tú'}; a ti no se te dirá si alguien lo coge.`;
  }
  return [
    `Idea apuntada para ${enumerar(destinatarios.map(nombre))}: «${titulo}»${precio !== null ? `, unos ${importe(precio)}` : ''}.`,
    `La ven: ${enumerar(laVen) || 'nadie más que tú'}.`,
    noLaVen.length ? `Oculta para: ${enumerar(noLaVen)}.` : null,
  ].filter(Boolean).join('\n');
}

async function apuntarEnSitio(argumentos, contexto) {
  const { leer, lector } = contexto;
  soloDeCasa(lector, 'Sitios');
  const titulo = tituloDe(argumentos.titulo, 'titulo');
  const clase = argumentos.clase ? normalizar(argumentos.clase) : CLASE_POR_DEFECTO;
  if (!(clase in CLASES)) throw new Rechazo(`«clase» es una de: ${Object.keys(CLASES).join(', ')}`);
  // En una lista de la compra no hay dónde leer un detalle: no se guarda.
  const detalle = clase === 'llevar' ? '' : textoDe(argumentos.detalle, 'detalle');

  const instantanea = await leer();
  let lugar = buscarSitio(instantanea, argumentos.sitio);
  const cambios = [];
  if (!lugar) {
    const lugares = (instantanea.lugares || []).filter(activo).map(nombreDeLugar);
    if (argumentos.crear_sitio !== true) {
      throw new Rechazo(
        `No hay ningún sitio «${argumentos.sitio}». Los que hay: ${lugares.join(', ') || 'ninguno'}. `
        + 'Si es uno nuevo, pregunta antes y vuelve a llamar con crear_sitio: true.',
      );
    }
    const { emoji, resto } = partirEmoji(tituloDe(argumentos.sitio, 'sitio', 80));
    lugar = { id: crypto.randomUUID(), nombre: resto, emoji };
    cambios.push({ tipo: 'lugar', id: lugar.id, campos: { nombre: resto, emoji, autor_id: lector.id, activo: 1 } });
  }

  const repetido = (instantanea.apuntes || []).find((a) => activo(a) && a.lugar_id === lugar.id
    && (a.clase || CLASE_POR_DEFECTO) === clase && normalizar(a.titulo) === normalizar(titulo)
    && !(a.hecho === true || a.hecho === 1));
  if (repetido) return `Ya estaba apuntado en ${nombreDeLugar(lugar)} › ${CLASES[clase]}: «${repetido.titulo}». No lo he repetido.`;

  cambios.push({
    tipo: 'apunte',
    id: crypto.randomUUID(),
    campos: { lugar_id: lugar.id, clase, titulo, detalle: detalle || null, autor_id: lector.id, activo: 1 },
  });
  await escribir(contexto, cambios);
  return `Apuntado en ${nombreDeLugar(lugar)} › ${CLASES[clase]}: «${titulo}».`
    + `${cambios.length > 1 ? ` ${nombreDeLugar(lugar)} es un sitio nuevo.` : ''}`;
}

async function apuntarCena(argumentos, contexto) {
  const { leer, lector, hoy } = contexto;
  soloDeCasa(lector, 'Cenas');
  const fecha = fechaDe(argumentos.fecha, 'fecha');
  const plato = tituloDe(argumentos.plato, 'plato', 120);
  const ninas = argumentos.ninas ? tituloDe(argumentos.ninas, 'ninas', 120) : null;

  const instantanea = await leer();
  const anterior = (instantanea.cenas || []).find((c) => c.fecha === fecha && activo(c)) || null;
  const antes = anterior ? platoDe(instantanea, anterior.receta_id, anterior.texto) : null;
  const receta = recetaPorNombre(instantanea, plato);
  const nuevo = receta?.nombre || plato;
  const cambia = Boolean(antes) && normalizar(antes) !== normalizar(nuevo);
  if (cambia && argumentos.reemplazar !== true) {
    throw new Rechazo(`El ${conAnio(fecha)} ya hay apuntado «${antes}». Para cambiarlo, pregunta antes y vuelve a llamar con reemplazar: true.`);
  }

  // Lo mismo que `escribirNoche` en la aplicación: el plato del recetario se
  // enlaza, cambiar de plato borra el veredicto del anterior, y lo de las niñas
  // solo se toca si se dice. Una noche que no estaba empieza limpia.
  const campos = {
    fecha, receta_id: receta?.id || null, texto: receta ? null : plato, autor_id: anterior?.autor_id || lector.id, activo: 1,
  };
  if (!anterior || cambia) campos.veredicto = null;
  if (ninas) {
    const deLasNinas = recetaPorNombre(instantanea, ninas);
    campos.ninas_receta_id = deLasNinas?.id || null;
    campos.ninas_texto = deLasNinas ? null : ninas;
  } else if (!anterior) {
    campos.ninas_receta_id = null;
    campos.ninas_texto = null;
  }
  await escribir(contexto, [{ tipo: 'cena', id: idCena(fecha), campos }]);

  return [
    `Cena del ${conAnio(fecha)} (${cuandoEs(fecha, hoy)}): ${nuevo}${ninas ? `; las niñas, ${ninas}` : ''}.`,
    receta ? 'Es una receta del recetario.' : null,
    cambia ? `Sustituye a «${antes}».` : null,
  ].filter(Boolean).join(' ');
}

async function apuntarMejora(argumentos, contexto) {
  const { leer, lector } = contexto;
  const texto = textoDe(argumentos.texto, 'texto', TOPE_DE_MEJORA);
  if (!texto) throw new Rechazo('falta «texto»');
  const instantanea = await leer();
  const repetida = (instantanea.mejoras || []).find((m) => activo(m) && normalizar(m.texto) === normalizar(texto));
  if (repetida) return 'Esa mejora ya estaba apuntada: no la he repetido.';
  await escribir(contexto, [{ tipo: 'mejora', id: crypto.randomUUID(), campos: { texto, autor_id: lector.id, activo: 1 } }]);
  return 'Mejora apuntada. La ve toda la casa en Ajustes › Mejoras.';
}

// ------------------------------------------------------- Las herramientas --

const cadena = (descripcion) => ({ type: 'string', description: descripcion });
const fechaEn = (descripcion) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: descripcion });
const nombres = (descripcion) => ({ type: 'array', items: { type: 'string' }, description: descripcion });

/**
 * Las herramientas para una persona. `contexto` lleva quién es (`lector`), qué
 * día es en casa (`hoy`), cómo leer su instantánea (`leer`) y cómo escribir un
 * lote (`escribir`, que devuelve `{ resultados, registro }`).
 */
export function herramientasDe(contexto) {
  const con = (hacer) => (argumentos) => hacer(argumentos || {}, contexto);
  return [
    {
      nombre: 'ver_agenda',
      titulo: 'Ver la agenda',
      descripcion: 'Lo que hay en la agenda de casa entre dos fechas: eventos, actividades que se repiten '
        + '(con quién lleva y quién recoge), cumpleaños y santos, quién está fuera y, para quien vive en casa, '
        + 'los turnos de Lío (el perro) y la cena de cada noche. Empieza diciendo qué día es hoy en Madrid. '
        + `Sin fechas, los siete días desde hoy; como mucho ${MAXIMO_DIAS} días de una vez.`,
      entrada: {
        type: 'object',
        properties: {
          desde: fechaEn('Primer día, AAAA-MM-DD. Por defecto, hoy.'),
          hasta: fechaEn('Último día incluido, AAAA-MM-DD. Por defecto, seis días después de «desde».'),
        },
        additionalProperties: false,
      },
      anotaciones: LECTURA,
      hacer: con(verAgenda),
    },
    {
      nombre: 'ver_gente',
      titulo: 'Ver la gente',
      descripcion: 'Las personas de la agenda por círculos (familia en casa, familia extendida, amigos): '
        + 'nombre, cómo se le llama en casa, parentesco, edad, cumpleaños y santo. Sirve para saber a quién '
        + 'se refiere un nombre antes de apuntar algo para alguien.',
      entrada: { type: 'object', properties: {}, additionalProperties: false },
      anotaciones: LECTURA,
      hacer: con(verGente),
    },
    {
      nombre: 'ver_regalos',
      titulo: 'Ver ideas y regalos',
      descripcion: 'Ideas de regalo, lo que cada uno ha pedido (deseos) y los regalos en marcha, por persona. '
        + 'Solo lo que la cuenta de quien pregunta puede ver: lo que se prepara para ella no sale nunca, como en '
        + 'la aplicación. Con «para», solo esa persona.',
      entrada: {
        type: 'object',
        properties: { para: cadena('Nombre de la persona, si se pregunta por una (p. ej. «Ana»).') },
        additionalProperties: false,
      },
      anotaciones: LECTURA,
      hacer: con(verRegalos),
    },
    {
      nombre: 'ver_sitios',
      titulo: 'Ver los sitios',
      descripcion: 'Sitios: lo que la casa sabe de un lugar (un pueblo, una ciudad, una casa…), con sus apuntes '
        + 'en cuatro clases: llevar (lista de lo que hay que llevar, con [x] lo ya metido), hacer, ir y saber. '
        + 'Sin «sitio», la lista de sitios. Solo para quien vive en casa.',
      entrada: {
        type: 'object',
        properties: { sitio: cadena('Nombre del sitio (p. ej. «Llivia»). Sin él, la lista de sitios.') },
        additionalProperties: false,
      },
      anotaciones: LECTURA,
      hacer: con(verSitios),
    },
    {
      nombre: 'ver_mejoras',
      titulo: 'Ver las mejoras',
      descripcion: 'Las mejoras apuntadas sobre la propia aplicación (ideas para cambiarla), con [x] las ya '
        + 'hechas y las pendientes primero.',
      entrada: { type: 'object', properties: {}, additionalProperties: false },
      anotaciones: LECTURA,
      hacer: con(verMejoras),
    },
    {
      nombre: 'apuntar_evento',
      titulo: 'Apuntar un evento',
      descripcion: 'Apunta un evento en la agenda de casa, como «Nuevo evento» en la aplicación. Ejemplo: '
        + '«el miércoles que viene, médico de Lío» → titulo «Médico de Lío», fecha la de ese miércoles, '
        + 'tipo cita_medica. Calcula tú la fecha en hora de Madrid; la respuesta la devuelve en palabras para '
        + 'que la confirmes. Si ese día ya hay uno con el mismo título, no lo repite.',
      entrada: {
        type: 'object',
        properties: {
          titulo: cadena('Qué es, como se diría en casa: «Médico de Lío». Puede empezar por un emoji.'),
          fecha: fechaEn('El día, AAAA-MM-DD.'),
          hora: { type: 'string', pattern: '^\\d{1,2}:\\d{2}$', description: 'HH:MM. Sin hora, dura todo el día.' },
          hasta: fechaEn('Último día, AAAA-MM-DD, si dura varios días.'),
          tipo: {
            type: 'string',
            enum: ['otro', 'cita_medica', 'celebracion', 'aniversario', 'competicion', 'entreno', 'fecha_escolar'],
            description: 'Qué clase de evento es; elige el emoji. Por defecto, otro.',
          },
          donde: cadena('Dónde es.'),
          notas: cadena('Notas.'),
          de_quien: nombres('De quién es: las personas protagonistas (p. ej. ["Marta"]). En un cumpleaños o una '
            + 'celebración, a esas personas se les ocultan los regalos asociados.'),
          quien_va: nombres('Quién más va. Solo informativo.'),
          repeticion: { type: 'string', enum: Object.keys(REPETICIONES), description: 'Si se repite. Por defecto, ninguna.' },
        },
        required: ['titulo', 'fecha'],
        additionalProperties: false,
      },
      anotaciones: ESCRITURA,
      hacer: con(apuntarEvento),
    },
    {
      nombre: 'apuntar_idea',
      titulo: 'Apuntar una idea de regalo',
      descripcion: 'Apunta una idea de regalo para alguien, como en Regalos › Ideas. Queda oculta para la '
        + 'persona a quien va dirigida: no la verá ni sabrá que existe. Si es solo para quien habla, se guarda '
        + 'como algo que pide (un deseo), que sí ve el resto. Ejemplo: «apunta para Ana una idea de regalo de un '
        + 'bolso» → para ["Ana"], titulo «Bolso». La respuesta dice quién la ve y para quién queda oculta.',
      entrada: {
        type: 'object',
        properties: {
          titulo: cadena('Qué regalar, corto: «Bolso de piel».'),
          para: nombres('Para quién: una o varias personas (p. ej. ["Ana"]).'),
          descripcion: cadena('Detalle: color, talla, por qué.'),
          precio: { type: 'number', minimum: 0, description: 'Precio aproximado, en euros.' },
          donde_se_compra: cadena('Tienda o dónde se compra.'),
          enlace: cadena('Enlace a la tienda.'),
          para_todos: {
            type: 'boolean',
            description: 'Solo cuenta si quien habla administra: true para que lo vean también quienes no '
              + 'administran (las niñas). Por defecto, no lo ven.',
          },
        },
        required: ['titulo', 'para'],
        additionalProperties: false,
      },
      anotaciones: ESCRITURA,
      hacer: con(apuntarIdea),
    },
    {
      nombre: 'apuntar_en_sitio',
      titulo: 'Apuntar en un sitio',
      descripcion: 'Apunta algo en un sitio (Sitios). Ejemplo: «apunta para Llivia llevar un ladrón blanco de '
        + 'dos enchufes» → sitio «Llivia», clase llevar, titulo «Ladrón blanco de dos enchufes». Clases: llevar '
        + '(lista de lo que hay que llevar, sin detalle), hacer (planes allí), ir (sitios a los que ir) y saber '
        + '(lo que conviene saber; la de por defecto). Si el sitio no existe, devuelve los que hay: pregunta y, '
        + 'si es uno nuevo, vuelve a llamar con crear_sitio: true. Solo para quien vive en casa.',
      entrada: {
        type: 'object',
        properties: {
          sitio: cadena('Nombre del sitio: «Llivia». Al crearlo, puede empezar por un emoji.'),
          titulo: cadena('Qué se apunta: «Ladrón blanco de dos enchufes».'),
          clase: { type: 'string', enum: Object.keys(CLASES), description: 'llevar, hacer, ir o saber. Por defecto, saber.' },
          detalle: cadena('Más detalle (no en llevar).'),
          crear_sitio: { type: 'boolean', description: 'true para crear el sitio si no existe. Pregunta antes.' },
        },
        required: ['sitio', 'titulo'],
        additionalProperties: false,
      },
      anotaciones: ESCRITURA,
      hacer: con(apuntarEnSitio),
    },
    {
      nombre: 'apuntar_cena',
      titulo: 'Apuntar una cena',
      descripcion: 'Apunta qué se cena una noche (Cenas). Si el plato está en el recetario, se enlaza con él. '
        + 'Si esa noche ya hay otra cosa, no la cambia: pregunta y vuelve a llamar con reemplazar: true. '
        + 'Solo para quien vive en casa.',
      entrada: {
        type: 'object',
        properties: {
          fecha: fechaEn('La noche, AAAA-MM-DD.'),
          plato: cadena('Qué se cena: «Lentejas».'),
          ninas: cadena('Lo de las niñas, si cenan otra cosa.'),
          reemplazar: { type: 'boolean', description: 'true para cambiar lo que ya hubiera esa noche. Pregunta antes.' },
        },
        required: ['fecha', 'plato'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(apuntarCena),
    },
    {
      nombre: 'apuntar_mejora',
      titulo: 'Apuntar una mejora',
      descripcion: 'Apunta una mejora para la propia aplicación: una idea de cómo debería funcionar o algo que '
        + `falla. La ve toda la casa en Ajustes › Mejoras. Hasta ${TOPE_DE_MEJORA} caracteres.`,
      entrada: {
        type: 'object',
        properties: { texto: cadena('La mejora, escrita para quien la vaya a hacer.') },
        required: ['texto'],
        additionalProperties: false,
      },
      anotaciones: ESCRITURA,
      hacer: con(apuntarMejora),
    },
  ];
}

/**
 * Lo que se le dice al modelo al conectar. Corto: quién habla, en qué hora se
 * cuentan las fechas, quién vive en casa y las dos reglas que una herramienta no
 * puede imponer sola —preguntar ante un nombre dudoso y no contarle a nadie lo
 * que se le prepara—.
 */
export async function instruccionesDe({ leer, lector, hoy }) {
  const instantanea = await leer();
  const deCasa = personasDe(instantanea).filter((p) => p.circulo === 'familia').map(nombreEntero);
  return [
    `Agenda familiar de casa. Te ha conectado ${lector.nombre}: lo que consultes y lo que apuntes va con su `
      + 'cuenta, con lo que esa cuenta ve y puede escribir, ni más ni menos.',
    `Las fechas son de Madrid; al conectar, hoy era ${conAnio(hoy)} (${hoy}). ver_agenda dice siempre qué día es hoy.`,
    deCasa.length ? `En casa viven ${enumerar(deCasa)}. Lío es el perro.` : 'Lío es el perro de casa.',
    'Para apuntar, calcula tú la fecha (AAAA-MM-DD) y repite al usuario la que devuelve la herramienta, en '
      + 'palabras. Si no está claro a qué persona o a qué sitio se refiere, consulta ver_gente o ver_sitios y, si '
      + 'sigue sin estarlo, pregunta antes de apuntar.',
    'Las ideas y los regalos están ocultos para quien los va a recibir: no los menciones en nada que esa persona '
      + 'vaya a leer.',
  ].join('\n');
}
