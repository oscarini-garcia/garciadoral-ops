/**
 * Adjuntos de ideas y regalos: qué se acepta y que heredan la visibilidad del
 * objeto al que pertenecen (`api/src/adjuntos.js`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TOPE_POR_OBJETO, adjuntosVisibles, bytesDe, bytesDeBase64, prepararAdjunto,
} from '../src/adjuntos.js';
import { Rechazo } from '../src/portero/errores.js';

const lector = { id: 'ana', rol: 'miembro' };
const visibles = { ideas: [{ id: 'i1' }], regalos: [{ id: 'r1' }] };
const foto = btoa('fotografia de prueba');
const base = { objeto_tipo: 'idea', objeto_id: 'i1', tipo_mime: 'image/jpeg', datos: foto, nombre: 'Foto', ancho: 1600, alto: 1200 };
const opciones = { id: 'a1', ahora: '2026-10-24T10:00:00Z' };

test('prepara la fila con la ficha y los bytes', () => {
  const fila = prepararAdjunto(base, lector, visibles, opciones);
  assert.equal(fila.objeto_id, 'i1');
  assert.equal(fila.autor_id, 'ana');
  assert.equal(fila.tamano, bytesDeBase64(foto));
  assert.equal(fila.ancho, 1600);
});

test('solo a una idea o un regalo que se ve', () => {
  assert.throws(() => prepararAdjunto({ ...base, objeto_tipo: 'evento' }, lector, visibles, opciones), Rechazo);
  assert.throws(() => prepararAdjunto({ ...base, objeto_id: 'oculta' }, lector, visibles, opciones), Rechazo);
  assert.ok(prepararAdjunto({ ...base, objeto_tipo: 'regalo', objeto_id: 'r1' }, lector, visibles, opciones));
});

test('rechaza lo que no es foto ni PDF, lo vacío y lo que no cabe', () => {
  assert.throws(() => prepararAdjunto({ ...base, tipo_mime: 'text/html' }, lector, visibles, opciones), Rechazo);
  assert.throws(() => prepararAdjunto({ ...base, datos: '' }, lector, visibles, opciones), Rechazo);
  assert.throws(() => prepararAdjunto({ ...base, datos: 'no es base64!' }, lector, visibles, opciones), Rechazo);
  assert.throws(() => prepararAdjunto({ ...base, datos: 'A'.repeat(1_700_000) }, lector, visibles, opciones), Rechazo);
  assert.throws(() => prepararAdjunto(base, lector, visibles, { ...opciones, yaHay: TOPE_POR_OBJETO }), Rechazo);
});

test('un adjunto viaja solo si viaja su objeto', () => {
  const adjuntos = [
    { id: 'a1', objeto_tipo: 'idea', objeto_id: 'i1' },
    { id: 'a2', objeto_tipo: 'idea', objeto_id: 'oculta' },
    { id: 'a3', objeto_tipo: 'regalo', objeto_id: 'r1' },
    { id: 'a4', objeto_tipo: 'evento', objeto_id: 'e1' },
  ];
  assert.deepEqual(adjuntosVisibles(adjuntos, visibles).map((a) => a.id), ['a1', 'a3']);
});

test('los bytes vuelven tal cual', () => {
  assert.deepEqual([...bytesDe(btoa('abc'))], [97, 98, 99]);
});
