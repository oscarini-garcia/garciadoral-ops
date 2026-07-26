-- El círculo al que pertenece cada persona.
--
-- Hasta ahora la pantalla de personas se partía por `tiene_cuenta`, que es un
-- dato técnico —quién ha entrado con Apple— usado como si fuera un vínculo. No
-- lo es: la abuela no tiene cuenta y es de la familia; un amigo podría tenerla y
-- no serlo. Lo que ordena la pantalla pasa a ser el vínculo, escrito aparte.
--
-- Son tres y cerrados. No se convierten en catálogo editable a propósito: un
-- cuarto círculo obligaría a decidir en cada alta a cuál va cada persona, que es
-- justo la pregunta que la pantalla evita al llevar el «+» dentro de su grupo
-- (specs/ux.md §7.1).

-- **De un solo uso**, y por eso el `.unavez.sql` del nombre: el bucle que
-- aplica las demás la salta. Las otras se pueden repetir sin consecuencias
-- —`CREATE TABLE IF NOT EXISTS`—, y esta no: el `ALTER TABLE` falla si la
-- columna ya está, y el reparto de abajo pisaría los círculos que se hubieran
-- corregido desde la aplicación. Se pide por su nombre al desplegar la API.

PRAGMA foreign_keys = ON;

-- `extendida` como valor por defecto y no `familia`: al migrar no se sabe quién
-- es de casa, y equivocarse hacia fuera es recuperable —se corrige una ficha—
-- mientras que equivocarse hacia dentro rompe la regla de los cuatro en cuanto
-- entra la quinta persona.
ALTER TABLE persona ADD COLUMN circulo TEXT NOT NULL DEFAULT 'extendida'
  CHECK (circulo IN ('familia', 'extendida', 'amigos'));

-- Quien ya tenía cuenta era, en el registro que existe hoy, la gente de casa.
-- Es la única pista disponible en la migración; lo que quede mal se arregla
-- desde la ficha, que es donde se ve.
UPDATE persona SET circulo = 'familia' WHERE tiene_cuenta = 1;

CREATE INDEX IF NOT EXISTS idx_persona_circulo ON persona(circulo);
