-- El enlace de cada uno para conectar Claude por MCP.
--
-- Una dirección que es a la vez la credencial: quien la pega en Claude habla
-- con la agenda como esa persona, con lo que ella ve y lo que ella puede
-- escribir, ni más ni menos (`api/src/mcp/enlace.js`).
--
-- **Aquí no se guarda ningún secreto.** El `id` es la mitad pública del
-- enlace, sacada al azar, y la otra mitad es una firma con la clave del Worker
-- sobre ese `id` y la persona: se recalcula cada vez, para comprobarla y para
-- volver a enseñarle el enlace a su dueño en Ajustes. Quien leyera esta tabla
-- no podría componer ningún enlace.
--
-- Uno vivo por persona: crear otro apaga el anterior, y quitarlo o perder la
-- cuenta también (`restosDeCuenta`). `usado_en` es para que Ajustes pueda decir
-- si Claude ha llegado a conectarse, y se anota como mucho cada diez minutos.
--
-- Corriente y no `.unavez`: se puede repetir sin consecuencias.

CREATE TABLE IF NOT EXISTS enlace_mcp (
  id         TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL REFERENCES persona(id),
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  usado_en   TEXT,
  activo     INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_enlace_mcp_persona ON enlace_mcp(persona_id);
