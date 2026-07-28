/**
 * Los avisos remotos: a quién se le hace sonar el teléfono y qué le dice.
 *
 * Lo que se comprueba aquí es lo que, si falla, falla callando. Un aviso de más
 * es peor que un fallo ruidoso: cuenta algo a quien el sistema entero está
 * construido para ocultárselo, y no hay pantalla donde se vea el error. Por eso
 * la prueba central no es que los avisos salgan, sino que **no salgan** cuando
 * su objeto no está en la instantánea de quien lo recibiría.
 *
 * Lo demás es igual de silencioso: avisarse a uno mismo de lo que acaba de
 * hacer, sonar dos veces por reenviar la cola, o sonar dos veces por una sola
 * propuesta aceptada, que escribe dos filas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { avisosDe, CATEGORIA_CAMBIO, CATEGORIA_CORRECCION } from '../src/avisos.js';

const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida' };

function registro(extra = {}) {
  return {
    personas: [OSCAR, MARTA, ABUELA],
    atributos_persona: [],
    categorias: [{ id: 'general', nombre: 'General', regla: 'publica' }],
    acceso_categoria: [],
    etiquetas: [],
    tipos_evento: [],
    eventos: [],
    ideas: [],
    ocasiones: [],
    regalos: [],
    comentarios: [],
    conflictos: [],
    lugares: [],
    apuntes: [],
    votos: [],
    vistos: [],
    // El 30 de julio de 2026 es jueves: es la fecha con la que se comprueba que
    // la frase se compone en palabras y sin correrse de día.
    lio_cuadro: { manana: [null, null, null, 'p-marta', null, null, null], noche: Array(7).fill(null) },
    paseos: [],
    tratos_paseo: [],
    ...extra,
  };
}

const trato = (extra = {}) => ({
  id: 't-1',
  fecha: '2026-07-30',
  turno: 'manana',
  clase: 'cambio',
  proponente_id: 'p-marta',
  destinatario_id: 'p-oscar',
  asignado_previo_id: 'p-marta',
  estado: 'pendiente',
  activo: true,
  ...extra,
});

const cambio = (extra = {}) => ({ tipo: 'trato_paseo', id: 't-1', novedad: true, ...extra });

// -------------------------------------------------------------------- Lío --

test('pedir un cambio avisa a quien tiene que contestarlo, y a nadie más', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato()] }), MARTA, [cambio()]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].para, 'p-oscar');
  assert.equal(avisos[0].titulo, '🐾 Marta te pide que saques a Lío');
  assert.equal(avisos[0].cuerpo, 'El jueves 30 de julio por la mañana.');
  assert.equal(avisos[0].categoria, CATEGORIA_CAMBIO);
});

test('ofrecerse a sacarlo no es lo mismo que pedirlo', () => {
  // Quien propone no es quien lo tenía: se está ofreciendo, no pidiendo.
  const propuesta = trato({ proponente_id: 'p-oscar', destinatario_id: 'p-marta', asignado_previo_id: 'p-marta' });
  const avisos = avisosDe(registro({ tratos_paseo: [propuesta] }), OSCAR, [cambio()]);
  assert.equal(avisos[0].para, 'p-marta');
  assert.equal(avisos[0].titulo, '🐾 Óscar se ofrece a sacar a Lío');
  assert.equal(avisos[0].cuerpo, 'El jueves 30 de julio por la mañana, que te toca a ti.');
});

test('una corrección lleva sus propios botones', () => {
  const propuesta = trato({ clase: 'correccion', proponente_id: 'p-oscar', destinatario_id: 'p-marta' });
  const avisos = avisosDe(registro({ tratos_paseo: [propuesta] }), OSCAR, [cambio()]);
  assert.equal(avisos[0].categoria, CATEGORIA_CORRECCION);
  assert.equal(avisos[0].titulo, '🐾 Óscar dice que sacó a Lío');
});

test('contestar avisa a quien lo pidió, que es el que esperaba', () => {
  const aceptado = trato({ estado: 'aceptado' });
  const avisos = avisosDe(registro({ tratos_paseo: [aceptado] }), OSCAR, [cambio()]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].para, 'p-marta');
  assert.equal(avisos[0].titulo, '🐾 Óscar acepta');
  // El turno pasa a quien no lo tenía.
  assert.match(avisos[0].cuerpo, /es de Óscar/);
  // Y ya no lleva botones: no hay nada que contestar.
  assert.equal(avisos[0].categoria, undefined);
});

test('decir que no también se avisa', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato({ estado: 'rechazado' })] }), OSCAR, [cambio()]);
  assert.equal(avisos[0].para, 'p-marta');
  assert.equal(avisos[0].titulo, '🐾 Óscar no puede');
});

test('retirar lo que uno pidió se avisa, o el otro contestaría a un fantasma', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato({ activo: 0 })] }), MARTA, [cambio()]);
  assert.equal(avisos[0].para, 'p-oscar');
  assert.equal(avisos[0].titulo, '🐾 Marta retira lo que te pidió');
});

test('caducar no avisa a nadie: no lo ha hecho ninguna persona', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato({ estado: 'caducado' })] }), MARTA, [cambio()]);
  assert.deepEqual(avisos, []);
});

test('a uno no se le avisa de lo que acaba de hacer', () => {
  // La misma propuesta, contestada por su propio proponente: no hay a quién
  // avisar, porque el único destinatario del aviso es quien lo provocó.
  const avisos = avisosDe(registro({ tratos_paseo: [trato({ estado: 'aceptado' })] }), MARTA, [cambio()]);
  assert.deepEqual(avisos, []);
});

test('quien no vive en casa no recibe avisos de Lío', () => {
  // La abuela tiene cuenta y podría ser destinataria de una fila, pero Lío no
  // viaja a su instantánea: el aviso se cae por la misma regla que los datos.
  const propuesta = trato({ destinatario_id: 'p-abuela' });
  const avisos = avisosDe(registro({ tratos_paseo: [propuesta] }), MARTA, [cambio()]);
  assert.deepEqual(avisos, []);
});

test('reenviar la cola no hace sonar el teléfono dos veces', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato()] }), MARTA, [cambio({ novedad: false })]);
  assert.deepEqual(avisos, []);
});

// ------------------------------------------------------- Los dos atajos --

test('sacarlo por otro se le dice a quien le tocaba', () => {
  const paseo = {
    id: 'lio:2026-07-30:manana',
    fecha: '2026-07-30',
    turno: 'manana',
    asignado_id: 'p-marta',
    hecho_por_id: 'p-oscar',
    activo: true,
  };
  const avisos = avisosDe(registro({ paseos: [paseo] }), OSCAR, [{ tipo: 'paseo', id: paseo.id, novedad: true }]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].para, 'p-marta');
  assert.equal(avisos[0].titulo, '🐾 Óscar ha sacado a Lío por ti');
});

test('coger el turno de otro se le dice a quien lo tenía previsto', () => {
  // Sin fila, el turno era de quien dice el cuadro: el jueves por la mañana, de
  // Marta. Óscar se lo queda y escribe la fila.
  const paseo = {
    id: 'lio:2026-07-30:manana', fecha: '2026-07-30', turno: 'manana', asignado_id: 'p-oscar', activo: true,
  };
  const avisos = avisosDe(registro({ paseos: [paseo] }), OSCAR, [{ tipo: 'paseo', id: paseo.id, novedad: true }]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].para, 'p-marta');
  assert.equal(avisos[0].titulo, '🐾 Óscar se queda tu turno');
});

test('aceptar una propuesta suena una vez, aunque escriba dos filas', () => {
  // `resolverPropuesta` guarda el trato y el paseo en el mismo lote. Sin el
  // resguardo, el segundo sonaría otra vez con otras palabras.
  const aceptado = trato({ estado: 'aceptado' });
  const paseo = {
    id: 'lio:2026-07-30:manana', fecha: '2026-07-30', turno: 'manana', asignado_id: 'p-oscar', activo: true,
  };
  const avisos = avisosDe(
    registro({ tratos_paseo: [aceptado], paseos: [paseo] }),
    OSCAR,
    [cambio(), { tipo: 'paseo', id: paseo.id, novedad: true }],
  );
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].titulo, '🐾 Óscar acepta');
});

// ------------------------------------------------------------ Comentarios --

const EVENTO = {
  id: 'e-1', titulo: 'Dentista', inicio: '2026-07-30T09:00', autor_id: 'p-oscar', activo: true,
};

const comentario = (extra = {}) => ({
  id: 'c-2',
  objeto_tipo: 'evento',
  objeto_id: 'e-1',
  autor_id: 'p-marta',
  texto: 'Lo llevo yo',
  creado_en: '2026-07-28T10:00:00.000Z',
  activo: true,
  ...extra,
});

test('un comentario avisa a quien creó la cosa, con su texto entero', () => {
  const datos = registro({ eventos: [EVENTO], comentarios: [comentario()] });
  const avisos = avisosDe(datos, MARTA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].para, 'p-oscar');
  assert.equal(avisos[0].titulo, '📅 Marta, en «Dentista»');
  assert.equal(avisos[0].cuerpo, 'Lo llevo yo');
});

test('y a quien ya había dicho algo en el hilo, menos a quien escribe', () => {
  const previo = comentario({ id: 'c-1', autor_id: 'p-abuela', texto: '¿A qué hora?' });
  const datos = registro({ eventos: [EVENTO], comentarios: [previo, comentario()] });
  const avisos = avisosDe(datos, MARTA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]);
  assert.deepEqual(avisos.map((a) => a.para).sort(), ['p-abuela', 'p-oscar']);
});

/**
 * La prueba que sostiene todo lo demás.
 *
 * Marta comentó una idea cuando podía verla. Después esa idea se orientó a ella
 * —alguien decidió regalársela—, y desde ese momento deja de estar en su
 * instantánea. Si el aviso se compusiera solo con «quién ha participado en el
 * hilo», el siguiente comentario le contaría por el teléfono que existe un
 * regalo para ella y de qué va.
 */
