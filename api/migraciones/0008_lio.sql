-- Lio: los turnos de paseo, y el trato que los cambia de dueño.
--
-- Dos tablas y ninguna fila por adelantado. El cuadro semanal —quién saca al
-- perro cada día por la mañana y por la noche— vive en `configuracion`, bajo la
-- clave `lio.cuadro`, y de él se derivan los turnos de cualquier día que se
-- mire. Guardar 730 filas al año para decir lo que cabe en catorce casillas
-- sería escribir el calendario entero por adelantado.
--
-- `paseo` aparece cuando pasa algo que el cuadro no sabe: alguien marca que lo
-- sacó, o se acuerda un cambio para ese día. Y una vez escrito ya no se deriva
-- nunca más, que es lo que hace que cambiar el cuadro cambie el futuro sin
-- reescribir el pasado.
--
-- El identificador es determinista —`lio:2026-07-27:manana`— y no un UUID: el
-- dispositivo tiene que poder componerlo sin haber visto la fila, porque marca
-- primero y sincroniza después.

CREATE TABLE IF NOT EXISTS paseo (
  id             TEXT PRIMARY KEY,
  fecha          TEXT NOT NULL,
  turno          TEXT NOT NULL,
  asignado_id    TEXT REFERENCES persona(id),
  hecho_por_id   TEXT REFERENCES persona(id),
  hecho_en       TEXT,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (turno IN ('manana', 'noche')),
  UNIQUE (fecha, turno)
);

CREATE INDEX IF NOT EXISTS idx_paseo_fecha ON paseo(fecha);

-- El trato: una propuesta sobre un turno que no vale hasta que la acepta el
-- otro. Sirve para las dos cosas, que en el modelo son la misma:
--
--   `cambio`     · me toca y no puedo, ¿lo sacas tú? Aceptado, el turno pasa a
--                  ser suyo ese día.
--   `correccion` · lo saqué yo y le tocaba a otro. Aceptado, la marca queda a
--                  nombre de quien lo sacó.
--
-- `asignado_previo_id` es a lo que se vuelve si dice que no. Sin él, un rechazo
-- dejaría el turno en el aire, que es peor que no haberlo pedido.
CREATE TABLE IF NOT EXISTS trato_paseo (
  id                 TEXT PRIMARY KEY,
  fecha              TEXT NOT NULL,
  turno              TEXT NOT NULL,
  clase              TEXT NOT NULL,
  proponente_id      TEXT NOT NULL REFERENCES persona(id),
  destinatario_id    TEXT NOT NULL REFERENCES persona(id),
  asignado_previo_id TEXT REFERENCES persona(id),
  estado             TEXT NOT NULL DEFAULT 'pendiente',
  resuelto_en        TEXT,
  activo             INTEGER NOT NULL DEFAULT 1,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (turno IN ('manana', 'noche')),
  CHECK (clase IN ('cambio', 'correccion')),
  CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'caducado'))
);

CREATE INDEX IF NOT EXISTS idx_trato_paseo_estado ON trato_paseo(estado, fecha);
