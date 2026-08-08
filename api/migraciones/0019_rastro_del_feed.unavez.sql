-- Qué pasó la última vez que se leyó un calendario externo.
--
-- `ultima_sincronizacion` guarda la fecha de la última que salió **bien**, y esa
-- era toda la información que había. Con eso, un feed que se lee correctamente y
-- viene vacío y otro que lleva semanas dando 404 se ven exactamente igual desde
-- Ajustes: una fecha. Y desde la agenda se ven igual que si el vuelo no
-- existiera.
--
-- Son dos columnas y no una porque contestan a preguntas distintas: `ultimo_
-- intento` es cuándo se probó —salga como salga— y `ultimo_resultado` es qué
-- salió. Un intento reciente con un resultado de error dice «el cron corre y
-- falla»; un intento viejo dice «el cron no está corriendo».
ALTER TABLE calendario_externo ADD COLUMN ultimo_intento TEXT;
ALTER TABLE calendario_externo ADD COLUMN ultimo_resultado TEXT;
