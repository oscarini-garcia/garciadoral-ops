-- Los avisos que suenan en el teléfono: por dónde se alcanza a un aparato.
--
-- Va en `dispositivo` y no en una tabla nueva porque esa fila ya existe y ya
-- significa exactamente esto —qué aparato es y de quién—; lo único que le
-- faltaba era por dónde llamarlo. Y el token es del aparato y no de la persona:
-- la misma persona puede tener dos teléfonos, y el mismo teléfono ha podido
-- cambiar de manos.
--
-- `token_push` vacío significa apagado, y es lo mismo que dice el interruptor de
-- Ajustes: no hay una segunda columna de «quiere avisos». Un token que APNs
-- rechaza por muerto se borra aquí, y el aparato lo vuelve a dar solo la próxima
-- vez que abra la aplicación con el interruptor puesto.
--
-- `.unavez` porque lleva `ALTER TABLE`: repetirla falla con la columna ya
-- puesta.

ALTER TABLE dispositivo ADD COLUMN token_push TEXT;

ALTER TABLE dispositivo ADD COLUMN token_push_desde TEXT;
