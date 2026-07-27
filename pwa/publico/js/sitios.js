/**
 * Sitios: las clases de un apunte, el voto y el orden en que se leen.
 *
 * Aquí vive todo lo que hay que saber de un sitio sin dibujar nada, igual que
 * `lio.js` con los turnos. La forma está en `specs/ux.md` §12.1 y las entidades,
 * en `specs/modelo-datos.md` §2.7; el porqué, en `specs/propuesta-sitios.html`.
 *
 * **Un sitio es la carpeta y los apuntes cuelgan de él.** Es la única forma en
 * la que la pantalla de entrada sigue siendo legible dentro de tres años: los
 * sitios son cinco o seis para siempre, mientras que los apuntes se multiplican.
 * Y es la que le da al voto y al comentario una cosa pequeña de la que colgar.
 *
 * **El ciclo de vida es creado y borrado, y nada más.** Sin estados, sin fechas
 * y sin archivar: «subir a la duna» no se agota al subir, y un visto convertiría
 * la guía en una lista de tareas de un solo verano.
 */

import { guardar, retirar } from './sincronizacion.js';
import { emojiVisible, estaActivo } from './modelo.js';
import { formatearHace } from './semana.js';

/**
 * Las cuatro clases, por lo que se hace con cada apunte.
 *
 * Son verbos y no sustantivos porque es como se dicen en voz alta, y porque así
 * «Sitios» puede ser el nombre de la pestaña sin chocar con «sitios donde ir».
 *
 * **«Saber» es el cuarto verbo y no un cajón de sastre.** Nombra un contenido
 * concreto —el súper cierra a las dos, se paga en efectivo, el aparcamiento se
 * llena a las once— en lugar de nombrar la ausencia de los otros tres, que es
 * lo que hace que un «Otros» se trague la mitad de las filas en dos veranos.
 *
 * Van en el orden del viaje: se prepara, se planea, se llega. Saber cierra
 * porque es lo que se consulta y no lo que se recorre.
 */
export const CLASES = [
  // «Llevar» no es una clase más: es una lista de la compra, y por eso lleva
  // `lista` puesto. Una línea, una casilla y un aspa; sin descripción, sin hilo
  // y sin voto. Va la primera porque es lo único de un sitio que se mira **con
  // prisa**, de pie y antes de salir por la puerta.
  { id: 'llevar', nombre: 'Llevar', lista: true },
  { id: 'hacer', nombre: 'Hacer' },
  { id: 'ir', nombre: 'Ir' },
  { id: 'saber', nombre: 'Saber' },
];

/** ¿Esta clase se lee como lista de la compra? Lo pregunta la pantalla para
 *  saber si dibuja una fila con casilla o una tarjeta con voto y hilo. */
export const esLista = (clase) => Boolean(clasePorId(clase).lista);

/**
 * La que va puesta de origen.
 *
 * «Saber» y no «Hacer»: ahora que existe una clase sin filo, ponerla por defecto
 * hace que quien no quiera clasificar no tenga que hacerlo, y quien sí quiera la
 * mueve de un toque en el conmutador de cuatro.
 */
export const CLASE_POR_DEFECTO = 'saber';

export const IDS_CLASE = CLASES.map((c) => c.id);

export const clasePorId = (id) => CLASES.find((c) => c.id === id) || CLASES[CLASES.length - 1];

/** El identificador de un voto se compone, no se inventa: el dispositivo marca
 *  antes de haber visto ninguna fila y tiene que dar con la misma que el
 *  servidor. Es la misma regla que el paseo de Lío. */
export const idVoto = (apunteId, personaId) => `voto:${apunteId}:${personaId}`;

/** ¿Tiene esta casa el módulo? Sin la migración aplicada no llega nada, y la
 *  pestaña tiene que poder decirlo en vez de enseñar una pantalla rota. */
export const haySitios = (instantanea) => Array.isArray(instantanea?.lugares);

export const lugaresDe = (instantanea) =>
  (instantanea?.lugares || []).filter((l) => estaActivo(l));

/** El nombre de un sitio tal como se escribe: con su emoji delante, y con el
 *  emoji arreglado para que salga en color y no a trazo. */
export const nombreDeLugar = (lugar) =>
  [lugar?.emoji ? emojiVisible(lugar.emoji) : null, lugar?.nombre].filter(Boolean).join(' ');

export const lugarPorId = (instantanea, id) =>
  lugaresDe(instantanea).find((l) => l.id === id) || null;

