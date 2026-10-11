/**
 * Los festivos en el Worker (specs/propuesta-festivos.html, A1 · B1 · E1).
 *
 * La tabla por año manda, la regla solo cubre lo que la tabla aún no tiene y
 * lo dice; el registro trae la lista del lugar de la casa; quien queda fuera
 * del círculo del plugin no la recibe; y una recurrente no tiene día en
 * festivo con las mismas excepciones que la aplicación y el plan.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  festivoQueAnula, festivosDelRegistro, festivosOficiales, lugarDe, pascua,
} from '../src/festivos.js';
import { normalizarPlugin } from '../src/plugins.js';
import { componerInstantanea } from '../src/filtrado.js';
import { leerRegistro } from '../src/repositorio.js';
import { derivadosDe, recordatoriosDe } from '../src/recordatorios.js';
import { baseDeVerdad } from './apoyo/d1.js';

test('la Pascua y la regla de reserva', () => {
  assert.equal(pascua(2026), '2026-04-05');
  assert.equal(pascua(2027), '2027-03-28');
  const { dias, porRegla } = festivosOficiales('barcelona', [2027]);
  const segunda = dias.find((d) => d.nombre === 'Segunda Pascua');
  assert.deepEqual(segunda, { fecha: '2027-05-17', nombre: 'Segunda Pascua', ambito: 'barcelona', de: 'regla' });
  assert.deepEqual(porRegla.map((p) => `${p.anio}:${p.ambito}`), ['2027:barcelona'], 'Cataluña 2027 ya está en la tabla');
  assert.equal(dias.find((d) => d.fecha === '2027-11-01').de, 'tabla');
});

test('la tabla de 2026 es la publicada: doce de Cataluña y dos de Barcelona', () => {
  const { dias, porRegla } = festivosOficiales('barcelona', [2026]);
  assert.equal(porRegla.length, 0);
  assert.equal(dias.length, 14);
  assert.equal(dias.find((d) => d.fecha === '2026-10-12').nombre, 'Fiesta Nacional');
  assert.equal(dias.find((d) => d.fecha === '2026-09-24').nombre, 'La Mercè');
  assert.equal(dias.some((d) => d.fecha === '2026-11-01'), false, 'en 2026 cae en domingo y no está en el calendario');
});

test('el lugar es de la casa, y solo vale uno que la tabla conozca', () => {
  assert.equal(lugarDe({}), 'barcelona');
  assert.equal(lugarDe({ festivos: { lugar: 'madrid' } }), 'barcelona');
  assert.deepEqual(normalizarPlugin({ lugar: 'barcelona', circulo: 'familia' }), { circulo: 'familia', lugar: 'barcelona' });
  assert.deepEqual(normalizarPlugin({ lugar: 'madrid' }), {});
  const registro = festivosDelRegistro({}, new Date('2026-10-11T10:00:00Z'));
  assert.equal(registro.lugar, 'barcelona');
  assert.ok(registro.dias.some((d) => d.fecha === '2025-12-26'), 'trae el año pasado');
  assert.ok(registro.dias.some((d) => d.fecha === '2027-12-25'), 'y el que viene');
  assert.deepEqual(registro.por_regla.map((p) => p.anio), [2027]);
});

test('el registro trae los festivos, y fuera del círculo del plugin no llegan', async () => {
  const db = baseDeVerdad();
  db.sqlite.prepare("INSERT INTO persona (id, nombre, tiene_cuenta, rol, circulo) VALUES ('p-ana', 'Ana', 1, 'administrador', 'familia')").run();
  db.sqlite.prepare("INSERT INTO persona (id, nombre, tiene_cuenta, rol, circulo) VALUES ('p-tia', 'Carmen', 1, 'miembro', 'extendida')").run();
  assert.equal(db.filas("SELECT id FROM tipo_evento WHERE id = 'festivo'").length, 1);

  const registro = await leerRegistro(db);
  assert.ok(registro.festivos.dias.length > 20);
  const ana = registro.personas.find((p) => p.id === 'p-ana');
  const tia = registro.personas.find((p) => p.id === 'p-tia');
  assert.ok(componerInstantanea(registro, ana).festivos.dias.length > 20);
  assert.ok(componerInstantanea(registro, tia).festivos.dias.length > 20, 'de origen llegan a todos');

  const cerrado = { ...registro, plugins: { festivos: { circulo: 'familia' } } };
  assert.equal(componerInstantanea(cerrado, tia).festivos.dias.length, 0);
  assert.ok(componerInstantanea(cerrado, ana).festivos.dias.length > 20);
});

test('una recurrente no tiene día en festivo, salvo las excepciones', () => {
  const academia = {
    id: 'e-academia', plugin_id: 'extraescolar', extra: { dias: [0] },
    participantes: [{ persona_id: 'p-marta', rol: 'protagonista' }],
  };
  const registro = {
    festivos: { dias: [{ fecha: '2026-10-12', nombre: 'Fiesta Nacional' }] },
    eventos: [{
      id: 'e-sin-cole', plugin_id: 'festivo', titulo: 'Libre disposición', inicio: '2026-10-16', activo: 1,
      participantes: [{ persona_id: 'p-marta', rol: 'protagonista' }],
    }],
    dias_evento: [],
  };
  assert.equal(festivoQueAnula(registro, academia, '2026-10-12'), 'Fiesta Nacional');
  assert.equal(festivoQueAnula(registro, academia, '2026-10-16'), 'Libre disposición');
  assert.equal(festivoQueAnula(registro, { ...academia, participantes: [{ persona_id: 'p-lucia', rol: 'protagonista' }] }, '2026-10-16'), null);
  assert.equal(festivoQueAnula(registro, { ...academia, extra: { en_festivos: 'si' } }, '2026-10-12'), null);
  assert.equal(festivoQueAnula(registro, { ...academia, plugin_id: null }, '2026-10-12'), null, 'solo las recurrentes');
  const devuelta = { ...registro, dias_evento: [{ evento_id: 'e-academia', fecha: '2026-10-12', hay_en_festivo: true, activo: true }] };
  assert.equal(festivoQueAnula(devuelta, academia, '2026-10-12'), null);
});

test('los festivos se cuentan como derivados y una recurrente en festivo no avisa', () => {
  const persona = { id: 'p-ana', nombre: 'Ana', tiene_cuenta: 1, rol: 'administrador', circulo: 'familia', activa: 1 };
  const registro = {
    personas: [persona], eventos: [{
      id: 'e-academia', titulo: 'Academia', plugin_id: 'extraescolar', origen: 'manual', tipo_id: 'recurrente',
      inicio: '2026-09-07T17:00:00', repeticion: 'semanal', extra: { dias: [0] }, activo: 1,
      participantes: [{ persona_id: 'p-ana', rol: 'protagonista' }],
    }],
    ideas: [], regalos: [], ocasiones: [], comentarios: [], categorias: [], tipos_evento: [],
    dias_evento: [], plugins: {},
    festivos: { lugar: 'barcelona', dias: [{ fecha: '2026-10-12', nombre: 'Fiesta Nacional' }], por_regla: [] },
  };
  const instantanea = componerInstantanea(registro, persona);
  assert.ok(derivadosDe(instantanea).some((e) => e.id === 'derivado:festivo:2026-10-12'));
  const avisos = recordatoriosDe(registro, { persona_id: 'p-ana', avisos: { extraescolares: 'vispera' } }, '2026-10-11');
  assert.equal(avisos.some((a) => a.datos.evento === 'e-academia'), false);
  const otroLunes = recordatoriosDe(registro, { persona_id: 'p-ana', avisos: { extraescolares: 'vispera' } }, '2026-10-18');
  assert.equal(otroLunes.some((a) => a.datos.evento === 'e-academia'), true);
});
