/**
 * Mejoras: ideas sobre la propia aplicación.
 *
 * La pieza es pequeña y lo que hay que comprobar también, pero es exactamente lo
 * que la separa de una idea de regalo: **una mejora no tiene destinatario, así
 * que no se le oculta a nadie**. Llamarla «idea» habría hecho fácil que un día
 * alguien le colara la función de visibilidad por parecido; que la instantánea
 * las pase enteras a los cuatro es la prueba que impide esa confusión.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { componerInstantanea } from '../src/filtrado.js';
import { TOPE_DE_MEJORA, aplicarCambio } from '../src/repositorio.js';

const ANA = { id: 'p-ana', nombre: 'Ana', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: false, rol: null, circulo: 'extendida' };

const registro = (mejoras) => ({
  personas: [ANA, MARTA, ABUELA],
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
  mejoras,
});

const MEJORAS = [
  { id: 'm1', texto: 'Que la semana empiece en lunes', autor_id: 'p-ana', creado_en: '2026-07-31', activo: true },
  { id: 'm2', texto: 'Un botón para duplicar un evento', autor_id: 'p-marta', creado_en: '2026-07-30', activo: true },
];

test('una mejora la ven todos, la haya escrito quien la haya escrito', () => {
  const r = registro(MEJORAS);

  // La escribió Ana y Marta la ve; la escribió Marta y Ana la ve. Es justo lo
  // contrario de una idea de regalo, que se le oculta a su destinatario.
  assert.deepEqual(componerInstantanea(r, ANA).mejoras.map((m) => m.id), ['m1', 'm2']);
  assert.deepEqual(componerInstantanea(r, MARTA).mejoras.map((m) => m.id), ['m1', 'm2']);
});

test('quien no tiene cuenta no recibe instantánea, y por tanto tampoco mejoras', () => {
  const r = registro(MEJORAS);
  const suya = componerInstantanea(r, ABUELA);

  assert.deepEqual(suya.mejoras || [], []);
});

test('sin la tabla todavía aplicada, la instantánea no se cae', () => {
  const r = registro(undefined);
  delete r.mejoras;

  assert.deepEqual(componerInstantanea(r, ANA).mejoras, []);
});

/**
 * Y el tope de longitud, que es lo único de esta pieza que el Worker tiene que
 * defender solo.
 *
 * El dispositivo corta antes de guardar, pero el que escribe no siempre es esta
 * pantalla, y sin tope un pegado largo —un correo entero, un volcado— entra en
 * la instantánea de los cuatro y se descarga en cada sincronización, para
 * siempre. Se comprueba contra `aplicarCambio` y no contra la constante para
 * que la prueba falle si algún día el `if` deja de estar en el camino.
 */
/**
 * Base de mentira: apunta lo que se escribiría en vez de escribirlo.
 *
 * `first()` devuelve `null` —no hay fila anterior, que es el caso de una mejora
 * recién apuntada— y `run()` deja constancia, que es lo que permite comprobar
 * que un rechazo no llega a tocar la base.
 */
function baseFalsa(escrituras) {
  return {
    prepare(sql) {
      return {
        bind: (...args) => ({
          first: async () => null,
          run: async () => { escrituras.push({ sql, args }); return { success: true }; },
          all: async () => ({ results: [] }),
        }),
      };
    },
  };
}

test('una mejora más larga que el tope se rechaza, y una del tamaño justo entra', async () => {
  const escrituras = [];
  const db = baseFalsa(escrituras);

  const larga = await aplicarCambio(db, ANA, {
    tipo: 'mejora', id: 'm-larga', campos: { texto: 'a'.repeat(TOPE_DE_MEJORA + 1) },
  });
  assert.equal(larga.aplicado, false);
  assert.match(larga.motivo, /2000 caracteres/);
  assert.equal(escrituras.length, 0);

  const justa = await aplicarCambio(db, ANA, {
    tipo: 'mejora', id: 'm-justa', campos: { texto: 'a'.repeat(TOPE_DE_MEJORA) },
  });
  assert.equal(justa.aplicado, true);
});
