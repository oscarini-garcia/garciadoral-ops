/**
 * Los festivos en la agenda (specs/propuesta-festivos.html, D3 · E1).
 *
 * Lo que no se ve mirando una sola pantalla: que un festivo oficial sale como
 * un día más del reparto, que una recurrente se queda sin ese día —tachada si
 * se piden las canceladas, fuera si no— y que las tres excepciones funcionan:
 * en festivos sí hay, «Sí hay» ese día, y un festivo de alguien que solo anula
 * lo suyo. Es la misma regla que el Worker y el plan de los domingos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { instanciasEn } from '../publico/js/semana.js';
import { festivoQueAnula } from '../publico/js/festivos.js';

const dia = (iso) => new Date(`${iso}T00:00:00`);

const recurrente = (id, de, extra = {}) => ({
  id, titulo: 'Academia', tipo_id: 'recurrente', plugin_id: 'extraescolar', origen: 'manual',
  inicio: '2026-09-07T17:00:00', repeticion: 'semanal', activo: true,
  extra: { dias: [0], ...extra },
  participantes: [{ persona_id: de, rol: 'protagonista' }],
});

const instantanea = (cambios = {}) => ({
  yo: { id: 'p-ana', circulo: 'familia' },
  personas: [],
  tipos_evento: [],
  festivos: { lugar: 'barcelona', dias: [{ fecha: '2026-10-12', nombre: 'Fiesta Nacional', ambito: 'cataluna', de: 'tabla' }] },
  eventos: [recurrente('e-academia', 'p-marta')],
  dias_evento: [],
  ...cambios,
});

test('el festivo sale en el día y la recurrente se queda sin él', () => {
  const datos = instantanea();
  const lunes = dia('2026-10-12');
  const todas = instanciasEn(datos, lunes, lunes, { conCanceladas: true });
  assert.ok(todas.some((i) => i.evento.id === 'derivado:festivo:2026-10-12'));
  const academia = todas.find((i) => i.evento.id === 'e-academia');
  assert.equal(academia.cancelada, true);
  assert.equal(academia.festivo, 'Fiesta Nacional');

  const vivas = instanciasEn(datos, lunes, lunes);
  assert.equal(vivas.some((i) => i.evento.id === 'e-academia'), false, 'sin pedir las canceladas, no sale');
  assert.equal(instanciasEn(datos, dia('2026-10-19'), dia('2026-10-19')).length, 1, 'el lunes siguiente sí hay');
});

test('en festivos sí hay, o «Sí hay» ese día, y la recurrente va', () => {
  const lunes = dia('2026-10-12');
  const siempre = instantanea({ eventos: [recurrente('e-hipica', 'p-marta', { en_festivos: 'si' })] });
  assert.equal(instanciasEn(siempre, lunes, lunes).some((i) => i.evento.id === 'e-hipica'), true);

  const devuelta = instantanea({
    dias_evento: [{ id: 'dia:e-academia:2026-10-12', evento_id: 'e-academia', fecha: '2026-10-12', cancelado: false, hay_en_festivo: true, activo: true }],
  });
  assert.equal(instanciasEn(devuelta, lunes, lunes).some((i) => i.evento.id === 'e-academia'), true);
});

test('un festivo apuntado para alguien solo anula lo suyo', () => {
  const sinCole = {
    id: 'e-sin-cole', titulo: 'Libre disposición', tipo_id: 'festivo', plugin_id: 'festivo', origen: 'manual',
    inicio: '2026-10-16', jornada_completa: true, repeticion: 'ninguna', activo: true,
    participantes: [{ persona_id: 'p-marta', rol: 'protagonista' }],
  };
  const datos = instantanea({ eventos: [sinCole] });
  assert.equal(festivoQueAnula(datos, recurrente('e-marta', 'p-marta', { dias: [4] }), '2026-10-16'), 'Libre disposición');
  assert.equal(festivoQueAnula(datos, recurrente('e-lucia', 'p-lucia', { dias: [4] }), '2026-10-16'), null);
  const deTodos = instantanea({ eventos: [{ ...sinCole, participantes: [] }] });
  assert.equal(festivoQueAnula(deTodos, recurrente('e-lucia', 'p-lucia', { dias: [4] }), '2026-10-16'), 'Libre disposición');
});
