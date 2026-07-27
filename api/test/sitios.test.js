/**
 * Sitios es de la casa, y lo visto es de cada uno.
 *
 * Las dos reglas se cumplen en el mismo sitio y por el mismo motivo que las de
 * Lío: el recorte ocurre **antes de transmitir**, de modo que lo que no se puede
 * ver no llega al dispositivo y la aplicación no tiene que volver a decidirlo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { componerInstantanea } from '../src/filtrado.js';
import { comentariosVisibles, esComentable } from '../src/comentables.js';

const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador', circulo: 'familia' };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia' };
const TIA = { id: 'p-tia', nombre: 'la tía', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida' };

function registro(extra = {}) {
  return {
    personas: [OSCAR, MARTA, TIA],
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
    lugares: [{ id: 'l1', nombre: 'Bolonia', activo: true }],
    apuntes: [{ id: 'a1', lugar_id: 'l1', clase: 'llevar', titulo: 'Sombrilla', activo: true }],
    votos: [{ id: 'voto:a1:p-marta', apunte_id: 'a1', persona_id: 'p-marta', activo: true }],
    vistos: [],
    ...extra,
  };
}

test('quien vive en casa recibe los sitios enteros', () => {
  const r = registro();
  const deOscar = componerInstantanea(r, OSCAR);
  assert.equal(deOscar.lugares.length, 1);
  assert.equal(deOscar.apuntes.length, 1);
  assert.equal(deOscar.votos.length, 1);
});

test('para quien no vive en casa el módulo no existe', () => {
  const r = registro();
  const deLaTia = componerInstantanea(r, TIA);
  assert.deepEqual(deLaTia.lugares, [], 'no recibe los sitios');
  assert.deepEqual(deLaTia.apuntes, [], 'ni los apuntes');
  assert.deepEqual(deLaTia.votos, [], 'ni quién ha votado qué');
});

test('el comentario de un apunte hereda que el apunte es de la casa', () => {
  const r = registro({
    comentarios: [
      { id: 'c1', objeto_tipo: 'apunte', objeto_id: 'a1', autor_id: 'p-marta', texto: 'Allí no hay sombra' },
    ],
  });
  assert.equal(componerInstantanea(r, OSCAR).comentarios.length, 1);
  assert.deepEqual(
    componerInstantanea(r, TIA).comentarios,
    [],
    'sin el apunte tampoco viaja lo que se dijo sobre él',
  );
});

test('lo visto solo llega a su dueño', () => {
  const r = registro({
    vistos: [
      { id: 'visto:apunte:a1:p-oscar', persona_id: 'p-oscar', objeto_tipo: 'apunte', objeto_id: 'a1', hasta: '2026-07-27T10:00:00Z' },
      { id: 'visto:apunte:a1:p-marta', persona_id: 'p-marta', objeto_tipo: 'apunte', objeto_id: 'a1', hasta: '2026-07-26T10:00:00Z' },
    ],
  });
  const deOscar = componerInstantanea(r, OSCAR);
  assert.equal(deOscar.vistos.length, 1);
  assert.equal(deOscar.vistos[0].persona_id, 'p-oscar', 'qué ha mirado cada uno no es asunto de nadie más');
});

test('el registro de comentables es la única lista que hay', () => {
  assert.ok(esComentable('apunte'));
  assert.ok(esComentable('evento') && esComentable('idea') && esComentable('regalo'));
  assert.equal(esComentable('persona'), false);

  // Un tipo que este lector no recibe entero no transmite sus comentarios, y un
  // tipo desconocido tampoco: en los dos casos lo prudente es no mandarlo.
  const comentarios = [
    { id: 'c1', objeto_tipo: 'apunte', objeto_id: 'a1' },
    { id: 'c2', objeto_tipo: 'inventado', objeto_id: 'x' },
  ];
  assert.deepEqual(
    comentariosVisibles(comentarios, { apunte: new Set(['a1']) }).map((c) => c.id),
    ['c1'],
  );
});
