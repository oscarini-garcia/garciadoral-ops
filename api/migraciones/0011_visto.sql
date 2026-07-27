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
