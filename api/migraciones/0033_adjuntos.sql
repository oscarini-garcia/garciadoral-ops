-- Adjuntos de una idea o de un regalo: sobre todo fotos hechas con la cámara
-- o elegidas del carrete, y algún PDF. Se guardan aquí mismo, en base64, ya
-- reducidos en el teléfono —una foto a 1600 puntos de lado y en JPEG—, para no
-- añadir un almacén aparte a una casa de cuatro. La instantánea solo lleva la
-- ficha de cada adjunto; los bytes se piden aparte, de uno en uno
-- (`GET /api/adjunto`), y heredan la visibilidad del objeto al que pertenecen,
-- como un comentario.
CREATE TABLE IF NOT EXISTS adjunto (
  id             TEXT PRIMARY KEY,
  objeto_tipo    TEXT NOT NULL,
  objeto_id      TEXT NOT NULL,
  nombre         TEXT,
  tipo_mime      TEXT NOT NULL,
  tamano         INTEGER,
  ancho          INTEGER,
  alto           INTEGER,
  datos          TEXT NOT NULL,
  miniatura      TEXT,
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS adjunto_objeto ON adjunto (objeto_tipo, objeto_id);
