-- La sala de espera: quien ha entrado con Apple y todavía no es del hogar.
-- Traduce a SQLite la entidad de specs/autenticacion.md §4.
--
-- Vive fuera de `persona` a propósito. `persona` es la lista de miembros del
-- hogar: viaja en el registro que lee la sincronización, aparece en los
-- desplegables de la interfaz y llega al dispositivo de todo el mundo. Alguien
-- que se ha descargado la aplicación y ha pulsado un botón no es nada de eso, y
-- si la sala de espera fuera el registro, bastaría con descargarse la
-- aplicación para asomarse a él.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS solicitud_acceso (
  id                  TEXT PRIMARY KEY,
  -- La identidad real; todo lo demás en esta tabla es declarado. Que sea única
  -- es el freno del sistema: insistir actualiza `visto_en` en lugar de crear
  -- una solicitud nueva, de modo que nadie puede generar dos avisos ni cien.
  identificador_apple TEXT NOT NULL UNIQUE,
  -- Puede ser un buzón de reenvío de Apple, o faltar: quien eligió «Ocultar mi
  -- correo» no queda identificado por él, y por eso el nombre se pide a mano.
  correo              TEXT,
  correo_privado      INTEGER NOT NULL DEFAULT 0,
  nombre_declarado    TEXT NOT NULL,
  -- No hay estado «aprobada»: al aprobar, la fila se borra. Lo que quedaría
  -- sería el correo de alguien que ya está en el hogar, guardado para nada y
  -- para siempre, porque una solicitud resuelta a favor no la purga ningún
  -- plazo. Quien fue aprobado está en `persona`, que es donde se le busca.
  estado              TEXT NOT NULL DEFAULT 'pendiente',
  resuelta_por        TEXT REFERENCES persona(id),
  creado_en           TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en      TEXT NOT NULL DEFAULT (datetime('now')),
  -- El último intento de entrar. Es lo que se actualiza cuando alguien que ya
  -- solicitó vuelve a abrir la aplicación.
  visto_en            TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (estado IN ('pendiente', 'rechazada')),
  CHECK (correo_privado IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_solicitud_estado ON solicitud_acceso(estado, creado_en);