export const apuntesDe = (instantanea, lugarId) =>
  (instantanea?.apuntes || []).filter((a) => a.lugar_id === lugarId && estaActivo(a));

/** Quiénes han votado un apunte, en el orden en que están dadas de alta las
 *  personas, para que las iniciales no bailen de un pintado a otro. */
export function votantesDe(instantanea, apunteId) {
  const votos = (instantanea?.votos || []).filter((v) => v.apunte_id === apunteId && estaActivo(v));
  const orden = new Map((instantanea?.personas || []).map((p, indice) => [p.id, indice]));
  return votos
    .map((v) => v.persona_id)
    .sort((a, b) => (orden.get(a) ?? 99) - (orden.get(b) ?? 99));
}

/**
 * Los apuntes de un sitio repartidos por clase, y dentro de cada una por votos.
 *
 * El voto ordena porque si no ordenara nada sería un adorno; ordenando, la
 * sombrilla sube sola al primer renglón de la lista que se lee antes de salir.
 * A igualdad de votos, lo último escrito primero.
 *
 * Los grupos vacíos no salen: un sitio al que solo hay que ir no enseña tres
 * rótulos huecos.
 */
export function porClase(instantanea, lugarId) {
  const apuntes = apuntesDe(instantanea, lugarId);
  return CLASES
    .map((clase) => ({
      clase,
      apuntes: apuntes
        .filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase.id)
        .sort((a, b) => {
          // En la lista de la compra manda la casilla: lo tachado baja al final
          // para que lo que falta quede arriba, y dentro de cada mitad se
          // conserva el orden en que se escribió, que es como se apunta.
          if (clase.lista) {
            const diferencia = Number(estaHecho(a)) - Number(estaHecho(b));
            return diferencia || String(a.creado_en || '').localeCompare(String(b.creado_en || ''));
          }
          const diferencia = votantesDe(instantanea, b.id).length - votantesDe(instantanea, a.id).length;
          return diferencia || String(b.creado_en || '').localeCompare(String(a.creado_en || ''));
        }),
    }))
    .filter((grupo) => grupo.apuntes.length);
}

/** Cuántos apuntes vivos tiene un sitio. Es lo que decide si se puede borrar. */
export const cuantosApuntes = (instantanea, lugarId) => apuntesDe(instantanea, lugarId).length;

/**
 * Lo que se escribe debajo del nombre en la lista: cuántos hay de cada verbo.
 *
 * «6 apuntes» no decía nada útil —seis puede ser una lista de la compra o seis
 * playas— y la pregunta que se hace al mirar la lista es de qué va cada sitio.
 * «3 llevar · 2 hacer · 1 ir» la contesta sin abrirlo.
 *
 * Los verbos sin nada no salen, que es la misma regla que dentro del sitio.
 */
export function resumenDeLugar(instantanea, lugarId) {
  const apuntes = apuntesDe(instantanea, lugarId);
  const trozos = CLASES
    .map((clase) => {
      const cuantos = apuntes.filter((a) => (a.clase || CLASE_POR_DEFECTO) === clase.id).length;
      return cuantos ? `${cuantos} ${clase.nombre.toLowerCase()}` : null;
    })
    .filter(Boolean);
  return trozos.length ? trozos.join(' · ') : 'Todavía sin nada';
}

/** ¿Está tachado? La casilla solo existe en las clases de lista. */
export const estaHecho = (apunte) => Boolean(apunte?.hecho) && apunte.hecho !== 0 && apunte.hecho !== '0';

/** Tachar y destachar, que es el gesto de esta lista y no tiene más ceremonia. */
export const alternarHecho = (apunte) =>
  guardar('apunte', apunte.id, { hecho: estaHecho(apunte) ? 0 : 1 });

/**
 * La firma de una línea de la lista: quién la puso y, si ya no es de hoy, cuándo.
 *
 * El cuándo solo aparece cuando aporta: recién escrito, el nombre basta y la
 * fecha sería ruido; pasados unos días, saber que eso lleva ahí desde el martes
 * es la mitad de lo que se quiere saber.
 */
export function firmaDeApunte(vista, apunte) {
  const quien = apunte.autor_id ? vista.nombre(apunte.autor_id) : null;
  if (!quien) return null;
  const cuando = formatearHace(apunte.creado_en);
  const deHoy = !cuando || cuando.startsWith('hoy') || cuando.startsWith('hace') || cuando === 'ahora mismo';
  return deHoy ? `(${quien})` : `(${quien}, ${cuando})`;
}