test('no se avisa de un hilo cuyo objeto ha dejado de ser visible', () => {
  const idea = {
    id: 'i-1',
    tipo: 'idea',
    titulo: 'Una bici',
    autor_id: 'p-oscar',
    activa: true,
    orientaciones: [{ persona_id: 'p-marta' }],
  };
  const suyo = comentario({
    id: 'c-1', objeto_tipo: 'idea', objeto_id: 'i-1', autor_id: 'p-marta', texto: 'Me gusta',
  });
  const nuevo = comentario({
    id: 'c-2', objeto_tipo: 'idea', objeto_id: 'i-1', autor_id: 'p-abuela', texto: 'La compro yo',
  });

  const datos = registro({ ideas: [idea], comentarios: [suyo, nuevo] });
  const avisos = avisosDe(datos, ABUELA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]);

  assert.equal(avisos.some((a) => a.para === 'p-marta'), false);
  assert.deepEqual(avisos.map((a) => a.para), ['p-oscar']);
});

test('un comentario borrado no avisa de nada', () => {
  const datos = registro({ eventos: [EVENTO], comentarios: [comentario({ activo: false })] });
  assert.deepEqual(avisosDe(datos, MARTA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]), []);
});

// ------------------------------------------------------------------ Varios --

test('lo que ningún módulo reconoce no avisa, y no revienta', () => {
  const datos = registro({ eventos: [EVENTO] });
  assert.deepEqual(avisosDe(datos, MARTA, [{ tipo: 'evento', id: 'e-1', novedad: true }]), []);
  assert.deepEqual(avisosDe(datos, MARTA, []), []);
});

