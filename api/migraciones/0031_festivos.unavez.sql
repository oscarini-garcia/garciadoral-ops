-- Los festivos (specs/propuesta-festivos.html, A1 · B1 · C1 · D3 · E1).
--
-- Un tipo nuevo, «Festivo», para los que se apuntan a mano desde la hoja del
-- plugin; y en `evento_dia`, «Sí hay»: ese día la recurrente va aunque un
-- festivo la dejara sin día. Los oficiales no son filas: salen de
-- `datos/festivos.json`.
--
-- `.unavez` porque lleva `ALTER TABLE`.

INSERT OR IGNORE INTO tipo_evento (id, nombre, emoji, lleva_regalos, orden)
VALUES ('festivo', 'Festivo', '📅', 0, 12);

ALTER TABLE evento_dia ADD COLUMN hay_en_festivo INTEGER NOT NULL DEFAULT 0;