/**
 * Pone o quita mi voto.
 *
 * No hay estado intermedio ni confirmación: es el gesto más barato de todo el
 * módulo y se deshace tocando otra vez.
 */
export function alternarVoto(instantanea, apunteId, personaId) {
  const id = idVoto(apunteId, personaId);
  const existente = (instantanea?.votos || []).find((v) => v.id === id);
  if (existente && estaActivo(existente)) return retirar('voto', id);
  return guardar('voto', id, { apunte_id: apunteId, persona_id: personaId, activo: 1 });
}

/**
 * El sitio entero como texto, para mandarlo por ahí.
 *
 * **Sin votos, sin comentarios y sin quién apuntó cada cosa.** Eso es lo de
 * dentro de casa; lo que se manda a un amigo que se va a Bolonia es la lista. Y
 * evita de un plumazo la pregunta incómoda: un sitio se comparte hacia fuera del
 * círculo, y ahí no puede viajar quién dijo qué.
 *
 * No pasa por el modelo. El plan de la semana sí lo hace, porque allí hay que
 * convertir filas en un párrafo que se lea; aquí el contenido ya son frases
 * escritas por personas, y meter un modelo entre medias solo introduciría la
 * posibilidad de que cambie lo que alguien escribió.
 */
export function textoDelLugar(instantanea, lugar) {
  const lineas = [nombreDeLugar(lugar)];
  for (const grupo of porClase(instantanea, lugar.id)) {
    lineas.push('', grupo.clase.nombre);
    lineas.push(...lineasDeGrupo(grupo));
  }
  return lineas.join('\n');
}

/** Las líneas de un grupo, tal como se mandan. En la lista de la compra lo
 *  tachado va con su visto delante, que es como se lee de un vistazo qué falta;
 *  en las demás clases va el detalle detrás de una raya. */
function lineasDeGrupo({ clase, apuntes }) {
  if (clase.lista) {
    return apuntes.map((a) => `${estaHecho(a) ? '✔' : '·'} ${a.titulo}`);
  }
  return apuntes.map((a) => `· ${a.titulo}${a.detalle ? ` — ${a.detalle}` : ''}`);
}

/**
 * Solo la lista de la compra, para mandarla suelta.
 *
 * Es el caso de verdad: «mándame lo que hay que llevar» se pide entero y sin lo
 * demás, y quien lo recibe no quiere saber a qué playa se sube ni qué súper
 * cierra los domingos.
 */
export function textoDeLaLista(instantanea, lugar, claseId) {
  const grupo = porClase(instantanea, lugar.id).find((g) => g.clase.id === claseId);
  if (!grupo) return nombreDeLugar(lugar);
  return [`${grupo.clase.nombre} · ${nombreDeLugar(lugar)}`, '', ...lineasDeGrupo(grupo)].join('\n');
}

/**
 * Un apunte suelto, y aquí sí va todo: el detalle entero y el hilo con los
 * nombres.
 *
 * Es lo contrario de lo que hace el sitio completo, y la diferencia no es un
 * descuido: compartir un sitio es mandar una guía, y compartir un apunte es
 * mandar **una conversación** —«mira lo que dice Marta de subir con el carro»—.
 * Sin los comentarios sería la mitad del mensaje, y sin los nombres no se
 * entendería quién contesta a quién.
 */
export function textoDelApunte(vista, apunte) {
  const lugar = lugarPorId(vista.datos, apunte.lugar_id);
  const lineas = [`📍 ${apunte.titulo}`];
  if (lugar) lineas.push(nombreDeLugar(lugar));
  if (apunte.detalle) lineas.push('', apunte.detalle);

  const comentarios = vista.comentariosDe('apunte', apunte.id);
  if (comentarios.length) {
    lineas.push('');
    for (const comentario of comentarios) {
      lineas.push(`${vista.nombre(comentario.autor_id)}: ${comentario.texto}`);
    }
  }
  return lineas.join('\n');
}

/**
 * Lo que la hoja de compartir dice antes de enviar, compuesto con lo que hay.
 *
 * Es la primera vez que un comentario sale del círculo de casa. No hay nada que
 * impedir —lo comparte una persona a mano, sabiendo lo que manda—, pero nadie
 * tiene que descubrir después lo que acaba de enviar.
 */
export function pistaDeCompartirApunte(vista, apunte) {
  const cuantos = vista.comentariosDe('apunte', apunte.id).length;
  if (!cuantos) return 'Con su descripción';
  return `Con su descripción y ${cuantos === 1 ? 'el comentario' : `los ${cuantos} comentarios`}`;
}
