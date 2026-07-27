-- Sitios: lo que una casa sabe de un lugar y se le olvida cada año.
--
-- Tres tablas y ninguna fila por adelantado. Un sitio es la carpeta —Bolonia,
-- el pueblo, el súper de aquí al lado— y los apuntes cuelgan de él, clasificados
-- por lo que se hace con ellos: llevar, hacer, ir o saber. El voto es una fila
-- por persona, porque lo que se enseña no es un número sino quiénes: con cuatro
-- personas en casa, «MA·OS» dice más que «2».
--
-- El ciclo de vida es el más corto que hay en esta base: creado y borrado. Sin
-- estados, sin fechas y sin archivar. «Subir a la duna» no se agota al subir —el
-- año que viene sigue siendo el mejor plan de allí—, y un visto convertiría la
-- guía en una lista de tareas de un solo verano, que es lo contrario de lo que
-- se quiere guardar.
--
-- Todo esto es del círculo `familia`, como Lío: quien no vive en casa no lo
-- recibe en su instantánea. De ahí sale, gratis, que el módulo no tenga que
-- evaluar nunca la función de visibilidad —se ve entero o no se ve nada—, que es
-- también lo que permite que el voto enseñe iniciales sin delatar a nadie.
--
-- Corriente y no `.unavez`: se puede repetir sin consecuencias.

CREATE TABLE IF NOT EXISTS lugar (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  emoji          TEXT,
  -- Un sitio puede apuntar al viaje del que se habla, y el vínculo vive aquí y
  -- no en el evento, igual que el de la ocasión (`modelo-datos.md` §2.5): así el
  -- evento sigue sin saber que este módulo existe.
  evento_id      TEXT REFERENCES evento(id),
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apunte (
  id             TEXT PRIMARY KEY,
  lugar_id       TEXT NOT NULL REFERENCES lugar(id),
  clase          TEXT NOT NULL DEFAULT 'saber',
  titulo         TEXT NOT NULL,
  -- Lo que casi nunca se escribe y a veces lo es todo: «allí el viento engaña y
  -- se quema todo el mundo el primer día».
  detalle        TEXT,
  autor_id       TEXT REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apunte_lugar ON apunte(lugar_id);

-- El voto no lleva `CHECK` sobre la clase por lo mismo que se lo quitamos al
-- comentario en la 0009: la lista de clases vive en el código —`sitios.js` y su
-- espejo en el Worker— y un `CHECK` de SQLite no se altera.

-- Un voto es una fila y no un recuento, porque lo que la pantalla enseña son las
-- iniciales de quien votó. El identificador se compone —`voto:<apunte>:<persona>`—
-- por la misma razón que el de un paseo de Lío: el dispositivo marca antes de
-- haber visto ninguna fila y tiene que dar con la misma que el servidor. Quitar
-- el voto apaga la bandera; no borra nada.
CREATE TABLE IF NOT EXISTS voto (
  id             TEXT PRIMARY KEY,
  apunte_id      TEXT NOT NULL REFERENCES apunte(id),
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (apunte_id, persona_id)
);

CREATE INDEX IF NOT EXISTS idx_voto_apunte ON voto(apunte_id);
