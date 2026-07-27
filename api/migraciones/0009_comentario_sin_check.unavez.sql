-- El `CHECK` de `comentario` se retira, y la lista de tipos pasa al código.
--
-- La tabla nació con `CHECK (objeto_tipo IN ('idea', 'regalo', 'evento'))`, que
-- repite en SQL una regla que ya viven dos capas: `comentables.js` en el Worker
-- y `modelo.py` en el generador del plan. Repetirla no saldría caro si fuera
-- gratis cambiarla, pero **un `CHECK` de SQLite no se altera**: cada módulo
-- nuevo que admita comentarios obliga a rehacer la tabla entera. Se rehace una
-- vez, sin `CHECK`, y no vuelve a hacer falta.
--
-- **De un solo uso**, y por eso el `.unavez.sql`: copia filas y tira la tabla
-- vieja. Repetirla sobre la tabla ya migrada volvería a copiarlo todo a una
-- tabla nueva —inofensivo pero absurdo— y, si algo fallara a mitad, dejaría el
-- registro sin su hilo de comentarios. Se pide por su nombre al desplegar.

PRAGMA foreign_keys = OFF;

CREATE TABLE comentario_sin_check (
  id             TEXT PRIMARY KEY,
  objeto_tipo    TEXT NOT NULL,
  objeto_id      TEXT NOT NULL,
  autor_id       TEXT NOT NULL REFERENCES persona(id),
  texto          TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO comentario_sin_check
  (id, objeto_tipo, objeto_id, autor_id, texto, activo, creado_en, actualizado_en)
SELECT id, objeto_tipo, objeto_id, autor_id, texto, activo, creado_en, actualizado_en
  FROM comentario;

DROP TABLE comentario;

ALTER TABLE comentario_sin_check RENAME TO comentario;

CREATE INDEX IF NOT EXISTS idx_comentario_objeto ON comentario(objeto_tipo, objeto_id);

PRAGMA foreign_keys = ON;
