-- El calendario de viajes: la primera fuente importada (specs/calendario-viajes.md).
--
-- Siembra la fila de `calendario_externo` a la que el importador engancha los
-- eventos (§3.1). Es una fuente fija, provisionada aquí, sin pantalla de gestión
-- de calendarios: «solo viajes por ahora» (§10). El `id` es el que el Worker
-- busca (`CALENDARIO_VIAJES` en api/src/viajes.js).
--
-- Lo que NO va aquí es el secreto: la URL privada del feed es una credencial y
-- vive en `wrangler secret put VIAJES_ICAL_URL`, nunca en el repositorio (§8).
-- `identificador_fuente` se deja vacío a propósito: la reconciliación va por el
-- `id`, y el identificador del calendario de Google no aporta nada sin el token.

INSERT OR IGNORE INTO calendario_externo (id, nombre, identificador_fuente, tipo_evento_id)
VALUES ('cal-viajes', 'Viajes', '', 'viaje');
