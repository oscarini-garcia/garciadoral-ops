-- La configuración de la redacción con IA, y el contador que le pone freno.
--
-- Vive en el servidor y no en el dispositivo por una razón sencilla: la clave
-- de Anthropic es una credencial de pago del hogar. Si estuviera en el
-- teléfono, cada administrador tendría una copia, cada copia sería un sitio del
-- que puede escaparse, y la llamada tendría que salir del navegador, que
-- exigiría además una cabecera que la deja a la vista de cualquiera que abra
-- las herramientas de desarrollo.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS configuracion (
  -- Espacio de nombres por punto: `ia.clave`, `ia.modelo`, `ia.instruccion`.
  clave           TEXT PRIMARY KEY,
  valor           TEXT NOT NULL,
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_por TEXT REFERENCES persona(id)
);

-- Cuántas redacciones ha pedido cada persona en cada minuto.
--
-- Sin esto, `/api/redactar` es una API de pago abierta a cualquiera que tenga
-- una sesión: un bucle en la consola del navegador gasta la cuenta del hogar en
-- una tarde. Se cuenta por minuto porque el uso legítimo es de una o dos
-- redacciones seguidas, nunca de decenas.
CREATE TABLE IF NOT EXISTS redaccion_uso (
  persona_id TEXT NOT NULL REFERENCES persona(id),
  -- Minuto en punto, «2026-07-26T10:35». Las ventanas viejas se purgan al
  -- escribir, de modo que la tabla no crece.
  ventana    TEXT NOT NULL,
  cuenta     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (persona_id, ventana)
);
