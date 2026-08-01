-- Un calendario externo tiene dueño.
--
-- Un vuelo importado llegaba con `origen = 'importado'` y su `calendario_id`, y
-- nada más: sin `persona_origen_id` y sin participantes. En la agenda de los
-- cuatro aparecía «Madrid → Bolonia» sin decir de quién era, y había que saberse
-- de memoria de quién es el Flighty.
--
-- El dueño va en el calendario y no en cada evento por dos razones. La primera
-- es que es verdad: el feed **es** de alguien y eso no cambia vuelo a vuelo, así
-- que escribirlo en cada fila sería copiar el mismo dato mil veces. La segunda
-- es que `persona_origen_id` —la columna del evento que se habría reutilizado—
-- es lo que mira `esMio()` para encender los avisos, de modo que ponerla haría
-- sonar el teléfono con cada cambio de cada vuelo. La pantalla lee el calendario
-- del evento y escribe el nombre; nada más cambia.
ALTER TABLE calendario_externo ADD COLUMN persona_id TEXT REFERENCES persona(id);

-- Y se le pone dueño al de viajes, que es el único que hay. Se busca por nombre
-- porque el identificador de una persona lo pone cada base y aquí no se conoce;
-- si no encuentra a nadie deja `NULL`, que es exactamente lo que había antes, y
-- entonces la pantalla sencillamente no escribe dueño. Se arregla a mano con un
-- UPDATE cuando se sepa el id bueno.
UPDATE calendario_externo
   SET persona_id = (
         SELECT id FROM persona
          WHERE nombre IN ('Óscar', 'Oscar') AND tiene_cuenta = 1
          ORDER BY id LIMIT 1
       )
 WHERE id = 'cal-viajes' AND persona_id IS NULL;
