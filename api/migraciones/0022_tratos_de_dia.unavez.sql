-- Lo que quedó abierto de los plugins (specs/propuesta-plugins-hojas.html, K1
-- y D4): que cambiar quién lleva o recoge un día suelto pase por un trato, y
-- que el aviso previo pueda sonar desde el servidor.
--
-- `trato_dia` es la propuesta sobre un día concreto de una actividad —«¿llevas
-- tú a Marta a hípica el martes?»—, con la misma forma que `trato_paseo`: quien
-- propone, a quién se le pide, quién lo tenía y quién lo tendría, y un estado
-- que solo cambia el destinatario. Mientras está pendiente el día se queda
-- como estaba; aceptar escribe la fila de `evento_dia` que resulta. Es una
-- tabla y no una clase más de `trato_paseo` porque aquella lleva `CHECK` de
-- turno y de clase que aquí no significan nada, y rehacerla costaba más que
-- una tabla hermana.
--
-- `dispositivo.avisos` es con cuánta antelación quiere cada aparato que se le
-- avise de cada plugin, en JSON —`{"puntuales":"vispera","finde":"semana"}`—.
-- Es del aparato y no de la persona, como decidió la D4, y por eso viaja con
-- el token en el alta de los avisos y no por la cola de cambios: el cron del
-- servidor lo lee para componer «Mañana: …» sin que el teléfono esté despierto.

CREATE TABLE IF NOT EXISTS trato_dia (
  id              TEXT PRIMARY KEY,
  evento_id       TEXT NOT NULL REFERENCES evento(id),
  fecha           TEXT NOT NULL,
  campo           TEXT NOT NULL,
  proponente_id   TEXT NOT NULL REFERENCES persona(id),
  destinatario_id TEXT NOT NULL REFERENCES persona(id),
  previo_id       TEXT REFERENCES persona(id),
  nuevo_id        TEXT REFERENCES persona(id),
  estado          TEXT NOT NULL DEFAULT 'pendiente',
  resuelto_en     TEXT,
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (campo IN ('lleva', 'recoge')),
  CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'caducado'))
);

CREATE INDEX IF NOT EXISTS idx_trato_dia_estado ON trato_dia(estado, fecha);

ALTER TABLE dispositivo ADD COLUMN avisos TEXT;
