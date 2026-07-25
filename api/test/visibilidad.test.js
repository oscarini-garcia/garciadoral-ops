/**
 * La función de visibilidad del servidor debe coincidir exactamente con la de
 * `scripts/agenda/visibilidad.py`. Son dos implementaciones de la misma regla, y
 * una divergencia entre ellas significaría que el plan semanal y la aplicación
 * ocultan cosas distintas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { visible, visiblePublicamente } from '../src/visibilidad.js';
import { componerInstantanea } from '../src/filtrado.js';

const ANA = { id: 'p-ana', nombre: 'Ana', tiene_cuenta: true, rol: 'administrador' };
const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro' };
const LUCIA = { id: 'p-lucia', nombre: 'Lucía', tiene_cuenta: true, rol: 'miembro' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: false, rol: null };

function registro(extra = {}) {
  return {
    personas: [ANA, OSCAR, MARTA, LUCIA, ABUELA],
    atributos_persona: [],
    categorias: [
      { id: 'general', nombre: 'General', regla: 'publica' },
      { id: 'coordinacion', nombre: 'Coordinación', regla: 'privada' },
      { id: 'reservada', nombre: 'Reservada', regla: 'restringida' },
    ],
    acceso_categoria: [{ categoria_id: 'reservada', persona_id: 'p-marta' }],
    etiquetas: [{ id: 'e-adolescente', nombre: 'adolescente' }],
    tipos_evento: [{ id: 'otro', nombre: 'Otro', emoji: '📌', lleva_regalos: false }],
    eventos: [],
    ideas: [],
    ocasiones: [],
    regalos: [],
    comentarios: [],
    conflictos: [],
    ...extra,
  };
}

test('quien no tiene cuenta no ve nada', () => {
  const r = registro({ ideas: [{ id: 'i1', titulo: 'Libro', autor_id: 'p-ana' }] });
  assert.equal(visible(r, r.ideas[0], 'idea', ABUELA), false);
  assert.equal(visible(r, r.ideas[0], 'idea', null), false);
});

test('la idea orientada a una persona queda oculta para ella', () => {
  const r = registro({
    ideas: [{ id: 'i1', titulo: 'Botas', autor_id: 'p-ana', orientaciones: [{ persona_id: 'p-marta' }] }],
  });
  assert.equal(visible(r, r.ideas[0], 'idea', MARTA), false);
  assert.equal(visible(r, r.ideas[0], 'idea', LUCIA), true);
  assert.equal(visible(r, r.ideas[0], 'idea', ANA), true);
});

test('la ocultación no exceptúa a los administradores', () => {
  const r = registro({
    ideas: [{ id: 'i1', titulo: 'Reloj', autor_id: 'p-oscar', orientaciones: [{ persona_id: 'p-ana' }] }],
  });
  assert.equal(visible(r, r.ideas[0], 'idea', ANA), false);
});

test('la ocultación alcanza a los co-destinatarios', () => {
  const r = registro({
    regalos: [{
      id: 'rg', ocasion_id: 'oc', destinatario_principal_id: 'p-marta',
      compartido: true, codestinatarios: ['p-lucia'],
    }],
  });
  assert.equal(visible(r, r.regalos[0], 'regalo', MARTA), false);
  assert.equal(visible(r, r.regalos[0], 'regalo', LUCIA), false);
  assert.equal(visible(r, r.regalos[0], 'regalo', OSCAR), true);
});

test('un destinatario sin cuenta no activa ocultación alguna', () => {
  const r = registro({
    ideas: [{ id: 'i1', titulo: 'Manta', autor_id: 'p-ana', orientaciones: [{ persona_id: 'p-abuela' }] }],
  });
  for (const observador of [ANA, OSCAR, MARTA, LUCIA]) {
    assert.equal(visible(r, r.ideas[0], 'idea', observador), true);
  }
});

test('las etiquetas clasifican pero no protegen', () => {
  const r = registro({
    ideas: [{ id: 'i1', titulo: 'Altavoz', autor_id: 'p-ana', orientaciones: [{ etiqueta_id: 'e-adolescente' }] }],
  });
  assert.equal(visible(r, r.ideas[0], 'idea', MARTA), true);
});

test('la categoría privada es solo para administradores', () => {
  const r = registro({
    eventos: [{ id: 'ev', titulo: 'Preparar la fiesta', categoria_id: 'coordinacion' }],
  });
  assert.equal(visible(r, r.eventos[0], 'evento', ANA), true);
  assert.equal(visible(r, r.eventos[0], 'evento', MARTA), false);
});

test('la categoría restringida exige figurar en la lista de acceso', () => {
  const r = registro({ ideas: [{ id: 'i1', titulo: 'Sorpresa', autor_id: 'p-ana', categoria_id: 'reservada' }] });
  assert.equal(visible(r, r.ideas[0], 'idea', MARTA), true);
  assert.equal(visible(r, r.ideas[0], 'idea', LUCIA), false);
  assert.equal(visible(r, r.ideas[0], 'idea', ANA), false, 'ni siquiera un administrador entra sin acceso');
});

test('el deseo es visible para su autor aunque figure como destinatario', () => {
  const r = registro({
    ideas: [{
      id: 'i1', tipo: 'deseo', titulo: 'Auriculares', autor_id: 'p-marta',
      orientaciones: [{ persona_id: 'p-marta' }],
    }],
  });
  assert.equal(visible(r, r.ideas[0], 'idea', MARTA), true);
  assert.equal(visible(r, r.ideas[0], 'idea', ANA), true);
});

test('la vista pública deja fuera lo reservado y toda la dimensión de regalos', () => {
  const r = registro({
    eventos: [
      { id: 'ev-publico', titulo: 'Comida' },
      { id: 'ev-reservado', titulo: 'Preparar la fiesta', categoria_id: 'coordinacion' },
    ],
    ideas: [{ id: 'i1', titulo: 'Libro', autor_id: 'p-ana' }],
  });
  assert.equal(visiblePublicamente(r, r.eventos[0], 'evento'), true);
  assert.equal(visiblePublicamente(r, r.eventos[1], 'evento'), false);
  assert.equal(visiblePublicamente(r, r.ideas[0], 'idea'), false);
});

// ---------------------------------------------------------------------------

test('la instantánea no transmite lo oculto ni la categoría que lo contiene', () => {
  const r = registro({
    eventos: [
      { id: 'ev-publico', titulo: 'Comida' },
      { id: 'ev-reservado', titulo: 'Preparar la fiesta', categoria_id: 'coordinacion' },
    ],
    ideas: [{ id: 'i1', titulo: 'Botas', autor_id: 'p-ana', orientaciones: [{ persona_id: 'p-marta' }] }],
    ocasiones: [{ id: 'oc', nombre: 'Cumpleaños', presupuestos: [{ persona_id: 'p-marta', importe: 150 }] }],
    comentarios: [{ id: 'c1', objeto_tipo: 'idea', objeto_id: 'i1', autor_id: 'p-oscar', texto: 'Talla 39' }],
  });

  const deMarta = componerInstantanea(r, MARTA);
  assert.deepEqual(deMarta.eventos.map((e) => e.id), ['ev-publico']);
  assert.deepEqual(deMarta.ideas, []);
  assert.deepEqual(deMarta.comentarios, [], 'el comentario hereda la visibilidad de su idea');
  assert.equal(
    deMarta.categorias.some((c) => c.id === 'coordinacion'),
    false,
    'la existencia misma de la categoría es información',
  );
  assert.deepEqual(deMarta.ocasiones[0].presupuestos, [], 'el panel de presupuesto es de administradores');

  const deAna = componerInstantanea(r, ANA);
  assert.equal(deAna.eventos.length, 2);
  assert.equal(deAna.ideas.length, 1);
  assert.equal(deAna.comentarios.length, 1);
  assert.equal(deAna.ocasiones[0].presupuestos.length, 1);
});
