-- Mejoras: ideas sobre la propia aplicación, apuntadas desde el móvil.
--
-- No se llama `idea` a propósito, aunque sea lo que es en castellano: en esta
-- casa una idea es una idea de regalo, y está en el centro del modelo de
-- ocultación —se esconde a su destinatario, tiene orientaciones, se promueve a
-- regalo—. Una mejora no se esconde a nadie y no se promueve a nada; compartir
-- el nombre habría hecho que cada consulta tuviera que decir de cuál habla.
--
-- Y por eso tampoco pasa por `visible()`: no tiene destinatario, así que no hay
-- de quién ocultarla. La ve quien tiene cuenta, y ya está.
CREATE TABLE IF NOT EXISTS mejora (
  id             TEXT PRIMARY KEY,
  texto          TEXT NOT NULL,
  autor_id       TEXT REFERENCES persona(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT,
  activo         INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_mejora_creado ON mejora (creado_en);
