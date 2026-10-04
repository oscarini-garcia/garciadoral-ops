-- El tipo de las actividades recurrentes (specs/propuesta-recurrentes.html).
--
-- Una actividad nacía con el tipo «Entreno», y eso es lo que leían el plan de
-- los domingos y la redacción con IA: «🏃 academia» en el WhatsApp, cuando la
-- academia no es un entreno. Se añade el tipo «Recurrente» y las actividades
-- que ya existen y seguían en «Entreno» pasan a él; las que alguien cambió a
-- otro tipo a mano se quedan como estén.
--
-- `.unavez` porque inserta y reparte datos.

INSERT OR IGNORE INTO tipo_evento (id, nombre, emoji, lleva_regalos, orden)
VALUES ('recurrente', 'Recurrente', '🔁', 0, 11);

UPDATE evento SET tipo_id = 'recurrente'
WHERE plugin_id = 'extraescolar' AND tipo_id = 'entreno';
