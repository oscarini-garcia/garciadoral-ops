-- Esquema del registro canónico de la Agenda Familiar.
-- Traduce a SQLite (D1) las entidades de specs/modelo-datos.md §2.
--
-- Convenciones del apartado 1 del documento:
--   · Los identificadores se generan en el dispositivo; aquí se aceptan tal cual.
--   · No hay borrado físico: cada entidad lleva un indicador de actividad.
--   · Toda entidad de contenido lleva autor, creación y última modificación.
--
-- Los cumpleaños no se almacenan: se derivan de persona.fecha_nacimiento en el
-- momento de leer (§7.4), de modo que el dato maestro y su reflejo en la agenda
-- no puedan divergir.

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- Núcleo de personas
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS persona (
  id                  TEXT PRIMARY KEY,
  nombre              TEXT NOT NULL,
  apellidos           TEXT NOT NULL DEFAULT '',
  fecha_nacimiento    TEXT,
  parentesco          TEXT NOT NULL DEFAULT '',
  tiene_cuenta        INTEGER NOT NULL DEFAULT 0,
  identificador_apple TEXT UNIQUE,
  rol                 TEXT,
  activa              INTEGER NOT NULL DEFAULT 1,
  creado_en           TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (rol IS NULL OR rol IN ('administrador', 'miembro')),
  CHECK (tiene_cuenta IN (0, 1)),
  -- Una persona sin cuenta no tiene rol (specs/modelo-datos.md §4).
  CHECK (tiene_cuenta = 1 OR rol IS NULL)
);

