-- Catálogos iniciales confirmados en specs/especificacion.md §11
-- (apartados 3.1 y 4.1). Mismo contenido que datos/catalogos.json.

INSERT OR REPLACE INTO tipo_evento (id, nombre, emoji, lleva_regalos, orden) VALUES
  ('cumpleanos',    'Cumpleaños',    '🎂', 1,  1),
  ('santo',         'Santo',         '✨', 1,  2),
  ('aniversario',   'Aniversario',   '💍', 1,  3),
  ('viaje',         'Viaje',         '✈️', 0,  4),
  ('competicion',   'Competición',   '🏆', 0,  5),
  ('entreno',       'Entreno',       '🏃', 0,  6),
  ('celebracion',   'Celebración',   '🎉', 1,  7),
  ('fecha_escolar', 'Fecha escolar', '🎒', 0,  8),
  ('cita_medica',   'Cita médica',   '🩺', 0,  9),
  ('otro',          'Otro',          '📌', 0, 10);

INSERT OR REPLACE INTO categoria (id, nombre, regla, orden) VALUES
  ('general',       'General',             'publica',  1),
  ('tecnologia',    'Tecnología',          'publica',  2),
  ('libros_musica', 'Libros y música',     'publica',  3),
  ('deporte',       'Deporte',             'publica',  4),
  ('ropa',          'Ropa y complementos', 'publica',  5),
  ('experiencias',  'Experiencias',        'publica',  6),
  ('casa_cocina',   'Casa y cocina',       'publica',  7),
  ('coordinacion',  'Coordinación',        'privada',  8);
