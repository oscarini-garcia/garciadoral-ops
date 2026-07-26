-- Se retira «envuelto» de los estados de un regalo.
--
-- Eran cuatro —pendiente, comprado, envuelto, entregado— y uno de ellos no lo
-- marcaba nadie: envolver es un rato de una tarde de diciembre, no un estado que
-- alguien vaya a mantener al día en el teléfono. Su único efecto real era añadir
-- una opción más a un desplegable que contesta a una pregunta de sí o no —¿está
-- comprado?—, y una pantalla que enseña una distinción que nadie sostiene acaba
-- enseñando datos falsos.
--
-- Quedan tres: **pendiente**, que en pantalla se llama «Por comprar»;
-- **comprado**, que es «Listo»; y **entregado**, que es el que cierra el ciclo
-- —pasa la idea a cerrada y manda el regalo al histórico de quien lo recibió—
-- (specs/modelo-datos.md §4).

PRAGMA foreign_keys = ON;

-- Lo que estuviera envuelto estaba comprado. Es una conversión y no una
-- pérdida: el estado retirado era posterior a la compra.
UPDATE regalo SET estado = 'comprado', actualizado_en = datetime('now')
 WHERE estado = 'envuelto';

-- El `CHECK` de la tabla sigue admitiendo los cuatro valores a propósito.
-- Estrecharlo obliga en SQLite a reconstruir la tabla entera —crear, copiar,
-- borrar y renombrar, con las claves foráneas de `regalo` colgando—, y el
-- premio sería impedir un valor que ya no escribe nadie: ni la aplicación, que
-- solo ofrece tres, ni el Worker, que no toca estados. El riesgo está de un
-- lado y el beneficio de ninguno.
--
-- Se puede repetir sin consecuencias, así que no lleva `.unavez`: la segunda vez
-- no encuentra ninguna fila que convertir.
