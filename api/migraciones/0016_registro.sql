-- El registro de lo aplicado, que es lo que hace que una migración se pase una
-- sola vez.
--
-- Hasta ahora la lista de lo pendiente estaba escrita a mano en `CLAUDE.md`, y
-- una lista escrita a mano miente: la `0012` y la `0013` se quedaron apuntadas
-- como pendientes después de aplicarse, y esa mentira costó tres despliegues en
-- rojo, porque quien se fía de ella vuelve a pedirlas y el `ALTER TABLE`
-- contesta `duplicate column name`.
--
-- Con esta tabla la lista deja de escribirse y pasa a deducirse: el despliegue
-- pregunta qué hay aquí dentro y aplica lo que falte. De paso, las `.unavez`
-- dejan de pedirse por su nombre, que era el otro sitio donde se podía errar.
CREATE TABLE IF NOT EXISTS migracion (
  fichero     TEXT PRIMARY KEY,
  aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

-- La siembra: las que ya estaban puestas cuando se escribió esto. Va con
-- `INSERT OR IGNORE`, así que repetirla no toca nada —que es justamente lo que
-- se le pide a todo lo que este workflow pasa más de una vez—.
--
-- La `0015_mejoras.sql` no está en la lista **a propósito**: es la única que
-- seguía sin aplicar, y dejarla fuera es lo que hace que el primer despliegue
-- con este registro la pase.
INSERT OR IGNORE INTO migracion (fichero) VALUES
  ('0001_esquema.sql'),
  ('0002_catalogos.sql'),
  ('0003_solicitudes.sql'),
  ('0004_redaccion.sql'),
  ('0005_circulos.unavez.sql'),
  ('0006_genero.unavez.sql'),
  ('0007_estado_regalo.sql'),
  ('0008_lio.sql'),
  ('0009_comentario_sin_check.unavez.sql'),
  ('0010_sitios.sql'),
  ('0011_visto.sql'),
  ('0012_apunte_hecho.unavez.sql'),
  ('0013_avisos_push.unavez.sql'),
  ('0014_viajes.sql');
