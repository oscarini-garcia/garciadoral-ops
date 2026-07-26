-- El género de cada persona, que existe solo para nombrarla bien.
--
-- No es un dato del que la aplicación saque nada más: sirve para elegir entre
-- «mamá» y «papá», o entre «hermana» y «hermano», cuando lo escrito en el
-- parentesco no lo dice —«lóver», o cualquier cosa puesta a mano en «Otro»—.
-- Por eso admite nulo: sin él, la palabra se deduce del propio parentesco, que
-- en castellano casi siempre lleva el género dentro (specs/ux.md §7.1).
--
-- **De un solo uso**, como la de los círculos y por lo mismo: el `ALTER TABLE`
-- falla si la columna ya está, de modo que el bucle que aplica las demás la
-- salta y esta se pide por su nombre al desplegar la API.

PRAGMA foreign_keys = ON;

ALTER TABLE persona ADD COLUMN genero TEXT
  CHECK (genero IS NULL OR genero IN ('f', 'm'));
