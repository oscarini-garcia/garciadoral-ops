-- Lo que apunta un administrador, solo para los administradores.
--
-- Decidido como C1 en `specs/propuesta-formularios-fechas-regalos.html`: una
-- idea o un regalo que escribe un administrador no lo ve quien no lo es, salvo
-- que se marque «que lo vean las niñas» —lo que se regala entre todos—. Hasta
-- aquí solo se ocultaba a su destinatario, y un regalo igual para las dos niñas
-- se lo enseñaba a la otra.
--
-- `para_todos` es esa casilla. Cero de origen, así que lo ya apuntado por un
-- administrador deja de verse para las niñas hasta que se marque.
--
-- `.unavez` porque lleva `ALTER TABLE`.

ALTER TABLE idea ADD COLUMN para_todos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE regalo ADD COLUMN para_todos INTEGER NOT NULL DEFAULT 0;
