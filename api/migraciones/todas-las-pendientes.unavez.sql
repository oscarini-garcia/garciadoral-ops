-- Las cinco migraciones pendientes, en un solo fichero y de una sentada.
--
-- No es una migración nueva: es **la copia literal** de las cinco que quedan por
-- aplicar, pegadas en su orden. Existe para que desplegar no sean dos casillas y
-- cinco pasadas de `wrangler`, sino un nombre escrito una vez. Las numeradas
-- siguen siendo la verdad; `tests/test_migraciones.py` comprueba que lo que hay
-- aquí es palabra por palabra lo que hay en ellas.
--
-- **Va con `.unavez` aunque cuatro de las cinco se puedan repetir**, y esa es la
-- única decisión de este fichero. Cuatro llevan `CREATE TABLE IF NOT EXISTS` o un
-- `UPDATE` que la segunda vez no encuentra nada; la quinta —la `0009`— rehace la
-- tabla `comentario` para quitarle el `CHECK`, y eso es copiar filas, tirar la
-- tabla vieja y renombrar. Repetirlo termina en el mismo sitio, pero pasa por un
-- momento en el que los comentarios existen en una sola copia: si algo se cayera
-- justo ahí, el hogar se quedaría sin su hilo. Un paquete vale lo que valga su
-- pieza más delicada, así que este se pide por su nombre, a conciencia y una vez.
--
-- Al desplegar la API: escribe este nombre en el campo de la migración de un solo
-- uso y **deja sin marcar la casilla de las migraciones corrientes**. Marcarla no
-- rompe nada —volvería a pasar las cuatro repetibles, que es inofensivo—, pero no
-- hace falta.
--
-- Cuando esté aplicado, este fichero sobra: bórralo. Lo que cuenta la historia
-- son las numeradas.

-- ═══ 0007_estado_regalo.sql ════════════════════════════════════════════

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
--
-- El `CHECK` de la tabla sigue admitiendo los cuatro valores a propósito.
-- Estrecharlo obliga en SQLite a reconstruir la tabla entera —crear, copiar,
-- borrar y renombrar, con las claves foráneas de `regalo` colgando—, y el
-- premio sería impedir un valor que ya no escribe nadie: ni la aplicación, que
-- solo ofrece tres, ni el Worker, que no toca estados. El riesgo está de un
-- lado y el beneficio de ninguno.
--
-- Se puede repetir sin consecuencias, así que no lleva `.unavez`: la segunda vez
-- no encuentra ninguna fila que convertir. Por eso mismo **el fichero termina en
-- una sentencia y no en comentarios**: se vuelve a ejecutar en cada despliegue
-- de la API, y lo que queda detrás del último `;` se lo lleva `wrangler` a un
-- aviso —«leftover buffer from sql.ingest»— que saldría siempre y que no avisa
-- de nada.

PRAGMA foreign_keys = ON;

-- Lo que estuviera envuelto estaba comprado. Es una conversión y no una
-- pérdida: el estado retirado era posterior a la compra.
UPDATE regalo SET estado = 'comprado', actualizado_en = datetime('now')
 WHERE estado = 'envuelto';

-- ═══ 0008_lio.sql ══════════════════════════════════════════════════════

-- Lío: los turnos de paseo, y el trato que los cambia de dueño.
--
-- Dos tablas y ninguna fila por adelantado. El cuadro semanal —quién saca al
-- perro cada día por la mañana y por la noche— vive en `configuracion`, bajo la
-- clave `lio.cuadro`, y de él se derivan los turnos de cualquier día que se
-- mire. Guardar 730 filas al año para decir lo que cabe en catorce casillas
-- sería escribir el calendario entero por adelantado.
--
-- `paseo` aparece cuando pasa algo que el cuadro no sabe: alguien marca que lo
-- sacó, o se acuerda un cambio para ese día. Y una vez escrito ya no se deriva
-- nunca más, que es lo que hace que cambiar el cuadro cambie el futuro sin
-- reescribir el pasado.
--
-- El identificador es determinista —`lio:2026-07-27:manana`— y no un UUID: el
-- dispositivo tiene que poder componerlo sin haber visto la fila, porque marca
-- primero y sincroniza después.

CREATE TABLE IF NOT EXISTS paseo (
  id             TEXT PRIMARY KEY,
  fecha          TEXT NOT NULL,
  turno          TEXT NOT NULL,
  asignado_id    TEXT REFERENCES persona(id),
  hecho_por_id   TEXT REFERENCES persona(id),
  hecho_en       TEXT,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (turno IN ('manana', 'noche')),
  UNIQUE (fecha, turno)
);

CREATE INDEX IF NOT EXISTS idx_paseo_fecha ON paseo(fecha);

