-- El curso de Falu, 2.º de Bachillerato 2026-27: las fechas importantes de la
-- reunión de principio de curso, apuntadas como suyas en la agenda.
--
-- Se decidió antes de escribirlas: exámenes finales, trabajo de investigación,
-- viaje, graduación, notas finales y PAU; sin recuperaciones, sin boletines y
-- sin días no lectivos. Sin categoría, como cualquier evento puntual.
--
-- Falu se busca por su apodo o por su nombre, y el autor, por el nombre de
-- Óscar, porque el identificador de una persona lo pone cada base (como la
-- `0018`). Si no se encuentra, el evento queda sin protagonista o sin autor,
-- que es lo que tendría uno escrito a mano sin rellenar esos campos.
--
-- `.unavez` porque inserta datos.

INSERT OR IGNORE INTO evento (
  id, titulo, tipo_id, inicio, fin, jornada_completa, notas, lleva_regalos,
  origen, autor_id, activo
)
VALUES
  ('curso-falu-01', '📝 Exámenes finales, 1.ª evaluación', 'fecha_escolar', '2026-11-05', '2026-11-11', 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-02', '📚 Entrega del TR', 'fecha_escolar', '2026-11-25', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-03', '🎤 XVI Jornada del TR', 'fecha_escolar', '2026-12-21', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-04', '🎤 Defensas orales del TR', 'fecha_escolar', '2027-01-11', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-05', '📝 Exámenes finales, 2.ª evaluación', 'fecha_escolar', '2027-02-04', '2027-02-11', 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-06', '✈️ Viaje a la Toscana', 'fecha_escolar', '2027-02-22', '2027-02-26', 1, 'Recorrido por la Toscana, 4 noches en Florencia. Programa y vuelos por confirmar en el primer trimestre.', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-07', '📚 Entrega del TR, segunda tanda', 'fecha_escolar', '2027-03-15', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-08', '👔 Tarde de las profesiones', 'fecha_escolar', '2027-03-15', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-09', '🎤 Tribunales del TR, segunda tanda', 'fecha_escolar', '2027-03-31', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-10', '📝 Exámenes finales, 3.ª evaluación', 'fecha_escolar', '2027-04-29', '2027-05-05', 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-11', '🎓 Fiesta de despedida y graduación', 'fecha_escolar', '2027-05-12', NULL, 1, 'Acto de graduación de la promoción 25-27.', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-12', '📊 Entrega de notas finales (presencial)', 'fecha_escolar', '2027-05-13', NULL, 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-13', '🏫 Clases preparatorias de la PAU', 'fecha_escolar', '2027-05-14', '2027-05-31', 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1),
  ('curso-falu-14', '🎓 PAU y pruebas extraordinarias', 'fecha_escolar', '2027-06-01', '2027-06-03', 1, '', 0, 'manual', (SELECT id FROM persona WHERE nombre LIKE 'Óscar%' AND rol = 'administrador' LIMIT 1), 1);

INSERT OR IGNORE INTO participante_evento (evento_id, persona_id, rol)
SELECT e.id, p.id, 'protagonista'
FROM evento e, (
  SELECT id FROM persona WHERE apodo = 'Falu' OR nombre LIKE 'Mariona%' ORDER BY (apodo = 'Falu') DESC LIMIT 1
) p
WHERE e.id LIKE 'curso-falu-%';
