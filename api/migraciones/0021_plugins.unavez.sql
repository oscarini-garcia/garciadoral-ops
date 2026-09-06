-- La agenda como plugins: lo que hacía falta escribir para que cada cosa que
-- cae en un día venga de su propia fuente (specs/propuesta-plugins-agenda.html
-- y specs/propuesta-plugins-hojas.html).
--
-- Cuatro columnas y dos tablas, y ninguna rehace nada de lo que ya hay:
--
--   · `persona.santo` — el día del santo, escrito en la ficha como «MM-DD». Es
--     un dato de la persona como lo es su fecha de nacimiento, y de él se
--     deriva la línea «✨ Santo de Lucía» igual que el cumpleaños se deriva de
--     la otra. Vacío es no tener santo que celebrar.
--   · `evento.plugin_id` — de qué plugin escrito viene un evento: `extraescolar`
--     o `finde`. NULL es lo puntual de siempre. Un plugin escrito sigue siendo
--     un evento porque así el plan de los domingos, la redacción y los
--     comentarios le sirven sin escribir nada dos veces.
--   · `evento.extra` — lo que cada plugin sabe de suyo, en JSON: los días de la
--     semana y el cuadro de llevar y recoger de una actividad; el sitio, la
--     víspera de salida y qué pasa con Lío en una escapada; y la vuelta puesta a
--     mano en un vuelo cuya vuelta no se puede trazar.
--   · `calendario_externo.url_feed` — el enlace de Flighty de cada persona.
--     Es un secreto y se trata como tal: nunca viaja en la instantánea (el
--     Worker lo recorta y manda solo si hay o no hay) y solo se escribe por su
--     ruta propia, no por la cola de cambios.
--
-- `evento_dia` es lo que le pasa a una aparición concreta de un evento que se
-- repite: que ese día no hay hípica, o que ese martes lleva otro. El
-- identificador se compone —`dia:<evento>:<fecha>`— por lo mismo que el de un
-- paseo de Lío: el dispositivo lo escribe antes de haber visto la fila.
--
-- `ausencia` es que alguien no está unos días: se escribe en su ficha, sus
-- turnos de Lío pasan a quien cubra —o a nadie— y la semana lo enseña como una
-- banda. Es la versión del cuadro con fecha de fin que Lío no tenía.

ALTER TABLE persona ADD COLUMN santo TEXT;
ALTER TABLE evento ADD COLUMN plugin_id TEXT;
ALTER TABLE evento ADD COLUMN extra TEXT;
ALTER TABLE calendario_externo ADD COLUMN url_feed TEXT;

CREATE TABLE IF NOT EXISTS evento_dia (
  id             TEXT PRIMARY KEY,
  evento_id      TEXT NOT NULL REFERENCES evento(id),
  fecha          TEXT NOT NULL,
  cancelado      INTEGER NOT NULL DEFAULT 0,
  lleva_id       TEXT REFERENCES persona(id),
  recoge_id      TEXT REFERENCES persona(id),
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (evento_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_evento_dia_evento ON evento_dia(evento_id);

CREATE TABLE IF NOT EXISTS ausencia (
  id             TEXT PRIMARY KEY,
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  desde          TEXT NOT NULL,
  hasta          TEXT NOT NULL,
  cubre_id       TEXT REFERENCES persona(id),
  motivo         TEXT NOT NULL DEFAULT '',
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ausencia_persona ON ausencia(persona_id, desde);