test('lo de Lío es urgente y los comentarios no, que es lo que lo mantiene creíble', () => {
  const peticion = avisosDe(registro({ tratos_paseo: [trato()] }), MARTA, [cambio()]);
  assert.equal(peticion[0].urgente, true);

  // Una corrección habla del pasado por definición: llegar tarde no le quita
  // nada. Marcarla de urgente sería gastar la interrupción en lo que no la pide.
  const correccion = trato({ clase: 'correccion', proponente_id: 'p-oscar', destinatario_id: 'p-marta' });
  assert.equal(avisosDe(registro({ tratos_paseo: [correccion] }), OSCAR, [cambio()])[0].urgente, false);

  const datos = registro({ eventos: [EVENTO], comentarios: [comentario()] });
  const comentarios = avisosDe(datos, MARTA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]);
  assert.equal(comentarios[0].urgente, undefined);
});

test('el globo cuenta lo que espera respuesta, y viaja en todos los avisos', () => {
  const otra = trato({ id: 't-2', fecha: '2026-07-31', destinatario_id: 'p-oscar' });
  const avisos = avisosDe(registro({ tratos_paseo: [trato(), otra] }), MARTA, [cambio()]);
  assert.equal(avisos[0].para, 'p-oscar');
  assert.equal(avisos[0].globo, 2);

  // Contestada una, el globo del que la pidió no cuenta la del otro: cuenta las
  // suyas, que son ninguna.
  const resuelta = avisosDe(
    registro({ tratos_paseo: [trato({ estado: 'aceptado' }), otra] }),
    OSCAR,
    [cambio()],
  );
  assert.equal(resuelta[0].para, 'p-marta');
  assert.equal(resuelta[0].globo, 0);
});

test('un comentario también lleva el globo, o dejaría puesto el de antes', () => {
  const datos = registro({
    eventos: [EVENTO], comentarios: [comentario()], tratos_paseo: [trato()],
  });
  const avisos = avisosDe(datos, MARTA, [{ tipo: 'comentario', id: 'c-2', novedad: true }]);
  assert.equal(avisos[0].para, 'p-oscar');
  assert.equal(avisos[0].globo, 1);
});

test('cada aviso lleva a dónde ir al tocarlo', () => {
  const avisos = avisosDe(registro({ tratos_paseo: [trato()] }), MARTA, [cambio()]);
  assert.deepEqual(avisos[0].datos, {
    tipo: 'lio', fecha: '2026-07-30', turno: 'manana', trato: 't-1',
  });
});
