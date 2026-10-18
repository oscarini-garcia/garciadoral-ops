/**
 * Quién ve una idea o un regalo, persona a persona
 * (specs/propuesta-regalos-para-mi-y-para-otros.html, C1 · D1), contra SQLite de
 * verdad: la migración que traduce lo ya apuntado sin cambiar lo que ve cada
 * uno, y que cambiar quién ve una idea lo cambia también en sus regalos.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { baseDeVerdad } from './apoyo/d1.js';
import { aplicarCambio } from '../src/repositorio.js';

const MIGRACION = readFileSync(new URL('../migraciones/0032_quien_lo_ve.unavez.sql', import.meta.url), 'utf-8');

function casa() {
  const db = baseDeVerdad();
  const persona = db.sqlite.prepare(
    'INSERT INTO persona (id, nombre, tiene_cuenta, rol, circulo) VALUES (?, ?, ?, ?, ?)',
  );
  persona.run('p-ana', 'Ana', 1, 'administrador', 'familia');
  persona.run('p-oscar', 'Óscar', 1, 'administrador', 'familia');
  persona.run('p-amaya', 'Amaya', 1, 'miembro', 'familia');
  persona.run('p-mariona', 'Mariona', 1, 'miembro', 'familia');
  return db;
}

test('la migración traduce lo ya apuntado sin cambiar lo que ve cada uno', () => {
  const db = casa();
  const idea = db.sqlite.prepare('INSERT INTO idea (id, tipo, titulo, autor_id, para_todos) VALUES (?, ?, ?, ?, ?)');
  idea.run('i-mayores', 'sugerencia', 'Auriculares', 'p-oscar', 0);
  idea.run('i-todos', 'sugerencia', 'Pulsera', 'p-ana', 1);
  idea.run('i-nina', 'sugerencia', 'Libro', 'p-amaya', 0);
  idea.run('i-deseo', 'deseo', 'Botas', 'p-mariona', 0);
  db.sqlite.exec('UPDATE idea SET ven = NULL');
  db.sqlite.exec(MIGRACION.replace(/ALTER TABLE[^;]+;/g, ''));

  const ven = (id) => {
    const valor = db.filas('SELECT ven FROM idea WHERE id = ?', id)[0].ven;
    return valor === null ? null : JSON.parse(valor).sort();
  };
  assert.deepEqual(ven('i-mayores'), ['p-ana', 'p-oscar']);
  assert.deepEqual(ven('i-todos'), ['p-amaya', 'p-ana', 'p-mariona', 'p-oscar']);
  assert.deepEqual(ven('i-nina'), ['p-amaya', 'p-ana', 'p-mariona', 'p-oscar']);
  assert.equal(ven('i-deseo'), null);
});

test('cambiar quién ve una idea lo cambia también en sus regalos', async () => {
  const db = casa();
  const oscar = { id: 'p-oscar', rol: 'administrador', tiene_cuenta: 1 };
  db.sqlite.prepare("INSERT INTO ocasion (id, nombre, fecha, autor_id) VALUES ('o1', 'Navidad', '2026-12-25', 'p-oscar')").run();
  await aplicarCambio(db, oscar, {
    tipo: 'idea', id: 'i1',
    campos: { tipo: 'sugerencia', titulo: 'Auriculares', estado: 'activa', autor_id: 'p-oscar', activa: 1, ven: ['p-oscar', 'p-ana'], orientaciones: [{ persona_id: 'p-mariona' }] },
  });
  await aplicarCambio(db, oscar, {
    tipo: 'regalo', id: 'g1',
    campos: { ocasion_id: 'o1', idea_id: 'i1', destinatario_principal_id: 'p-mariona', estado: 'pendiente', autor_id: 'p-oscar', activo: 1, ven: ['p-oscar', 'p-ana'] },
  });
  await aplicarCambio(db, oscar, { tipo: 'idea', id: 'i1', campos: { ven: ['p-oscar', 'p-ana', 'p-amaya'] } });
  assert.deepEqual(JSON.parse(db.filas("SELECT ven FROM regalo WHERE id = 'g1'")[0].ven), ['p-oscar', 'p-ana', 'p-amaya']);
});
