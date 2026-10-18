-- Quién ve una idea o un regalo, persona a persona
-- (specs/propuesta-regalos-para-mi-y-para-otros.html, C1 · D1).
--
-- `ven` es la lista de los de casa que lo ven, en JSON. Quien lo recibe no lo
-- ve nunca aunque esté en la lista, y quien lo apunta lo ve siempre. Sustituye
-- a `para_todos`, que se queda para los teléfonos que aún no se han
-- actualizado: con `ven` vacío manda la regla de antes.
--
-- Lo ya apuntado se traduce sin cambiar lo que ve cada uno: lo de quien
-- administra sin «También las niñas», para los administradores; lo demás, para
-- todos los de casa. Lo que uno pide para sí no lleva lista: lo ve toda la casa.
--
-- `.unavez` porque lleva `ALTER TABLE` y reparte datos.

ALTER TABLE idea ADD COLUMN ven TEXT;
ALTER TABLE regalo ADD COLUMN ven TEXT;

UPDATE idea
   SET ven = (SELECT json_group_array(id) FROM (
                SELECT id FROM persona
                 WHERE circulo = 'familia' AND tiene_cuenta = 1 AND activa = 1
                   AND rol = 'administrador'
                 ORDER BY nombre))
 WHERE tipo <> 'deseo' AND para_todos = 0
   AND autor_id IN (SELECT id FROM persona WHERE rol = 'administrador');

UPDATE idea
   SET ven = (SELECT json_group_array(id) FROM (
                SELECT id FROM persona
                 WHERE circulo = 'familia' AND tiene_cuenta = 1 AND activa = 1
                 ORDER BY nombre))
 WHERE tipo <> 'deseo' AND ven IS NULL;

UPDATE regalo
   SET ven = (SELECT json_group_array(id) FROM (
                SELECT id FROM persona
                 WHERE circulo = 'familia' AND tiene_cuenta = 1 AND activa = 1
                   AND rol = 'administrador'
                 ORDER BY nombre))
 WHERE para_todos = 0
   AND autor_id IN (SELECT id FROM persona WHERE rol = 'administrador');

UPDATE regalo
   SET ven = (SELECT json_group_array(id) FROM (
                SELECT id FROM persona
                 WHERE circulo = 'familia' AND tiene_cuenta = 1 AND activa = 1
                 ORDER BY nombre))
 WHERE ven IS NULL;
