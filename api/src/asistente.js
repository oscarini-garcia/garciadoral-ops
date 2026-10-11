/**
 * Lo que Claude puede hacer con la agenda: consultar, apuntar, cambiar y comentar, como quien tiene la aplicación abierta.
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
 *
 * **Cambiar algo exige nombrarlo sin ambigüedad**, y por eso cada cosa que se
 * enseña lleva al final su referencia —`[evento:…]`, `[idea:…]`—, que es lo que
 * toman editar, borrar, marcar y comentar. La referencia se busca siempre en la
 * instantánea de quien pregunta: lo que su cuenta no ve no se puede tocar, aunque
 * alguien supiera su identificador. Y lo que en la aplicación pregunta antes
 * —borrar una serie entera, una idea de la que cuelgan regalos— aquí pide
 * `confirmado`, para que Claude lo pregunte también.
 */

import { Rechazo } from './portero/errores.js';
import { arranquesEntre, derivadosDe } from './recordatorios.js';
import {
  edadDe, formatearFecha, formatearRango, lineaDe, lineaDeLio, nombreCorto, platoDe,
} from './redaccion.js';
import {
  TURNOS, conAusencias, cuadroEn, esDeLaCasa, inicioDeVentana, normalizarVersiones,
} from './lio.js';
import { visible } from './visibilidad.js';
import { idCena } from './cenas.js';
import { esComentable } from './comentables.js';
import { festivoQueAnula } from './festivos.js';
import { TOPE_DE_MEJORA } from './repositorio.js';

/** Cómo se presenta este servidor en la lista de conectores de Claude. */
export const SERVIDOR = { name: 'agenda-familiar', title: 'Agenda de casa', version: '1.1.0' };

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
const TIPOS_DE_OTROS_PLUGINS = ['cumpleanos', 'santo', 'viaje', 'recurrente', 'festivo'];

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
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

const EMOJI_INICIAL = /^(\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*)\s*/u;

/** El emoji con el que empieza un nombre y lo demás, como `partirEmoji` en la aplicación. */
function partirEmoji(texto) {
  const entero = String(texto || '').trim();
  const hallado = entero.match(EMOJI_INICIAL);
  if (!hallado) return { emoji: null, resto: entero };
  return { emoji: hallado[1], resto: entero.slice(hallado[0].length).trim() || entero };
}

