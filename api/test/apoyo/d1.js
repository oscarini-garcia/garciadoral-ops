/**
 * Una base D1 de verdad para las pruebas: SQLite en memoria con todas las
 * migraciones de `api/migraciones/` aplicadas en orden.
 *
 * Las demás pruebas de rutas usan una base de mentira que contesta por
 * fragmentos de SQL, y eso basta para comprobar qué se le pide a la base. Lo que
 * no comprueba es que lo pedido funcione: una columna mal escrita, un `NOT NULL`
 * sin valor o una clave ajena rota pasan sin ruido. Aquí corren el SQL del Worker
 * y el de las migraciones contra el mismo motor que hay debajo de D1.
 *
 * Imita lo que de D1 usa el Worker —`prepare`, `bind`, `first`, `all`, `run` y
 * `batch` en una transacción— y nada más. Como D1, convierte los booleanos en 1 y
 * 0 y no admite `undefined`.
 *
 * Vive en `apoyo/` y no en un `.test.js` por lo mismo que `redaccion.js`: el
 * patrón de `node --test` lo ejecutaría como si tuviera pruebas.
 */

import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRACIONES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migraciones');

function valorDe(valor) {
  if (valor === undefined) throw new TypeError('D1_TYPE_ERROR: undefined no se puede enlazar');
  if (typeof valor === 'boolean') return valor ? 1 : 0;
  return valor;
}

export function baseDeVerdad() {
  const sqlite = new DatabaseSync(':memory:');
  for (const fichero of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(resolve(MIGRACIONES, fichero), 'utf-8'));
  }

  const sentencia = (sql, args) => ({
    sql,
    args,
    first: async () => {
      const fila = sqlite.prepare(sql).get(...args.map(valorDe));
      return fila ? { ...fila } : null;
    },
    all: async () => ({ results: sqlite.prepare(sql).all(...args.map(valorDe)).map((fila) => ({ ...fila })) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args.map(valorDe)).changes) } }),
    ejecutar: () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args.map(valorDe)).changes) } }),
  });

  return {
    sqlite,
    prepare(sql) {
      return { ...sentencia(sql, []), bind: (...args) => sentencia(sql, args) };
    },
    async batch(sentencias) {
      sqlite.exec('BEGIN');
      try {
        const resultados = sentencias.map((s) => s.ejecutar());
        sqlite.exec('COMMIT');
        return resultados;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    /** Atajo para las pruebas: las filas de una consulta, ya como objetos normales. */
    filas(sql, ...args) {
      return sqlite.prepare(sql).all(...args.map(valorDe)).map((fila) => ({ ...fila }));
    },
  };
}