-- El trato: una propuesta sobre un turno que no vale hasta que la acepta el
-- otro. Sirve para las dos cosas, que en el modelo son la misma:
--
--   `cambio`     · me toca y no puedo, ¿lo sacas tú? Aceptado, el turno pasa a
--                  ser suyo ese día.
--   `correccion` · lo saqué yo y le tocaba a otro. Aceptado, la marca queda a
--                  nombre de quien lo sacó.
--
-- `asignado_previo_id` es a lo que se vuelve si dice que no. Sin él, un rechazo
-- dejaría el turno en el aire, que es peor que no haberlo pedido.
CREATE TABLE IF NOT EXISTS trato_paseo (
  id                 TEXT PRIMARY KEY,
  fecha              TEXT NOT NULL,
  turno              TEXT NOT NULL,
  clase              TEXT NOT NULL,
  proponente_id      TEXT NOT NULL REFERENCES persona(id),
  destinatario_id    TEXT NOT NULL REFERENCES persona(id),
  asignado_previo_id TEXT REFERENCES persona(id),
  estado             TEXT NOT NULL DEFAULT 'pendiente',
  resuelto_en        TEXT,
  activo             INTEGER NOT NULL DEFAULT 1,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en     TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (turno IN ('manana', 'noche')),
  CHECK (clase IN ('cambio', 'correccion')),
  CHECK (estado IN ('pendiente', 'aceptado', 'rechazado', 'caducado'))
);

CREATE INDEX IF NOT EXISTS idx_trato_paseo_estado ON trato_paseo(estado, fecha);

-- ═══ 0009_comentario_sin_check.unavez.sql ══════════════════════════════

-- El `CHECK` de `comentario` se retira, y la lista de tipos pasa al código.
--
-- La tabla nació con `CHECK (objeto_tipo IN ('idea', 'regalo', 'evento'))`, que
-- repite en SQL una regla que ya viven dos capas: `comentables.js` en el Worker
-- y `modelo.py` en el generador del plan. Repetirla no saldría caro si fuera
-- gratis cambiarla, pero **un `CHECK` de SQLite no se altera**: cada módulo
-- nuevo que admita comentarios obliga a rehacer la tabla entera. Se rehace una
-- vez, sin `CHECK`, y no vuelve a hacer falta.
--
-- **De un solo uso**, y por eso el `.unavez.sql`: copia filas y tira la tabla
-- vieja. Repetirla sobre la tabla ya migrada volvería a copiarlo todo a una
-- tabla nueva —inofensivo pero absurdo— y, si algo fallara a mitad, dejaría el
-- registro sin su hilo de comentarios. Se pide por su nombre al desplegar.

PRAGMA foreign_keys = OFF;

CREATE TABLE comentario_sin_check (
  id             TEXT PRIMARY KEY,
  objeto_tipo    TEXT NOT NULL,
  objeto_id      TEXT NOT NULL,
  autor_id       TEXT NOT NULL REFERENCES persona(id),
  texto          TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO comentario_sin_check
  (id, objeto_tipo, objeto_id, autor_id, texto, activo, creado_en, actualizado_en)
SELECT id, objeto_tipo, objeto_id, autor_id, texto, activo, creado_en, actualizado_en
  FROM comentario;

DROP TABLE comentario;

ALTER TABLE comentario_sin_check RENAME TO comentario;

CREATE INDEX IF NOT EXISTS idx_comentario_objeto ON comentario(objeto_tipo, objeto_id);

PRAGMA foreign_keys = ON;

-- ═══ 0010_sitios.sql ═══════════════════════════════════════════════════

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

-- ═══ 0011_visto.sql ════════════════════════════════════════════════════

-- La marca de hasta cuándo se ha mirado cada cosa.
--
-- Es lo que separa un comentario nuevo de uno ya leído, y de ahí salen las dos
-- cosas que lo dicen: la raya de «sin leer» dentro del hilo y el renglón del
-- sobre de avisos.
--
-- **Viaja, y no se queda en el dispositivo.** Mientras la marca era pasiva
-- —leer— guardarla en local era defendible, con dos costuras aceptadas: un móvil
-- nuevo enseña todo como sin leer, y leer en el iPad no apaga el punto del
-- iPhone. Pero el sobre permite **descartar**, y un descarte no es pasivo: es un
-- acto. Un acto que se deshace solo al abrir el otro aparato no es un acto, es
-- una sugerencia, y una bandeja deja de ser de fiar la segunda vez que pasa.
--
-- Guarda **un momento y no un booleano**, que es lo que permite que un aviso
-- descartado vuelva cuando llega un comentario posterior: descartar significa
-- «ya lo he visto», no «no me avises más de esto».
--
-- El identificador se compone —`visto:comentario:ap-17:p-oscar`— por la misma
-- razón que el del voto y el del paseo: se escribe desde el dispositivo antes de
-- haber visto ninguna fila.
--
-- Y hereda la visibilidad sin hacer nada: una fila apunta a un objeto que su
-- dueño ya podía ver, porque es él quien la escribió al mirarlo. El Worker solo
-- le manda a cada uno las suyas.
--
-- Corriente y no `.unavez`: se puede repetir sin consecuencias.

CREATE TABLE IF NOT EXISTS visto (
  id             TEXT PRIMARY KEY,
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  objeto_tipo    TEXT NOT NULL,
  objeto_id      TEXT NOT NULL,
  hasta          TEXT NOT NULL,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (persona_id, objeto_tipo, objeto_id)
);

CREATE INDEX IF NOT EXISTS idx_visto_persona ON visto(persona_id);
