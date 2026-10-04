/**
 * La receta escrita de un plato: el material y la lectura de la respuesta
 * (specs/propuesta-recurrentes-y-recetas.html, C1).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { componerMaterialDeReceta, interpretarReceta } from '../src/redaccion.js';

test('lee ingredientes, pasos y tiempo', () => {
  const texto = [
    'INGREDIENTES',
    '- 1 calabaza mediana',
    '- 600 g de pavo',
    'PASOS',
    '1. Cocer la calabaza.',
    '2) Triturar.',
    'TIEMPO: 35 minutos',
  ].join('\n');
  assert.deepEqual(interpretarReceta(texto), {
    ingredientes: ['1 calabaza mediana', '600 g de pavo'],
    pasos: ['Cocer la calabaza.', 'Triturar.'],
    tiempo: 35,
  });
});

test('una respuesta sin los dos bloques no es una receta', () => {
  assert.deepEqual(interpretarReceta('No puedo ayudarte con eso.'), { ingredientes: [], pasos: [], tiempo: null });
  assert.deepEqual(interpretarReceta('INGREDIENTES\n- sal'), { ingredientes: [], pasos: [], tiempo: null });
});

test('el material lleva el plato, la casa y cuántos son, y solo para quien tiene cenas', () => {
  const instantanea = {
    cenas: [],
    recetas: [{ id: 'r1', nombre: 'Crema de calabaza', nota: 'Ligera', activo: true }],
    cenas_casa: { cocina: 'Thermomix', dieta: 'Poca grasa' },
    personas: [{ id: 'a', circulo: 'familia' }, { id: 'b', circulo: 'familia' }, { id: 'c', circulo: 'extendida' }],
  };
  const { lineas } = componerMaterialDeReceta(instantanea, 'r1');
  assert.ok(lineas.includes('El plato: Crema de calabaza'));
  assert.ok(lineas.includes('Con qué cocinan: Thermomix'));
  assert.ok(lineas.includes('Son 2 en casa.'));
  assert.deepEqual(componerMaterialDeReceta({ ...instantanea, cenas: undefined }, 'r1').lineas, []);
  assert.deepEqual(componerMaterialDeReceta(instantanea, 'otra').lineas, []);
});
