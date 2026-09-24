-- Cenas: el recetario de la casa y lo que se cena cada noche.
--
-- Lo decidido está al pie de `specs/propuesta-cenas.html` (A4 · B1 · C1 · D1 ·
-- E1 · F1). Dos tablas y ninguna fila por adelantado.
--
-- Una receta es lo que se puede volver a cenar: nombre, cómo se hace —plancha,
-- horno, olla—, cuánto tarda, unas etiquetas de dieta y una nota. La escribe
-- la IA al elegir una propuesta, o uno mismo.
--
-- Una cena es una noche. Enlaza una receta o lleva texto suelto —«pizza,
-- pedida», «fuera, en casa de la abuela»—, para que apuntar lo que fue no
-- obligue a crear nada. Y puede llevar aparte lo que cenan las niñas, que a
-- veces no es lo mismo, con la misma forma: receta o texto. El veredicto
-- —repetir o no más— es lo que hace que la sugerencia aprenda.
--
-- El identificador de una cena se compone —`cena:<fecha>`— por la misma razón
-- que el de un paseo de Lío: el dispositivo escribe la noche antes de haber
-- visto ninguna fila y tiene que dar con la misma que el servidor.
--
-- Con qué se cocina y qué dieta se sigue no van aquí: son tres casillas de
-- `configuracion` (`cenas.cocina`, `cenas.dieta`, `cenas.dieta_ninas`).
--
-- Todo esto es del círculo `familia`, como Lío y Sitios.
--
-- Corriente y no `.unavez`: se puede repetir sin consecuencias.

CREATE TABLE IF NOT EXISTS receta (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  como           TEXT,
  tiempo         INTEGER,
  etiquetas      TEXT,
  nota           TEXT,
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cena (
  id              TEXT PRIMARY KEY,
  fecha           TEXT NOT NULL,
  receta_id       TEXT REFERENCES receta(id),
  texto           TEXT,
  ninas_receta_id TEXT REFERENCES receta(id),
  ninas_texto     TEXT,
  veredicto       TEXT,
  autor_id        TEXT REFERENCES persona(id),
  activo          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cena_fecha ON cena(fecha);