CREATE TABLE IF NOT EXISTS atributo_persona (
  id             TEXT PRIMARY KEY,
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  clave          TEXT NOT NULL,
  valor          TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_atributo_persona ON atributo_persona(persona_id);

-- --------------------------------------------------------------------------
-- Clasificación y visibilidad
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS categoria (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  regla          TEXT NOT NULL DEFAULT 'publica',
  orden          INTEGER NOT NULL DEFAULT 0,
  activa         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (regla IN ('publica', 'restringida', 'privada'))
);

CREATE TABLE IF NOT EXISTS acceso_categoria (
  categoria_id TEXT NOT NULL REFERENCES categoria(id),
  persona_id   TEXT NOT NULL REFERENCES persona(id),
  PRIMARY KEY (categoria_id, persona_id)
);

CREATE TABLE IF NOT EXISTS etiqueta (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  activa         INTEGER NOT NULL DEFAULT 1,
  -- La fusión de etiquetas reasigna las referencias y marca la absorbida como
  -- inactiva, dejando aquí a quién se fusionó (specs/modelo-datos.md §2.2).
  fusionada_en   TEXT REFERENCES etiqueta(id),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- --------------------------------------------------------------------------
-- Agenda
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tipo_evento (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  emoji         TEXT NOT NULL DEFAULT '📌',
  lleva_regalos INTEGER NOT NULL DEFAULT 0,
  orden         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS calendario_externo (
  id                    TEXT PRIMARY KEY,
  nombre                TEXT NOT NULL,
  identificador_fuente  TEXT NOT NULL DEFAULT '',
  tipo_evento_id        TEXT NOT NULL REFERENCES tipo_evento(id),
  ultima_sincronizacion TEXT
);

CREATE TABLE IF NOT EXISTS evento (
  id                TEXT PRIMARY KEY,
  titulo            TEXT NOT NULL,
  tipo_id           TEXT NOT NULL REFERENCES tipo_evento(id),
  emoji             TEXT,
  inicio            TEXT NOT NULL,
  fin               TEXT,
  jornada_completa  INTEGER NOT NULL DEFAULT 0,
  ubicacion         TEXT NOT NULL DEFAULT '',
  notas             TEXT NOT NULL DEFAULT '',
  repeticion        TEXT NOT NULL DEFAULT 'ninguna',
  repeticion_hasta  TEXT,
  lleva_regalos     INTEGER,
  categoria_id      TEXT REFERENCES categoria(id),
  origen            TEXT NOT NULL DEFAULT 'manual',
  persona_origen_id TEXT REFERENCES persona(id),
  calendario_id     TEXT REFERENCES calendario_externo(id),
  autor_id          TEXT REFERENCES persona(id),
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en    TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (repeticion IN ('ninguna', 'semanal', 'mensual', 'anual')),
  CHECK (origen IN ('manual', 'derivado', 'importado'))
);

CREATE INDEX IF NOT EXISTS idx_evento_inicio ON evento(inicio);

CREATE TABLE IF NOT EXISTS participante_evento (
  evento_id  TEXT NOT NULL REFERENCES evento(id),
  persona_id TEXT NOT NULL REFERENCES persona(id),
  rol        TEXT NOT NULL DEFAULT 'asistente',
  PRIMARY KEY (evento_id, persona_id),
  CHECK (rol IN ('protagonista', 'asistente'))
);

CREATE TABLE IF NOT EXISTS preferencia_notificacion (
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  evento_id      TEXT REFERENCES evento(id),
  tipo_evento_id TEXT REFERENCES tipo_evento(id),
  recordatorio   INTEGER NOT NULL DEFAULT 1,
  modificaciones INTEGER NOT NULL DEFAULT 0
);

-- --------------------------------------------------------------------------
-- Ideas y deseos
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS idea (
  id              TEXT PRIMARY KEY,
  tipo            TEXT NOT NULL DEFAULT 'sugerencia',
  titulo          TEXT NOT NULL,
  descripcion     TEXT NOT NULL DEFAULT '',
  categoria_id    TEXT REFERENCES categoria(id),
  precio_min      REAL,
  precio_max      REAL,
  enlace          TEXT NOT NULL DEFAULT '',
  establecimiento TEXT NOT NULL DEFAULT '',
  estado          TEXT NOT NULL DEFAULT 'activa',
  autor_id        TEXT NOT NULL REFERENCES persona(id),
  activa          INTEGER NOT NULL DEFAULT 1,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (tipo IN ('sugerencia', 'deseo')),
  CHECK (estado IN ('activa', 'en_curso', 'cerrada', 'descartada'))
);

-- Cada fila referencia exactamente una persona o exactamente una etiqueta,
-- nunca ambas y nunca ninguna (specs/modelo-datos.md §4).
CREATE TABLE IF NOT EXISTS orientacion_idea (
  idea_id     TEXT NOT NULL REFERENCES idea(id),
  persona_id  TEXT REFERENCES persona(id),
  etiqueta_id TEXT REFERENCES etiqueta(id),
  CHECK ((persona_id IS NULL) <> (etiqueta_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_orientacion_idea ON orientacion_idea(idea_id);

-- --------------------------------------------------------------------------
-- Ocasiones y regalos
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ocasion (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  fecha          TEXT NOT NULL,
  estado         TEXT NOT NULL DEFAULT 'abierta',
  -- El vínculo reside en la ocasión, no en el evento: así la creación
  -- automática al asociar el primer regalo no obliga a tocar el evento (§2.5).
  evento_id      TEXT UNIQUE REFERENCES evento(id),
  autor_id       TEXT REFERENCES persona(id),
  activa         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (estado IN ('abierta', 'cerrada'))
);

CREATE TABLE IF NOT EXISTS participante_ocasion (
  ocasion_id TEXT NOT NULL REFERENCES ocasion(id),
  persona_id TEXT NOT NULL REFERENCES persona(id),
  PRIMARY KEY (ocasion_id, persona_id)
);

CREATE TABLE IF NOT EXISTS presupuesto_persona (
  ocasion_id     TEXT NOT NULL REFERENCES ocasion(id),
  persona_id     TEXT NOT NULL REFERENCES persona(id),
  importe        REAL NOT NULL,
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ocasion_id, persona_id)
);

CREATE TABLE IF NOT EXISTS regalo (
  id                        TEXT PRIMARY KEY,
  ocasion_id                TEXT NOT NULL REFERENCES ocasion(id),
  idea_id                   TEXT REFERENCES idea(id),
  destinatario_principal_id TEXT NOT NULL REFERENCES persona(id),
  compartido                INTEGER NOT NULL DEFAULT 0,
  responsable_id            TEXT REFERENCES persona(id),
  coste_real                REAL,
  estado                    TEXT NOT NULL DEFAULT 'pendiente',
  categoria_id              TEXT REFERENCES categoria(id),
  autor_id                  TEXT REFERENCES persona(id),
  activo                    INTEGER NOT NULL DEFAULT 1,
  creado_en                 TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (estado IN ('pendiente', 'comprado', 'envuelto', 'entregado'))
);

CREATE INDEX IF NOT EXISTS idx_regalo_ocasion ON regalo(ocasion_id);

CREATE TABLE IF NOT EXISTS codestinatario_regalo (
  regalo_id  TEXT NOT NULL REFERENCES regalo(id),
  persona_id TEXT NOT NULL REFERENCES persona(id),
  PRIMARY KEY (regalo_id, persona_id)
);

CREATE TABLE IF NOT EXISTS comentario (
  id             TEXT PRIMARY KEY,
  objeto_tipo    TEXT NOT NULL,
  objeto_id      TEXT NOT NULL,
  autor_id       TEXT NOT NULL REFERENCES persona(id),
  texto          TEXT NOT NULL,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (objeto_tipo IN ('idea', 'regalo', 'evento'))
);

CREATE INDEX IF NOT EXISTS idx_comentario_objeto ON comentario(objeto_tipo, objeto_id);

-- --------------------------------------------------------------------------
-- Operación
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS dispositivo (
  id                    TEXT PRIMARY KEY,
  persona_id            TEXT NOT NULL REFERENCES persona(id),
  plataforma            TEXT NOT NULL DEFAULT 'web',
  ultima_sincronizacion TEXT
);

-- Un conflicto en el responsable de compra o en el estado del regalo suele
-- indicar que dos personas están actuando sobre el mismo regalo, de modo que la
-- versión descartada se conserva y se señala para revisión (spec funcional §9).
CREATE TABLE IF NOT EXISTS conflicto (
  id                TEXT PRIMARY KEY,
  entidad           TEXT NOT NULL,
  entidad_id        TEXT NOT NULL,
  campo             TEXT NOT NULL,
  valor_descartado  TEXT,
  valor_conservado  TEXT,
  autor_descartado  TEXT REFERENCES persona(id),
  detectado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  revisado          INTEGER NOT NULL DEFAULT 0
);
