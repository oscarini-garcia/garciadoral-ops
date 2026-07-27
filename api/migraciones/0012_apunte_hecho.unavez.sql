-- La casilla de los apuntes de «llevar».
--
-- «Llevar» dejó de ser una clase más y pasó a ser lo que de verdad es: una lista
-- de la compra. Una línea, una casilla y una aspa; sin descripción, sin hilo y
-- sin voto. Y una lista de la compra necesita poder tachar.
--
-- Es el único estado de todo el módulo, y no contradice la regla de que aquí no
-- hay estados: «subir a la duna» no se agota al subir, pero la sombrilla o está
-- en el maletero o no está. Lo que se tacha se queda tachado y baja al final, de
-- modo que al volver del viaje se desmarca y la lista sirve otra vez.
--
-- Vale para cualquier clase porque la columna es de la tabla, pero solo «llevar»
-- la enseña: en las otras tres no habría nada que marcar.
--
-- **De un solo uso**, y por eso el `.unavez.sql`: un `ALTER TABLE` falla si la
-- columna ya está. Se pide por su nombre al desplegar.

ALTER TABLE apunte ADD COLUMN hecho INTEGER NOT NULL DEFAULT 0;