const importe = (valor) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(valor)} €`;

const esHecho = (fila) => fila?.hecho === true || fila?.hecho === 1;

// ------------------------------------------------------------ Referencias --

/**
 * Lo que se puede nombrar por referencia, con la tabla y la colección de la
 * instantánea donde vive. Un sitio se dice «sitio» aunque su tabla sea `lugar`,
 * que es como se llama en la pantalla.
 */
const REFERENCIABLES = {
  evento: { tabla: 'evento', lista: 'eventos', campoActivo: 'activo' },
  idea: { tabla: 'idea', lista: 'ideas', campoActivo: 'activa' },
  regalo: { tabla: 'regalo', lista: 'regalos', campoActivo: 'activo' },
  sitio: { tabla: 'lugar', lista: 'lugares', campoActivo: 'activo' },
  apunte: { tabla: 'apunte', lista: 'apuntes', campoActivo: 'activo' },
  mejora: { tabla: 'mejora', lista: 'mejoras', campoActivo: 'activo' },
  cena: { tabla: 'cena', lista: 'cenas', campoActivo: 'activo' },
  comentario: { tabla: 'comentario', lista: 'comentarios', campoActivo: 'activo' },
};

/** La referencia de una fila: `<tipo>:<id>`. El identificador de una noche ya
 *  empieza por «cena:», y su referencia es él mismo. */
const refDe = (tipo, id) => (tipo === 'cena' ? String(id) : `${tipo}:${id}`);
const conRef = (texto, tipo, id) => `${texto} [${refDe(tipo, id)}]`;

/**
 * La fila que nombra una referencia, buscada **en la instantánea de quien
 * pregunta**. Lo que no encuentra se contesta igual tanto si no existe como si
 * su cuenta no lo ve: distinguirlo sería decirle que existe.
 */
function porRef(instantanea, referencia) {
  const texto = String(referencia ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
  const corte = texto.indexOf(':');
  const tipo = corte > 0 ? texto.slice(0, corte) : '';
  const como = REFERENCIABLES[tipo];
  if (!como) {
    throw new Rechazo(
      `«${texto}» no es una referencia. Son como evento:…, idea:…, regalo:…, sitio:…, apunte:…, mejora:…, `
      + 'cena:AAAA-MM-DD o comentario:…, y salen entre corchetes en lo que devuelven las consultas.',
    );
  }
  const id = tipo === 'cena' ? texto : texto.slice(corte + 1);
  const fila = (instantanea[como.lista] || []).find((f) => f.id === id && activo(f));
  if (!fila) throw new Rechazo(`No encuentro ${texto}: o ya no está, o tu cuenta no lo ve.`);
  return { tipo, id, fila, ...como };
}

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
  const poner = (dia, texto, ref = null) => {
    if (!porDia.has(dia)) porDia.set(dia, []);
    // Un mismo feed enganchado dos veces trae el vuelo dos veces: la línea
    // idéntica no dice nada nuevo, y se queda con la primera referencia.
    if (!porDia.get(dia).some((cosa) => cosa.texto === texto)) porDia.get(dia).push({ texto, ref });
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
        // Lo derivado de las fichas —cumpleaños y santos— no lleva referencia:
        // no es una fila, y se cambia en la ficha de cada uno.
        poner(dia, lineaDelEvento(evento, instantanea, dia, {
          sigue: paso > 0,
          ultimo: dura ? sumarDias(arranque, dura) : null,
          cancelado: cancelados.has(`${evento.id}:${dia}`) || Boolean(festivoQueAnula(instantanea, evento, dia)),
        }), String(evento.id).startsWith('derivado:') ? null : refDe('evento', evento.id));
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
  const clave = (cosa) => (cosa.texto.startsWith('todo el día') ? '' : cosa.texto.slice(0, 5));
  for (const cosas of porDia.values()) cosas.sort((a, b) => clave(a).localeCompare(clave(b)));
  return porDia;
}

function lineaDeCena(instantanea, dia) {
  const cena = (instantanea.cenas || []).find((c) => c.fecha === dia && activo(c));
  const plato = cena ? platoDe(instantanea, cena.receta_id, cena.texto) : null;
  if (!plato) return null;
  const ninas = platoDe(instantanea, cena.ninas_receta_id, cena.ninas_texto);
  return conRef(`Cena: ${plato}${ninas ? ` (las niñas: ${ninas})` : ''}`, 'cena', cena.id);
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
    lineas.push(
      ...cosas.map((cosa) => `  ${cosa.ref ? `${cosa.texto} [${cosa.ref}]` : cosa.texto}`),
      ...extras.map((linea) => `  ${linea}`),
    );
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
  return conRef([
    idea.titulo,
    descripcion,
    precio,
    idea.establecimiento ? `en ${idea.establecimiento}` : null,
    idea.enlace || null,
    idea.tipo === 'deseo' ? null : `apuntada por ${nombreCorto(instantanea, idea.autor_id) || 'alguien'}`,
  ].filter(Boolean).join(' — '), 'idea', idea.id);
}

/** Cómo se llama un regalo: por la idea de la que salió, que es su único nombre. */
const tituloDeRegalo = (regalo, instantanea) =>
  (instantanea.ideas || []).find((i) => i.id === regalo.idea_id)?.titulo || 'Regalo';

function lineaDeRegalo(regalo, instantanea) {
  const ocasion = (instantanea.ocasiones || []).find((o) => o.id === regalo.ocasion_id);
  const responsable = regalo.responsable_id ? nombreCorto(instantanea, regalo.responsable_id) : null;
  return conRef([
    tituloDeRegalo(regalo, instantanea),
    ESTADO_DE_REGALO[regalo.estado] || regalo.estado,
    responsable ? `se encarga ${responsable}` : 'sin nadie que se encargue',
    ocasion ? `${ocasion.nombre}${esFecha(String(ocasion.fecha || '')) ? `, ${conAnio(ocasion.fecha)}` : ''}` : null,
  ].filter(Boolean).join(' — '), 'regalo', regalo.id);
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

const apuntesDelLugar = (instantanea, lugarId) =>
  (instantanea.apuntes || []).filter((a) => a.lugar_id === lugarId && activo(a));

/** Un sitio entero, por clases: lo que enseña `ver_sitios` con un sitio y el
 *  detalle de un sitio por su referencia. */
function contenidoDeSitio(instantanea, lugar) {
  const votos = (instantanea.votos || []).filter(activo);
  const lineas = [conRef(nombreDeLugar(lugar), 'sitio', lugar.id)];
  for (const [clase, rotulo] of Object.entries(CLASES)) {
    const apuntes = apuntesDelLugar(instantanea, lugar.id).filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase);
    if (!apuntes.length) continue;
    lineas.push('', `${rotulo}:`);
    for (const apunte of apuntes) {
      if (clase === 'llevar') {
        lineas.push(`  ${conRef(`[${esHecho(apunte) ? 'x' : ' '}] ${apunte.titulo}`, 'apunte', apunte.id)}`);
        continue;
      }
      const quienes = votos.filter((v) => v.apunte_id === apunte.id).map((v) => nombreCorto(instantanea, v.persona_id)).filter(Boolean);
      lineas.push(`  · ${conRef([apunte.titulo, apunte.detalle || null, quienes.length ? `les apetece a ${enumerar(quienes)}` : null].filter(Boolean).join(' — '), 'apunte', apunte.id)}`);
    }
  }
  if (lineas.length === 1) lineas.push('', 'Todavía no hay nada apuntado.');
  return lineas;
}

async function verSitios(argumentos, { leer, lector }) {
  soloDeCasa(lector, 'Sitios');
  const instantanea = await leer();
  const lugares = (instantanea.lugares || []).filter(activo);

  if (!argumentos.sitio) {
    if (!lugares.length) return 'Todavía no hay ningún sitio.';
    return ['Sitios:', ...lugares.map((lugar) => {
      const cuantos = Object.keys(CLASES)
        .map((clase) => [clase, apuntesDelLugar(instantanea, lugar.id).filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase).length])
        .filter(([, n]) => n)
        .map(([clase, n]) => `${n} ${clase}`);
      return `  ${conRef(`${nombreDeLugar(lugar)}${cuantos.length ? ` — ${cuantos.join(' · ')}` : ' — vacío'}`, 'sitio', lugar.id)}`;
    })].join('\n');
  }

  const lugar = buscarSitio(instantanea, argumentos.sitio);
  if (!lugar) {
    throw new Rechazo(`No hay ningún sitio «${argumentos.sitio}». Los que hay: ${lugares.map(nombreDeLugar).join(', ') || 'ninguno'}.`);
  }
  return contenidoDeSitio(instantanea, lugar).join('\n');
}

// ------------------------------------------------------------- Mejoras --

/** Quién escribió algo y, si consta, qué día: «Óscar, lunes 12 de Octubre de 2026». */
function firmaDe(instantanea, fila) {
  const quien = nombreCorto(instantanea, fila.autor_id);
  const dia = String(fila.creado_en || '').slice(0, 10);
  return [quien, esFecha(dia) ? conAnio(dia) : null].filter(Boolean).join(', ');
}

async function verMejoras(_argumentos, { leer }) {
  const instantanea = await leer();
  const mejoras = (instantanea.mejoras || []).filter(activo)
    .sort((a, b) => (esHecho(a) === esHecho(b)
      ? String(b.creado_en || '').localeCompare(String(a.creado_en || ''))
      : Number(esHecho(a)) - Number(esHecho(b))));
  if (!mejoras.length) return 'No hay mejoras apuntadas.';
  return mejoras.map((m) => {
    const firma = firmaDe(instantanea, m);
    return conRef(`[${esHecho(m) ? 'x' : ' '}] ${String(m.texto).replace(/\s+/g, ' ')}${firma ? ` — ${firma}` : ''}`, 'mejora', m.id);
  }).join('\n');
}

// -------------------------------------------------------------- Escribir --

/** Escribe un lote por el camino de siempre y falla con el motivo si algo no entra. */
async function escribir(contexto, cambios) {
  const marca = new Date().toISOString();
  const { resultados, registro } = await contexto.escribir(cambios.map((c) => ({ ...c, actualizado_en: marca })));
  const fallido = resultados.find((resultado) => !resultado.aplicado);
  if (fallido) throw new Rechazo(`No se ha podido: ${fallido.motivo || 'el servidor no lo ha aceptado'}`);
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
  if (repetido) {
    return `Ya estaba apuntado «${repetido.titulo}» el ${conAnio(fecha)}: no lo he repetido. [${refDe('evento', repetido.id)}]`;
  }

  // Los mismos campos que el formulario de «Nuevo evento»: un «hasta» igual al
  // día se guarda sin fin, y el fin lleva la misma hora que el inicio.
  const fin = hasta && hasta > fecha ? (hora ? `${hasta}T${hora}:00` : hasta) : null;
  const id = crypto.randomUUID();
  await escribir(contexto, [{
    tipo: 'evento',
    id,
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
    `Referencia: ${refDe('evento', id)}`,
  ].filter(Boolean).join('\n');
}

/**
 * Quién ve una idea y para quién queda oculta, contado con la misma función que
 * decide qué viaja a cada teléfono: así una respuesta no puede prometer una
 * ocultación que no hay. Solo cuentan quienes tienen cuenta, que son los únicos
 * que pueden ver nada.
 */
function quienesVen(registro, ideaId) {
  const idea = (registro.ideas || []).find((i) => i.id === ideaId);
  const conCuenta = (registro.personas || []).filter((p) => p.tiene_cuenta && activo(p));
  const nombre = (p) => p.apodo || p.nombre;
  if (!idea) return { laVen: [], noLaVen: [] };
  return {
    laVen: conCuenta.filter((p) => visible(registro, idea, 'idea', p)).map(nombre),
    noLaVen: conCuenta.filter((p) => !visible(registro, idea, 'idea', p)).map(nombre),
  };
}

function quienLaVe(registro, ideaId) {
  const { laVen, noLaVen } = quienesVen(registro, ideaId);
  return [`La ven: ${enumerar(laVen) || 'nadie más que tú'}.`, ...(noLaVen.length ? [`Oculta para: ${enumerar(noLaVen)}.`] : [])];
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
  if (repetida) {
    return `Ya estaba apuntada «${repetida.titulo}» para ${enumerar(destinatarios.map((p) => p.apodo || p.nombre))}: `
      + `no la he repetido. [${refDe('idea', repetida.id)}]`;
  }

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

  if (deseo) {
    const { laVen } = quienesVen(registro, id);
    return `Apuntado en tus deseos: «${titulo}». Lo ven ${enumerar(laVen) || 'solo tú'}; a ti no se te dirá si alguien lo coge.`
      + `\nReferencia: ${refDe('idea', id)}`;
  }
  return [
    `Idea apuntada para ${enumerar(destinatarios.map((p) => p.apodo || p.nombre))}: «${titulo}»`
      + `${precio !== null ? `, unos ${importe(precio)}` : ''}.`,
    ...quienLaVe(registro, id),
    `Referencia: ${refDe('idea', id)}`,
  ].join('\n');
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
    && (a.clase || CLASE_POR_DEFECTO) === clase && normalizar(a.titulo) === normalizar(titulo));
  if (repetido && clase === 'llevar' && esHecho(repetido)) {
    // Lo que ya se metió en otro viaje se vuelve a poner por meter, como al
    // desmarcarlo en la lista al volver: una segunda línea igual no diría nada.
    await escribir(contexto, [{ tipo: 'apunte', id: repetido.id, campos: { hecho: 0 } }]);
    return `«${repetido.titulo}» ya estaba en ${nombreDeLugar(lugar)} › ${CLASES[clase]}, tachado: `
      + `lo he vuelto a poner por meter. [${refDe('apunte', repetido.id)}]`;
  }
  if (repetido) {
    return `Ya estaba apuntado en ${nombreDeLugar(lugar)} › ${CLASES[clase]}: «${repetido.titulo}». No lo he repetido. `
      + `[${refDe('apunte', repetido.id)}]`;
  }

  const id = crypto.randomUUID();
  cambios.push({
    tipo: 'apunte',
    id,
    campos: { lugar_id: lugar.id, clase, titulo, detalle: detalle || null, autor_id: lector.id, activo: 1 },
  });
  await escribir(contexto, cambios);
  return `Apuntado en ${nombreDeLugar(lugar)} › ${CLASES[clase]}: «${titulo}».`
    + `${cambios.length > 1 ? ` ${nombreDeLugar(lugar)} es un sitio nuevo [${refDe('sitio', lugar.id)}].` : ''}`
    + `\nReferencia: ${refDe('apunte', id)}`;
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
    `[${refDe('cena', idCena(fecha))}]`,
  ].filter(Boolean).join(' ');
}

async function apuntarMejora(argumentos, contexto) {
  const { leer, lector } = contexto;
  const texto = textoDe(argumentos.texto, 'texto', TOPE_DE_MEJORA);
  if (!texto) throw new Rechazo('falta «texto»');
  const instantanea = await leer();
  const repetida = (instantanea.mejoras || []).find((m) => activo(m) && normalizar(m.texto) === normalizar(texto));
  if (repetida) return `Esa mejora ya estaba apuntada: no la he repetido. [${refDe('mejora', repetida.id)}]`;
  const id = crypto.randomUUID();
  await escribir(contexto, [{ tipo: 'mejora', id, campos: { texto, autor_id: lector.id, activo: 1 } }]);
  return `Mejora apuntada. La ve toda la casa en Ajustes › Mejoras.\nReferencia: ${refDe('mejora', id)}`;
}

// -------------------------------------------------------------- El detalle --

const ESTADO_DE_IDEA = { activa: 'disponible', en_curso: 'cogida: ya es un regalo', cerrada: 'cerrada', descartada: 'descartada' };
const VEREDICTO = { repetir: 'repetir', no_mas: 'no más' };
const NOMBRES_DIA_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Cuándo es un evento, en palabras: el día, la hora o todo el día, y hasta cuándo dura. */
function cuandoDelEvento(evento) {
  const dia = String(evento.inicio || '').slice(0, 10);
  const hora = evento.jornada_completa ? null : String(evento.inicio || '').slice(11, 16) || null;
  const ultimo = evento.fin ? String(evento.fin).slice(0, 10) : null;
  return [
    esFecha(dia) ? conAnio(dia) : dia,
    hora ? `a las ${hora}` : 'todo el día',
    ultimo && esFecha(ultimo) && ultimo > dia ? `hasta el ${conAnio(ultimo)}` : null,
  ].filter(Boolean).join(', ');
}

/** Cómo se repite, con los días de la semana cuando una actividad los lleva. */
function repeticionDe(evento) {
  const como = REPETICIONES[evento.repeticion || 'ninguna'];
  if (!como) return null;
  const dias = Array.isArray(evento.extra?.dias) ? evento.extra.dias.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  return evento.repeticion === 'semanal' && dias.length ? `${como}: ${enumerar(dias.map((d) => NOMBRES_DIA_SEMANA[d]))}` : como;
}

/** Por qué un evento no se edita entero desde aquí, si es el caso. */
function procedenciaDe(evento, instantanea) {
  if (evento.origen === 'importado') return `viene del calendario de ${duenoDe(evento, instantanea) || 'alguien'}, y desde aquí no se cambia`;
  if (evento.plugin_id === 'extraescolar') return 'una recurrente: su día, su hora y quién va se cambian en la aplicación';
  if (evento.plugin_id === 'finde') return 'una escapada: quién va y si viene Lío se cambian en la aplicación';
  return null;
}

/** Cómo se nombra una cosa en una respuesta: su título entre comillas, o lo que haga sus veces. */
function nombreDelObjeto({ tipo, fila }, instantanea) {
  if (tipo === 'regalo') return `«${tituloDeRegalo(fila, instantanea)}»`;
  if (tipo === 'sitio') return `«${nombreDeLugar(fila)}»`;
  if (tipo === 'mejora') return `la mejora «${String(fila.texto).replace(/\s+/g, ' ').slice(0, 60)}»`;
  if (tipo === 'cena') return `la cena del ${conAnio(fila.fecha)}`;
  if (tipo === 'comentario') return 'el comentario';
  return `«${fila.titulo}»`;
}

/** El hilo de una cosa comentable, del primero al último. */
function hiloDe(instantanea, tipo, id) {
  const comentarios = (instantanea.comentarios || [])
    .filter((c) => c.objeto_tipo === tipo && c.objeto_id === id && activo(c))
    .sort((a, b) => String(a.creado_en || '').localeCompare(String(b.creado_en || '')));
  if (!comentarios.length) return ['Comentarios: ninguno todavía.'];
  return ['Comentarios:', ...comentarios.map((c) =>
    `  · ${conRef(`${firmaDe(instantanea, c)}: ${String(c.texto).replace(/\s+/g, ' ')}`, 'comentario', c.id)}`)];
}

/** Lo que se cuenta de cada cosa en su detalle. Solo con la instantánea de
 *  quien pregunta: lo que no ve no puede asomar por aquí. */
const DETALLES = {
  evento(evento, instantanea) {
    const tipo = (instantanea.tipos_evento || []).find((t) => t.id === evento.tipo_id);
    const de = deQuienEs(evento, instantanea);
    const van = (evento.participantes || [])
      .filter((p) => p.rol !== 'protagonista')
      .map((p) => nombreCorto(instantanea, p.persona_id))
      .filter(Boolean);
    const procedencia = procedenciaDe(evento, instantanea);
    const firma = firmaDe(instantanea, evento);
    return [
      `Evento «${evento.titulo}» [${refDe('evento', evento.id)}]`,
      `Cuándo: ${cuandoDelEvento(evento)}.`,
      repeticionDe(evento) ? `Se repite ${repeticionDe(evento)}.` : null,
      tipo ? `Qué es: ${tipo.emoji} ${tipo.nombre}.` : null,
      evento.ubicacion ? `Dónde: ${evento.ubicacion}.` : null,
      de.length ? `De: ${enumerar(de)}.` : null,
      van.length ? `Van también: ${enumerar(van)}.` : null,
      evento.notas ? `Notas: ${evento.notas}` : null,
      procedencia ? `Es ${procedencia}.` : null,
      firma ? `Apuntado por ${firma}.` : null,
    ];
  },
  idea(idea, instantanea) {
    const para = (idea.orientaciones || [])
      .map((o) => (o.persona_id
        ? nombreCorto(instantanea, o.persona_id)
        : (instantanea.etiquetas || []).find((e) => e.id === o.etiqueta_id)?.nombre))
      .filter(Boolean);
    const regalos = (instantanea.regalos || []).filter((r) => r.idea_id === idea.id && activo(r));
    const firma = firmaDe(instantanea, idea);
    return [
      `${idea.tipo === 'deseo' ? 'Deseo' : 'Idea'} «${idea.titulo}» [${refDe('idea', idea.id)}]`,
      para.length ? `${idea.tipo === 'deseo' ? 'Lo pide' : 'Para'}: ${enumerar(para)}.` : null,
      idea.descripcion ? `Descripción: ${idea.descripcion}` : null,
      typeof idea.precio_max === 'number' ? `Precio: unos ${importe(idea.precio_max)}.` : null,
      idea.establecimiento ? `Dónde se compra: ${idea.establecimiento}.` : null,
      idea.enlace ? `Enlace: ${idea.enlace}` : null,
      `Estado: ${ESTADO_DE_IDEA[idea.estado] || idea.estado}.`,
      regalos.length ? `Regalos que salen de ella: ${regalos.map((r) => `[${refDe('regalo', r.id)}]`).join(', ')}.` : null,
      firma ? `Apuntada por ${firma}.` : null,
    ];
  },
  regalo(regalo, instantanea) {
    const ocasion = (instantanea.ocasiones || []).find((o) => o.id === regalo.ocasion_id);
    const para = [regalo.destinatario_principal_id, ...(regalo.codestinatarios || [])]
      .map((id) => nombreCorto(instantanea, id))
      .filter(Boolean);
    const idea = (instantanea.ideas || []).find((i) => i.id === regalo.idea_id && activo(i));
    return [
      `Regalo «${tituloDeRegalo(regalo, instantanea)}» [${refDe('regalo', regalo.id)}]`,
      para.length ? `Para: ${enumerar(para)}.` : null,
      ocasion ? `Ocasión: ${ocasion.nombre}${esFecha(String(ocasion.fecha || '')) ? `, ${conAnio(ocasion.fecha)}` : ''}.` : null,
      `Estado: ${ESTADO_DE_REGALO[regalo.estado] || regalo.estado}.`,
      `Se encarga: ${regalo.responsable_id ? nombreCorto(instantanea, regalo.responsable_id) : 'nadie todavía'}.`,
      typeof regalo.coste_real === 'number' ? `Ha costado: ${importe(regalo.coste_real)}.` : null,
      idea ? `Sale de la idea [${refDe('idea', idea.id)}].` : null,
    ];
  },
  sitio(lugar, instantanea) {
    return contenidoDeSitio(instantanea, lugar);
  },
  apunte(apunte, instantanea) {
    const lugar = (instantanea.lugares || []).find((l) => l.id === apunte.lugar_id);
    const clase = apunte.clase || CLASE_POR_DEFECTO;
    const votos = (instantanea.votos || [])
      .filter((v) => v.apunte_id === apunte.id && activo(v))
      .map((v) => nombreCorto(instantanea, v.persona_id))
      .filter(Boolean);
    const firma = firmaDe(instantanea, apunte);
    return [
      `Apunte «${apunte.titulo}» en ${lugar ? nombreDeLugar(lugar) : 'un sitio'} › ${CLASES[clase] || clase} `
        + `[${refDe('apunte', apunte.id)}]`,
      apunte.detalle ? `Detalle: ${apunte.detalle}` : null,
      clase === 'llevar' ? (esHecho(apunte) ? 'Ya está metido.' : 'Todavía no está metido.') : null,
      votos.length ? `Les apetece a: ${enumerar(votos)}.` : null,
      firma ? `Apuntado por ${firma}.` : null,
    ];
  },
  mejora(mejora, instantanea) {
    const firma = firmaDe(instantanea, mejora);
    return [
      `Mejora [${refDe('mejora', mejora.id)}]${esHecho(mejora) ? ', ya hecha' : ', sin hacer'}:`,
      mejora.texto,
      firma ? `Apuntada por ${firma}.` : null,
    ];
  },
  cena(cena, instantanea) {
    const ninas = platoDe(instantanea, cena.ninas_receta_id, cena.ninas_texto);
    return [
      `Cena del ${conAnio(cena.fecha)} [${refDe('cena', cena.id)}]`,
      `Plato: ${platoDe(instantanea, cena.receta_id, cena.texto) || 'sin apuntar'}${cena.receta_id ? ', del recetario' : ''}.`,
      ninas ? `Las niñas: ${ninas}.` : null,
      VEREDICTO[cena.veredicto] ? `Veredicto: ${VEREDICTO[cena.veredicto]}.` : null,
    ];
  },
  comentario(comentario, instantanea) {
    return [
      `Comentario de ${firmaDe(instantanea, comentario) || 'alguien'} [${refDe('comentario', comentario.id)}]:`,
      comentario.texto,
      `Sobre: [${comentario.objeto_tipo}:${comentario.objeto_id}]`,
    ];
  },
};

/** Si una cosa lleva hilo: lo comentable, menos lo de Llevar, que en la
 *  pantalla es una lista de la compra sin hilo y un comentario no lo leería nadie. */
const admiteHilo = ({ tabla, tipo, fila }) =>
  esComentable(tabla) && !(tipo === 'apunte' && (fila.clase || CLASE_POR_DEFECTO) === 'llevar');

const describir = (objetivo, instantanea) =>
  DETALLES[objetivo.tipo](objetivo.fila, instantanea).filter((linea) => linea !== null && linea !== undefined);

async function verDetalle(argumentos, { leer }) {
  const instantanea = await leer();
  const objetivo = porRef(instantanea, argumentos.ref);
  const lineas = describir(objetivo, instantanea);
  if (admiteHilo(objetivo)) lineas.push('', ...hiloDe(instantanea, objetivo.tabla, objetivo.id));
  return lineas.join('\n');
}

// ----------------------------------------------------------------- Cambiar --

/** Lo que llega en los argumentos. `null` o vacío también cuenta: es como se
 *  dice «quítalo» —la hora, el fin, el precio—. Lo que no llega se deja. */
const llega = (argumentos, campo) => Object.hasOwn(argumentos, campo) && argumentos[campo] !== undefined;

function deTipo(objetivo, ...tipos) {
  if (!tipos.includes(objetivo.tipo)) {
    throw new Rechazo(`Esa referencia es de ${objetivo.tipo}, y esta herramienta cambia ${enumerar(tipos)}.`);
  }
  return objetivo;
}

function sinNadaQueCambiar(argumentos, campos) {
  if (!campos.some((campo) => llega(argumentos, campo))) {
    throw new Rechazo(`no hay nada que cambiar: di qué campo y su valor nuevo (${campos.join(', ')})`);
  }
}

/**
 * Cómo queda algo después de cambiarlo, leído otra vez con la cuenta de quien
 * lo cambió. Puede que ya no lo vea —una idea en la que se ha puesto a sí mismo
 * entre quienes la reciben—, y eso se dice en vez de fallar después de escribir.
 */
async function asiQueda({ leer }, tipo, id, hecho = 'Cambiado') {
  const despues = await leer();
  const como = REFERENCIABLES[tipo];
  const fila = (despues[como.lista] || []).find((f) => f.id === id && activo(f));
  if (!fila) return [`${hecho}. Con este cambio tu cuenta deja de verlo, igual que pasaría en la aplicación.`];
  return [`${hecho}. Así queda:`, ...describir({ tipo, id, fila, ...como }, despues)];
}

/** Un número de euros, o `null` para quitarlo. */
function eurosDe(valor, campo) {
  if (valor === null || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) throw new Rechazo(`«${campo}» es un número de euros`);
  return numero;
}

const CAMPOS_DE_EVENTO = ['titulo', 'fecha', 'hora', 'hasta', 'tipo', 'donde', 'notas', 'de_quien', 'quien_va', 'repeticion'];

async function editarEvento(argumentos, contexto) {
  const { leer, lector } = contexto;
  const instantanea = await leer();
  const objetivo = deTipo(porRef(instantanea, argumentos.ref), 'evento');
  const { fila: evento, id } = objetivo;
  sinNadaQueCambiar(argumentos, CAMPOS_DE_EVENTO);

  if (evento.origen !== 'manual') {
    throw new Rechazo(`«${evento.titulo}» viene del calendario de ${duenoDe(evento, instantanea) || 'alguien'}: desde aquí no se cambia.`);
  }
  // Una recurrente y una escapada guardan en `extra` lo que su formulario sabe
  // —los días, la hora de cada uno, quién lleva—, y cambiarles la fecha por
  // aquí lo dejaría desparejado. Lo que no toca nada de eso, sí.
  if (evento.plugin_id) {
    const ajenos = CAMPOS_DE_EVENTO.filter((c) => llega(argumentos, c) && !['titulo', 'donde', 'notas'].includes(c));
    if (ajenos.length) {
      throw new Rechazo(`«${evento.titulo}» es ${procedenciaDe(evento, instantanea)}. Desde aquí se cambian el título, `
        + 'el sitio y las notas; y para quitar un solo día, borrar con «fecha».');
    }
  }

  const campos = {};
  if (llega(argumentos, 'titulo')) campos.titulo = tituloDe(argumentos.titulo, 'titulo');
  if (llega(argumentos, 'donde')) campos.ubicacion = textoDe(argumentos.donde, 'donde', TOPE_DE_TITULO);
  if (llega(argumentos, 'notas')) campos.notas = textoDe(argumentos.notas, 'notas');
  if (llega(argumentos, 'tipo')) {
    const tipos = (instantanea.tipos_evento || []).filter((t) => !TIPOS_DE_OTROS_PLUGINS.includes(t.id));
    const tipo = tipos.find((t) => t.id === argumentos.tipo);
    if (!tipo) throw new Rechazo(`«tipo» es uno de: ${tipos.map((t) => t.id).join(', ')}`);
    campos.tipo_id = tipo.id;
  }
  if (llega(argumentos, 'repeticion')) {
    if (!(argumentos.repeticion in REPETICIONES)) throw new Rechazo(`«repeticion» es una de: ${Object.keys(REPETICIONES).join(', ')}`);
    campos.repeticion = argumentos.repeticion;
  }

  // El cuándo se recompone entero, como lo guarda el formulario. Mover algo que
  // dura varios días conserva lo que dura: cambiar de semana un viaje no lo
  // convierte en un día suelto.
  if (['fecha', 'hora', 'hasta'].some((c) => llega(argumentos, c))) {
    const diaAntes = String(evento.inicio).slice(0, 10);
    const horaAntes = evento.jornada_completa ? null : String(evento.inicio).slice(11, 16) || null;
    const hastaAntes = evento.fin && esFecha(String(evento.fin).slice(0, 10)) ? String(evento.fin).slice(0, 10) : null;
    const fecha = llega(argumentos, 'fecha') ? fechaDe(argumentos.fecha, 'fecha') : diaAntes;
    const hora = llega(argumentos, 'hora') ? horaDe(argumentos.hora) : horaAntes;
    let hasta = llega(argumentos, 'hasta') ? (argumentos.hasta ? fechaDe(argumentos.hasta, 'hasta') : null) : hastaAntes;
    if (!llega(argumentos, 'hasta') && hastaAntes && fecha !== diaAntes) hasta = sumarDias(hastaAntes, diasEntre(diaAntes, fecha));
    if (hasta && hasta < fecha) throw new Rechazo('«hasta» no puede ir antes de la fecha');
    campos.inicio = hora ? `${fecha}T${hora}:00` : fecha;
    campos.fin = hasta && hasta > fecha ? (hora ? `${hasta}T${hora}:00` : hasta) : null;
    campos.jornada_completa = hora ? 0 : 1;
  }

  if (llega(argumentos, 'de_quien') || llega(argumentos, 'quien_va')) {
    const deAntes = (evento.participantes || []).filter((p) => p.rol === 'protagonista').map((p) => p.persona_id);
    const vanAntes = (evento.participantes || []).filter((p) => p.rol !== 'protagonista').map((p) => p.persona_id);
    const ids = (campo) => [...new Set(listaDe(argumentos[campo]).map((n) => buscarPersona(instantanea, n, lector.id).id))];
    const de = llega(argumentos, 'de_quien') ? ids('de_quien') : deAntes;
    const van = (llega(argumentos, 'quien_va') ? ids('quien_va') : vanAntes).filter((persona) => !de.includes(persona));
    campos.participantes = [
      ...de.map((persona_id) => ({ persona_id, rol: 'protagonista' })),
      ...van.map((persona_id) => ({ persona_id, rol: 'asistente' })),
    ];
  }

  await escribir(contexto, [{ tipo: 'evento', id, campos }]);
  return (await asiQueda(contexto, 'evento', id)).join('\n');
}

async function editarIdea(argumentos, contexto) {
  const { leer, lector } = contexto;
  const instantanea = await leer();
  const { fila: idea, id } = deTipo(porRef(instantanea, argumentos.ref), 'idea');
  sinNadaQueCambiar(argumentos, ['titulo', 'descripcion', 'precio', 'donde_se_compra', 'enlace', 'para', 'para_todos']);

  const campos = {};
  if (llega(argumentos, 'titulo')) campos.titulo = tituloDe(argumentos.titulo, 'titulo');
  if (llega(argumentos, 'descripcion')) campos.descripcion = textoDe(argumentos.descripcion, 'descripcion');
  if (llega(argumentos, 'precio')) campos.precio_max = eurosDe(argumentos.precio, 'precio');
  if (llega(argumentos, 'donde_se_compra')) campos.establecimiento = textoDe(argumentos.donde_se_compra, 'donde_se_compra', TOPE_DE_TITULO);
  if (llega(argumentos, 'enlace')) campos.enlace = textoDe(argumentos.enlace, 'enlace', 1000);
  if (llega(argumentos, 'para')) {
    if (idea.tipo === 'deseo') throw new Rechazo('Un deseo es de quien lo pide: no se cambia para quién es.');
    const personas = [...new Map(listaDe(argumentos.para).map((n) => {
      const persona = buscarPersona(instantanea, n, lector.id);
      return [persona.id, persona];
    })).values()];
    if (!personas.length) throw new Rechazo('«para» no puede quedarse vacío');
    // Para quien la apunta y nadie más, la ocultación se la quitaría de delante.
    if (personas.length === 1 && personas[0].id === lector.id) {
      throw new Rechazo('Una idea no puede pasar a ser solo para ti: si lo quieres tú, apúntalo como deseo con apuntar_idea.');
    }
    campos.orientaciones = [
      ...personas.map((p) => ({ persona_id: p.id })),
      ...(idea.orientaciones || []).filter((o) => o.etiqueta_id).map((o) => ({ etiqueta_id: o.etiqueta_id })),
    ];
  }
  if (llega(argumentos, 'para_todos')) {
    if (lector.rol !== 'administrador') throw new Rechazo('«para_todos» solo lo cambia quien administra');
    if (idea.tipo === 'deseo') throw new Rechazo('Un deseo ya lo ve toda la casa.');
    campos.para_todos = argumentos.para_todos === true ? 1 : 0;
  }

  const registro = await escribir(contexto, [{ tipo: 'idea', id, campos }]);
  return [
    ...(await asiQueda(contexto, 'idea', id, 'Cambiada')),
    ...(idea.tipo === 'deseo' ? [] : quienLaVe(registro, id)),
  ].join('\n');
}

const ESTADO_PEDIDO = { por_comprar: 'pendiente', listo: 'comprado', entregado: 'entregado' };

async function editarRegalo(argumentos, contexto) {
  const { leer, lector } = contexto;
  const instantanea = await leer();
  const { id } = deTipo(porRef(instantanea, argumentos.ref), 'regalo');
  sinNadaQueCambiar(argumentos, ['estado', 'se_encarga', 'coste']);

  const campos = {};
  if (llega(argumentos, 'estado')) {
    if (!(argumentos.estado in ESTADO_PEDIDO)) throw new Rechazo(`«estado» es uno de: ${Object.keys(ESTADO_PEDIDO).join(', ')}`);
    campos.estado = ESTADO_PEDIDO[argumentos.estado];
  }
  if (llega(argumentos, 'se_encarga')) {
    const quien = normalizar(argumentos.se_encarga);
    campos.responsable_id = !quien || quien === 'nadie' ? null : buscarPersona(instantanea, argumentos.se_encarga, lector.id).id;
  }
  if (llega(argumentos, 'coste')) campos.coste_real = eurosDe(argumentos.coste, 'coste');

  await escribir(contexto, [{ tipo: 'regalo', id, campos }]);
  return (await asiQueda(contexto, 'regalo', id)).join('\n');
}

async function editarApunte(argumentos, contexto) {
  const { leer, lector } = contexto;
  soloDeCasa(lector, 'Sitios');
  const instantanea = await leer();
  const { fila: apunte, id } = deTipo(porRef(instantanea, argumentos.ref), 'apunte');
  sinNadaQueCambiar(argumentos, ['titulo', 'detalle', 'clase']);

  const clase = llega(argumentos, 'clase') ? normalizar(argumentos.clase) : (apunte.clase || CLASE_POR_DEFECTO);
  if (!(clase in CLASES)) throw new Rechazo(`«clase» es una de: ${Object.keys(CLASES).join(', ')}`);
  if (clase === 'llevar' && llega(argumentos, 'detalle') && argumentos.detalle) {
    throw new Rechazo('Lo de Llevar es una lista de la compra: no lleva detalle.');
  }
  const campos = {};
  if (llega(argumentos, 'titulo')) campos.titulo = tituloDe(argumentos.titulo, 'titulo');
  if (llega(argumentos, 'clase')) campos.clase = clase;
  if (llega(argumentos, 'detalle')) campos.detalle = textoDe(argumentos.detalle, 'detalle') || null;
  // En una lista de la compra no hay dónde leer un detalle, y uno que no se ve miente.
  if (clase === 'llevar') campos.detalle = null;

  await escribir(contexto, [{ tipo: 'apunte', id, campos }]);
  return (await asiQueda(contexto, 'apunte', id)).join('\n');
}

async function editarMejora(argumentos, contexto) {
  const { leer } = contexto;
  const instantanea = await leer();
  const { id } = deTipo(porRef(instantanea, argumentos.ref), 'mejora');
  const texto = textoDe(argumentos.texto, 'texto', TOPE_DE_MEJORA);
  if (!texto) throw new Rechazo('falta «texto»');
  await escribir(contexto, [{ tipo: 'mejora', id, campos: { texto } }]);
  return (await asiQueda(contexto, 'mejora', id, 'Cambiada')).join('\n');
}

/**
 * Borrar, que nunca es físico: la fila se apaga, como cuando se borra desde la
 * pantalla (`retirar` en la aplicación).
 *
 * Lo que la aplicación pregunta antes de hacer, aquí pide `confirmado`: borrar
 * una serie entera —con «fecha» se quita solo ese día, que es casi siempre lo
 * que se quiere decir con «no hay hípica el jueves»— y una idea de la que ya
 * cuelgan regalos, que se quedarían sin nombre.
 */
async function borrar(argumentos, contexto) {
  const { leer, lector } = contexto;
  const instantanea = await leer();
  const objetivo = porRef(instantanea, argumentos.ref);
  const { tipo, tabla, id, fila, campoActivo } = objetivo;
  const nombre = nombreDelObjeto(objetivo, instantanea);
  if (['sitio', 'apunte'].includes(tipo)) soloDeCasa(lector, 'Sitios');
  if (tipo === 'cena') soloDeCasa(lector, 'Cenas');

  if (tipo === 'evento') {
    if (fila.origen !== 'manual') {
      throw new Rechazo(`${nombre} viene del calendario de ${duenoDe(fila, instantanea) || 'alguien'}: se quita allí, no aquí.`);
    }
    const repite = (fila.repeticion || 'ninguna') !== 'ninguna';
    if (argumentos.fecha && !repite) {
      // Un evento suelto solo tiene sus días: una fecha que no es suya dice que
      // se está pensando en otra cosa, y borrar lo que no era no se deshace solo.
      const fecha = fechaDe(argumentos.fecha, 'fecha');
      const primero = String(fila.inicio).slice(0, 10);
      const ultimo = fila.fin && esFecha(String(fila.fin).slice(0, 10)) ? String(fila.fin).slice(0, 10) : primero;
      if (fecha < primero || fecha > ultimo) {
        throw new Rechazo(`${nombre} es el ${cuandoDelEvento(fila)}, no el ${conAnio(fecha)}: no lo he borrado.`);
      }
    }
    if (repite) {
      if (argumentos.fecha) {
        const fecha = fechaDe(argumentos.fecha, 'fecha');
        if (!arranquesEntre(fila, fecha, fecha).length) throw new Rechazo(`El ${conAnio(fecha)} no hay ${nombre}.`);
        const diaId = `dia:${id}:${fecha}`;
        const suelto = (instantanea.dias_evento || []).find((d) => d.id === diaId && activo(d));
        if (suelto?.cancelado === true || suelto?.cancelado === 1) return `Ya constaba que el ${conAnio(fecha)} no hay ${nombre}.`;
        await escribir(contexto, [{
          tipo: 'evento_dia',
          id: diaId,
          campos: suelto
            ? { cancelado: 1 }
            : { evento_id: id, fecha, cancelado: 1, autor_id: lector.id, activo: 1 },
        }]);
        return `Hecho: el ${conAnio(fecha)} no hay ${nombre}; los demás días siguen igual. `
          + 'En la agenda ese día sale tachado, y desde allí se puede devolver.';
      }
      if (argumentos.confirmado !== true) {
        throw new Rechazo(`${nombre} se repite ${repeticionDe(fila)}. Para quitar solo un día, vuelve a llamar con «fecha»; `
          + 'para borrar la serie entera, pregúntalo antes y llama con confirmado: true.');
      }
    }
  }

  // Un sitio se borra vacío, como en la aplicación; el Worker lo vuelve a
  // comprobar, porque otra persona puede haber apuntado algo entre medias.
  if (tipo === 'sitio') {
    const dentro = apuntesDelLugar(instantanea, id).length;
    if (dentro) {
      throw new Rechazo(`${nombre} todavía tiene ${dentro} apunte${dentro === 1 ? '' : 's'}, y un sitio se borra vacío. `
        + 'Borrar lo que tiene dentro es borrar lo que escribieron otros: pregúntalo antes.');
    }
  }

  if (tipo === 'idea') {
    const colgando = (instantanea.regalos || []).filter((r) => r.idea_id === id && activo(r));
    if (colgando.length && argumentos.confirmado !== true) {
      const n = colgando.length;
      throw new Rechazo(`De ${nombre} ${n === 1 ? 'cuelga un regalo' : `cuelgan ${n} regalos`}: si se borra, `
        + `${n === 1 ? 'se queda' : 'se quedan'} sin nombre («Regalo»). Pregúntalo antes; para borrarla igual, confirmado: true. `
        + 'Si solo es que ya no vale, quita antes el regalo.');
    }
  }

  await escribir(contexto, [{ tipo: tabla, id, campos: { [campoActivo]: 0 } }]);

  if (tipo === 'evento') return `Borrado de la agenda: ${nombre}${(fila.repeticion || 'ninguna') !== 'ninguna' ? ', con todos sus días' : ''}.`;
  if (tipo === 'regalo') {
    // La idea vuelve al banco cuando ya no cuelga nada de ella (`derivarEstados`).
    const idea = (instantanea.ideas || []).find((i) => i.id === fila.idea_id && activo(i));
    const otros = (instantanea.regalos || []).some((r) => r.id !== id && r.idea_id === fila.idea_id && activo(r));
    return `Quitado el regalo ${nombre}${idea && !otros ? '; la idea de la que salió vuelve a estar disponible' : ''}.`;
  }
  if (tipo === 'cena') return `La noche del ${conAnio(fila.fecha)} queda sin cena apuntada; la receta, si la había, sigue en el recetario.`;
  if (tipo === 'apunte') {
    const lugar = (instantanea.lugares || []).find((l) => l.id === fila.lugar_id);
    return `Borrado de ${lugar ? nombreDeLugar(lugar) : 'su sitio'} › ${CLASES[fila.clase || CLASE_POR_DEFECTO]}: ${nombre}.`;
  }
  if (tipo === 'mejora') return 'Mejora quitada de la lista de toda la casa.';
  if (tipo === 'comentario') return 'Comentario borrado.';
  return `Borrado: ${nombre}.`;
}

async function marcarHecho(argumentos, contexto) {
  const { leer, lector } = contexto;
  const instantanea = await leer();
  const objetivo = porRef(instantanea, argumentos.ref);
  const { tipo, tabla, id, fila } = objetivo;
  if (tipo === 'regalo') {
    throw new Rechazo('Un regalo se marca con editar_regalo: estado «listo» cuando ya está comprado, «entregado» cuando ya se ha dado.');
  }
  if (tipo === 'apunte') {
    soloDeCasa(lector, 'Sitios');
    if ((fila.clase || CLASE_POR_DEFECTO) !== 'llevar') {
      throw new Rechazo('Solo lo de Llevar se marca: el resto de un sitio no tiene hecho.');
    }
  } else if (tipo !== 'mejora') {
    throw new Rechazo('Esto no se marca como hecho. Se marcan lo de Llevar de un sitio y las mejoras; los paseos de Lío, con marcar_paseo_de_lio.');
  }

  const hecho = argumentos.hecho !== false;
  const nombre = nombreDelObjeto(objetivo, instantanea);
  if (esHecho(fila) === hecho) return `${nombre} ya estaba ${hecho ? 'marcado como hecho' : 'sin marcar'}.`;
  await escribir(contexto, [{ tipo: tabla, id, campos: { hecho: hecho ? 1 : 0 } }]);
  return hecho ? `Marcado como hecho: ${nombre}.` : `Desmarcado: ${nombre}.`;
}

/** Lunes en 0, como el cuadro de Lío. */
const diaDeLaSemana = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;

/**
 * Un turno de Lío con la regla de siempre: manda la fila escrita, y si no la
 * hay, el cuadro que gobernaba al abrirse la ventana, con las ausencias pasando
 * el turno a quien cubra. Es la misma derivación que `lineaDeLio` y que la
 * pantalla (`turnoDe` en `pwa/publico/js/lio.js`).
 */
function turnoDeLio(instantanea, fecha, turnoId, ahora) {
  const turno = TURNOS.find((t) => t.id === turnoId);
  const paseo = (instantanea.paseos || []).find((p) => p.id === `lio:${fecha}:${turnoId}` && activo(p)) || null;
  const inicio = inicioDeVentana(fecha, turnoId);
  const fin = new Date(inicio.getTime() + (turno.hasta - turno.desde) * 3600000);
  const cuadro = cuadroEn(normalizarVersiones(instantanea.lio_cuadro), inicio);
  return {
    turno,
    asignadoId: paseo ? paseo.asignado_id || null : conAusencias(instantanea, cuadro[turnoId]?.[diaDeLaSemana(fecha)] || null, fecha),
    hechoPorId: paseo?.hecho_por_id || null,
    hechoEn: paseo?.hecho_en || null,
    empezado: ahora >= inicio,
    vencido: ahora >= fin,
  };
}

/**
 * «He sacado a Lío» y «no salió», con las reglas de la pantalla
 * (`marcarHecho` y `marcarNoHecho` en `pwa/publico/js/lio.js`). Mientras el día
 * está vivo, decir que lo has sacado se escribe aunque el turno fuera de otro;
 * un turno ajeno que ya venció sin marcar pasa por el trato, y eso se pide en la
 * aplicación, que es donde quien lo tenía lo confirma. Que no salió solo se dice
 * del turno propio.
 */
async function marcarPaseo(argumentos, contexto) {
  const { leer, lector, hoy } = contexto;
  soloDeCasa(lector, 'Lío');
  const fecha = argumentos.fecha ? fechaDe(argumentos.fecha, 'fecha') : hoy;
  const turnoId = String(argumentos.turno || '');
  if (!TURNOS.some((t) => t.id === turnoId)) throw new Rechazo(`«turno» es uno de: ${TURNOS.map((t) => t.id).join(', ')}`);
  const salio = argumentos.salio !== false;

  const instantanea = await leer();
  const ahora = new Date();
  const t = turnoDeLio(instantanea, fecha, turnoId, ahora);
  const cuando = `${turnoId === 'manana' ? 'por la mañana' : 'por la noche'} del ${conAnio(fecha)}`;
  const nombre = (personaId) => nombreCorto(instantanea, personaId) || 'alguien';
  const yo = lector.id;
  if (!t.empezado) throw new Rechazo(`El turno ${cuando} todavía no ha empezado: abre a las ${t.turno.desde}:00.`);

  const fila = (campos) => [{
    tipo: 'paseo',
    id: `lio:${fecha}:${turnoId}`,
    campos: { fecha, turno: turnoId, asignado_id: t.asignadoId || yo, ...campos, activo: 1 },
  }];

  if (salio) {
    if (t.hechoPorId === yo) return `Ya constaba que sacaste a Lío ${cuando}.`;
    if (t.hechoPorId) return `Ya consta que lo sacó ${nombre(t.hechoPorId)} ${cuando}.`;
    if (t.asignadoId && t.asignadoId !== yo && t.vencido && !t.hechoEn) {
      throw new Rechazo(`Ese turno era de ${nombre(t.asignadoId)} y ya pasó sin marcar: corregirlo lo confirma `
        + `${nombre(t.asignadoId)}, así que se pide desde la aplicación.`);
    }
    await escribir(contexto, fila({ hecho_por_id: yo, hecho_en: ahora.toISOString() }));
    return `Apuntado: sacaste a Lío ${cuando}.${t.asignadoId && t.asignadoId !== yo ? ` Era el turno de ${nombre(t.asignadoId)}.` : ''}`;
  }

  if (t.asignadoId !== yo) {
    throw new Rechazo(`Que Lío no salió solo se dice del turno propio, y el ${cuando} es de ${t.asignadoId ? nombre(t.asignadoId) : 'nadie'}.`);
  }
  if (t.hechoPorId && t.hechoPorId !== yo) {
    throw new Rechazo(`Consta que lo sacó ${nombre(t.hechoPorId)} ${cuando}: eso se corrige desde la aplicación.`);
  }
  if (!t.hechoPorId && t.hechoEn) return `Ya constaba que Lío no salió ${cuando}.`;
  await escribir(contexto, fila({ hecho_por_id: null, hecho_en: ahora.toISOString() }));
  return `Apuntado: Lío no salió ${cuando}.`;
}

async function comentar(argumentos, contexto) {
  const { leer, lector } = contexto;
  const texto = textoDe(argumentos.texto, 'texto');
  if (!texto) throw new Rechazo('falta «texto»');
  const instantanea = await leer();
  const objetivo = porRef(instantanea, argumentos.ref);
  if (!admiteHilo(objetivo)) {
    throw new Rechazo('Sobre eso no se comenta: se comentan los eventos, las ideas, los regalos y los apuntes de un sitio '
      + 'que no son de Llevar.');
  }
  const nombre = nombreDelObjeto(objetivo, instantanea);
  const repetido = (instantanea.comentarios || []).find((c) => activo(c) && c.objeto_tipo === objetivo.tabla
    && c.objeto_id === objetivo.id && c.autor_id === lector.id && normalizar(c.texto) === normalizar(texto));
  if (repetido) return `Ese comentario ya estaba en ${nombre}: no lo he repetido. [${refDe('comentario', repetido.id)}]`;

  const id = crypto.randomUUID();
  await escribir(contexto, [{
    tipo: 'comentario',
    id,
    campos: { objeto_tipo: objetivo.tabla, objeto_id: objetivo.id, autor_id: lector.id, texto, activo: 1 },
  }]);
  return `Comentario añadido en ${nombre}. Lo leen quienes ven ${nombre}.\nReferencia: ${refDe('comentario', id)}`;
}

// ------------------------------------------------------- Las herramientas --

const cadena = (descripcion) => ({ type: 'string', description: descripcion });
const fechaEn = (descripcion) => ({ type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: descripcion });
const nombres = (descripcion) => ({ type: 'array', items: { type: 'string' }, description: descripcion });
const referencia = (cuales) => cadena(`La referencia, tal como sale entre corchetes en las consultas: ${cuales}.`);
const euros = (descripcion) => ({ type: ['number', 'null'], minimum: 0, description: descripcion });

/** Los tipos que ofrece el formulario de un evento puntual. */
const TIPOS_DE_EVENTO = ['otro', 'cita_medica', 'celebracion', 'aniversario', 'competicion', 'entreno', 'fecha_escolar'];

/** Lo que se dice de las referencias en cada consulta que las enseña. */
const CON_REFERENCIAS = ' Cada cosa lleva al final su referencia entre corchetes, que es lo que piden ver_detalle, '
  + 'editar_*, borrar, marcar_hecho y comentar.';

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
        + `Sin fechas, los siete días desde hoy; como mucho ${MAXIMO_DIAS} días de una vez.${CON_REFERENCIAS} `
        + 'Lo que se deriva de las fichas (cumpleaños, santos, quién está fuera) no la lleva: se cambia en la ficha.',
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
        + `la aplicación. Con «para», solo esa persona.${CON_REFERENCIAS}`,
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
        + `Sin «sitio», la lista de sitios. Solo para quien vive en casa.${CON_REFERENCIAS}`,
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
        + `hechas y las pendientes primero.${CON_REFERENCIAS}`,
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
          tipo: { type: 'string', enum: TIPOS_DE_EVENTO, description: 'Qué clase de evento es; elige el emoji. Por defecto, otro.' },
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
        + 'si es uno nuevo, vuelve a llamar con crear_sitio: true. Lo de llevar que ya estaba tachado se vuelve '
        + 'a poner por meter. Solo para quien vive en casa.',
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
    {
      nombre: 'ver_detalle',
      titulo: 'Ver el detalle de algo',
      descripcion: 'Todo lo que se sabe de una cosa por su referencia: cuándo, de quién, notas, estado, quién la '
        + 'apuntó y, en un evento, una idea, un regalo o un apunte, sus comentarios. Sirve para comprobar algo '
        + 'antes de cambiarlo o borrarlo.',
      entrada: {
        type: 'object',
        properties: { ref: referencia('evento:…, idea:…, regalo:…, sitio:…, apunte:…, mejora:…, cena:AAAA-MM-DD o comentario:…') },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: LECTURA,
      hacer: con(verDetalle),
    },
    {
      nombre: 'editar_evento',
      titulo: 'Cambiar un evento',
      descripcion: 'Cambia un evento de la agenda. Solo se tocan los campos que se pasan; «hora» o «hasta» '
        + 'vacíos se quitan. Mover de día algo que dura varios días conserva lo que dura. De una actividad '
        + 'recurrente o de una escapada solo se cambian el título, el sitio y las notas, y lo que viene de un '
        + 'calendario externo (los vuelos) no se cambia. La respuesta enseña cómo queda.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('evento:…'),
          titulo: cadena('El título nuevo.'),
          fecha: fechaEn('El día nuevo, AAAA-MM-DD.'),
          hora: { type: 'string', pattern: '^(\\d{1,2}:\\d{2})?$', description: 'HH:MM; vacío para que dure todo el día.' },
          hasta: { type: 'string', pattern: '^(\\d{4}-\\d{2}-\\d{2})?$', description: 'Último día, AAAA-MM-DD; vacío para que sea de un solo día.' },
          tipo: { type: 'string', enum: TIPOS_DE_EVENTO, description: 'Qué clase de evento es.' },
          donde: cadena('Dónde; vacío para quitarlo.'),
          notas: cadena('Las notas enteras, que sustituyen a las que había; vacío para quitarlas.'),
          de_quien: nombres('De quién es: la lista entera, que sustituye a la que había.'),
          quien_va: nombres('Quién más va: la lista entera, que sustituye a la que había.'),
          repeticion: { type: 'string', enum: Object.keys(REPETICIONES), description: 'Si se repite.' },
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(editarEvento),
    },
    {
      nombre: 'editar_idea',
      titulo: 'Cambiar una idea de regalo',
      descripcion: 'Cambia una idea de regalo, o algo que alguien ha pedido (un deseo): título, descripción, '
        + 'precio, tienda, enlace y, en una idea, para quién es. Cambiar «para» cambia quién la ve, y la respuesta '
        + 'lo dice. Un deseo sigue siendo de quien lo pidió.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('idea:…'),
          titulo: cadena('El título nuevo.'),
          descripcion: cadena('La descripción entera; vacío para quitarla.'),
          precio: euros('Precio aproximado, en euros; null para quitarlo.'),
          donde_se_compra: cadena('Tienda o dónde se compra; vacío para quitarlo.'),
          enlace: cadena('Enlace a la tienda; vacío para quitarlo.'),
          para: nombres('Para quién: la lista entera, que sustituye a la que había.'),
          para_todos: {
            type: 'boolean',
            description: 'Solo quien administra: true para que la vean también quienes no administran (las niñas).',
          },
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(editarIdea),
    },
    {
      nombre: 'editar_regalo',
      titulo: 'Cambiar un regalo',
      descripcion: 'Cambia un regalo en marcha: su estado (por_comprar; listo, cuando ya está comprado; '
        + 'entregado, cuando ya se ha dado), quién se encarga y cuánto ha costado. Entregarlo cierra la idea de '
        + 'la que salió, como en la aplicación.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('regalo:…'),
          estado: { type: 'string', enum: Object.keys(ESTADO_PEDIDO), description: 'por_comprar, listo o entregado.' },
          se_encarga: cadena('Quién se encarga: un nombre, o «nadie».'),
          coste: euros('Lo que ha costado, en euros; null para quitarlo.'),
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(editarRegalo),
    },
    {
      nombre: 'editar_apunte',
      titulo: 'Corregir un apunte de un sitio',
      descripcion: 'Corrige un apunte de un sitio: el texto, el detalle (no en llevar) o la clase. Cualquiera de '
        + 'casa puede corregir lo de cualquiera, como en la aplicación. Solo para quien vive en casa.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('apunte:…'),
          titulo: cadena('El texto nuevo.'),
          detalle: cadena('El detalle entero; vacío para quitarlo. No en llevar.'),
          clase: { type: 'string', enum: Object.keys(CLASES), description: 'llevar, hacer, ir o saber.' },
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(editarApunte),
    },
    {
      nombre: 'editar_mejora',
      titulo: 'Cambiar una mejora',
      descripcion: `Sustituye el texto de una mejora de la aplicación. Hasta ${TOPE_DE_MEJORA} caracteres.`,
      entrada: {
        type: 'object',
        properties: { ref: referencia('mejora:…'), texto: cadena('El texto entero, que sustituye al que había.') },
        required: ['ref', 'texto'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(editarMejora),
    },
    {
      nombre: 'borrar',
      titulo: 'Borrar algo',
      descripcion: 'Borra algo: un evento, una idea, un regalo, un sitio vacío, un apunte (lo borra quien lo '
        + 'escribió o quien administra), una mejora, la cena de una noche o un comentario propio. Pregunta siempre '
        + 'antes de borrar. De algo que se repite, con «fecha» se quita solo ese día («no hay hípica el jueves»); '
        + 'la serie entera pide confirmado: true, igual que una idea de la que ya cuelgan regalos. Lo que viene '
        + 'de un calendario externo no se borra desde aquí.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('evento:…, idea:…, regalo:…, sitio:…, apunte:…, mejora:…, cena:AAAA-MM-DD o comentario:…'),
          fecha: fechaEn('Solo en algo que se repite: el día que no hay, AAAA-MM-DD.'),
          confirmado: {
            type: 'boolean',
            description: 'true solo cuando quien habla ya ha dicho que sí a borrar una serie entera o una idea con regalos.',
          },
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(borrar),
    },
    {
      nombre: 'marcar_hecho',
      titulo: 'Marcar como hecho',
      descripcion: 'Marca como hecho, o desmarca con hecho: false, una cosa de la lista de Llevar de un sitio (ya '
        + 'está en la maleta) o una mejora (ya está hecha). Un regalo comprado o entregado se cambia con '
        + 'editar_regalo, y un paseo de Lío, con marcar_paseo_de_lio.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('apunte:… de Llevar, o mejora:…'),
          hecho: { type: 'boolean', description: 'false para desmarcar. Por defecto, true.' },
        },
        required: ['ref'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(marcarHecho),
    },
    {
      nombre: 'marcar_paseo_de_lio',
      titulo: 'Marcar un paseo de Lío',
      descripcion: 'Apunta que quien habla ha sacado a Lío (el perro) en un turno —mañana, de 6 a 10; noche, de '
        + '20 a 24, hora de Madrid—, o, con salio: false, que en su turno no salió. Como en la aplicación: sacarlo '
        + 'en el turno de otro se apunta en el acto, pero el turno de otro que ya terminó sin marcar se corrige '
        + 'desde la aplicación, porque lo confirma quien lo tenía. Solo para quien vive en casa.',
      entrada: {
        type: 'object',
        properties: {
          turno: { type: 'string', enum: TURNOS.map((t) => t.id), description: 'manana o noche.' },
          fecha: fechaEn('El día, AAAA-MM-DD. Por defecto, hoy.'),
          salio: { type: 'boolean', description: 'false para decir que no salió; solo del turno propio. Por defecto, true.' },
        },
        required: ['turno'],
        additionalProperties: false,
      },
      anotaciones: SUSTITUYE,
      hacer: con(marcarPaseo),
    },
    {
      nombre: 'comentar',
      titulo: 'Comentar',
      descripcion: 'Añade un comentario, firmado por quien habla, a un evento, una idea, un regalo o un apunte de '
        + 'un sitio (no a lo de llevar, que no tiene hilo). Lo leen quienes ven esa cosa, y avisa como en la '
        + 'aplicación. Los que ya hay salen en ver_detalle; uno propio se quita con borrar.',
      entrada: {
        type: 'object',
        properties: {
          ref: referencia('evento:…, idea:…, regalo:… o apunte:…'),
          texto: cadena('El comentario.'),
        },
        required: ['ref', 'texto'],
        additionalProperties: false,
      },
      anotaciones: ESCRITURA,
      hacer: con(comentar),
    },
  ];
}

/**
 * Lo que se le dice al modelo al conectar. Corto: quién habla, en qué hora se
 * cuentan las fechas, quién vive en casa y las reglas que una herramienta no
 * puede imponer sola —preguntar ante un nombre dudoso, preguntar antes de
 * borrar, no adivinar referencias y no contarle a nadie lo que se le prepara—.
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
    'Para cambiar, borrar, marcar o comentar algo, usa la referencia que sale entre corchetes al final de cada '
      + 'línea de las consultas, como [evento:…]; no la adivines. Antes de borrar, pregunta siempre; y si una '
      + 'herramienta pide confirmado, pregúntalo al usuario antes de volver a llamar.',
    'Las ideas y los regalos están ocultos para quien los va a recibir: no los menciones en nada que esa persona '
      + 'vaya a leer.',
  ].join('\n');
}
