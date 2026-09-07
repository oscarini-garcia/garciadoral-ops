-- Lo decidido en specs/propuesta-ocho-cosas.html que pide columna.
--
-- C4: quién lleva o recoge puede ser alguien que no es de casa —la abuela, el
-- autobús, el padre de una amiga—, escrito como texto y no como ficha. En el
-- cuadro de la actividad va dentro de `evento.extra`, que es JSON; en el día
-- suelto y en el trato hace falta una columna, porque `lleva_id`, `recoge_id`
-- y `nuevo_id` son claves a `persona` y un nombre libre no cabe en ellas.
-- Vacío es «no es otro»; lleno, `lleva_id` va a NULL y manda el texto.
--
-- B1 —cada día a su hora— no pide columna: va en `evento.extra.horario`.

ALTER TABLE evento_dia ADD COLUMN lleva_otro TEXT;
ALTER TABLE evento_dia ADD COLUMN recoge_otro TEXT;
ALTER TABLE trato_dia ADD COLUMN nuevo_otro TEXT;
