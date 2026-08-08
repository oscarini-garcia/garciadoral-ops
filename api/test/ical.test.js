/**
 * El parser de iCalendar.
 *
 * Se comprueban los casos en los que un `.ics` engaña: el fin exclusivo de un
 * evento de jornada completa —que si no se corrige alarga el viaje un día—, la
 * recurrencia que se ignora, la instancia de una serie que no debe duplicar, el
 * cancelado que se marca y el plegado de líneas que parte un título por la mitad.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parsearICal } from '../src/ical.js';

/** Envuelve unos VEVENT en un VCALENDAR con saltos CRLF, como los sirve Google. */
function ics(...vevents) {
  const cuerpo = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...vevents, 'END:VCALENDAR'];
  return cuerpo.join('\r\n');
}

test('un viaje de varios días guarda el fin inclusivo, no el exclusivo', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:viaje-lisboa@google.com',
    'SUMMARY:Lisboa',
    'DTSTART;VALUE=DATE:20260710',
    'DTEND;VALUE=DATE:20260713',
    'END:VEVENT',
  ));
  assert.equal(e.jornadaCompleta, true);
  assert.equal(e.inicio, '2026-07-10');
  assert.equal(e.fin, '2026-07-12'); // el DTEND 13 es exclusivo → 12 inclusive
});

test('un día suelto de jornada completa no lleva fin', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u1',
    'SUMMARY:Salida',
    'DTSTART;VALUE=DATE:20260710',
    'DTEND;VALUE=DATE:20260711',
    'END:VEVENT',
  ));
  assert.equal(e.inicio, '2026-07-10');
  assert.equal(e.fin, null);
});

test('una marca UTC se lleva a la hora de pared de la casa', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u2',
    'SUMMARY:Vuelo',
    'DTSTART:20260710T060000Z', // 06:00 UTC = 08:00 en Madrid (verano)
    'DTEND:20260710T083000Z',
    'END:VEVENT',
  ));
  assert.equal(e.jornadaCompleta, false);
  assert.equal(e.inicio, '2026-07-10T08:00:00');
  assert.equal(e.fin, '2026-07-10T10:30:00');
});

/**
 * El caso que rompía un viaje: un `TZID` ajeno a la casa.
 *
 * Se tomaba la hora de pared tal cual y se llamaba a eso una limitación
 * conocida. No lo era: un vuelo que sale de Nueva York a las 18:40 son las 00:40
 * del día siguiente en Madrid, así que el evento aparecía **un día antes del que
 * le toca** —y si ese día era domingo, en la semana anterior—. La spec lo pedía
 * explícito desde el principio (§4): la conversión va en la importación «para
 * que la fecha con la que un evento se sitúa en la semana sea inequívoca».
 */
test('un TZID ajeno se convierte a la hora de pared de la casa, aunque cambie el día', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u-ny',
    'SUMMARY:Nueva York → Madrid',
    'DTSTART;TZID=America/New_York:20260806T184000', // 22:40 UTC
    'DTEND;TZID=America/New_York:20260807T053000',
    'END:VEVENT',
  ));
  assert.equal(e.inicio, '2026-08-07T00:40:00');
  assert.equal(e.fin, '2026-08-07T11:30:00');
});

test('el mismo instante da lo mismo venga en Z, en TZID de casa o en TZID ajeno', () => {
  const deUna = (dtstart) => parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-igual', 'SUMMARY:Vuelo', dtstart, 'END:VEVENT',
  ))[0].inicio;

  const enZulu = deUna('DTSTART:20260806T224000Z');
  assert.equal(deUna('DTSTART;TZID=Europe/Madrid:20260807T004000'), enZulu);
  assert.equal(deUna('DTSTART;TZID=America/New_York:20260806T184000'), enZulu);
});

test('el TZID puede venir entre comillas, que la norma lo permite', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-comillas', 'SUMMARY:Vuelo',
    'DTSTART;TZID="America/New_York":20260806T184000',
    'END:VEVENT',
  ));
  assert.equal(e.inicio, '2026-08-07T00:40:00');
});

test('una zona que el motor no reconoce deja la hora de pared, y no tira el evento', () => {
  // Los nombres de Windows —«Romance Standard Time»— los emite algún cliente y
  // `Intl` los rechaza. Perder el vuelo entero sería mucho peor que la hora.
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-windows', 'SUMMARY:Vuelo',
    'DTSTART;TZID=Romance Standard Time:20260806T184000',
    'END:VEVENT',
  ));
  assert.equal(e.inicio, '2026-08-06T18:40:00');
});

test('el cambio de hora se resuelve por el desfase del instante, no por el de hoy', () => {
  const deUna = (dtstart) => parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-dst', 'SUMMARY:Vuelo', dtstart, 'END:VEVENT',
  ))[0].inicio;

  // Madrid pasa de +1 a +2 el 29 de marzo de 2026 a las 02:00. Una hora antes y
  // una hora después del salto, con el mismo TZID de origen.
  assert.equal(deUna('DTSTART;TZID=America/New_York:20260328T200000'), '2026-03-29T01:00:00');
  assert.equal(deUna('DTSTART;TZID=America/New_York:20260328T210000'), '2026-03-29T03:00:00');
});

test('una hora de pared que no existe por el cambio de hora no revienta', () => {
  // Las 02:30 del 29 de marzo no existen en Madrid: el reloj salta de 02:00 a
  // 03:00. Se resuelve a 03:30 y sigue adelante, que es lo que hace falta.
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-hueco', 'SUMMARY:Algo',
    'DTSTART;TZID=Europe/Madrid:20260329T023000',
    'END:VEVENT',
  ));
  assert.equal(e.inicio, '2026-03-29T03:30:00');
});

test('una jornada completa es flotante y no se mueve por ninguna conversión', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT', 'UID:u-dia', 'SUMMARY:Viaje',
    'DTSTART;VALUE=DATE:20260806',
    'END:VEVENT',
  ));
  assert.equal(e.jornadaCompleta, true);
  assert.equal(e.inicio, '2026-08-06');
});

test('la recurrencia se ignora: se toma solo la primera aparición', () => {
  const eventos = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:semanal',
    'SUMMARY:Ida y vuelta',
    'DTSTART;VALUE=DATE:20260706',
    'RRULE:FREQ=WEEKLY;COUNT=8',
    'END:VEVENT',
  ));
  assert.equal(eventos.length, 1);
  assert.equal(eventos[0].inicio, '2026-07-06');
});

test('una instancia de una serie (RECURRENCE-ID) no se importa', () => {
  const eventos = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:semanal',
    'RECURRENCE-ID;VALUE=DATE:20260713',
    'SUMMARY:Ida y vuelta (ese día otro sitio)',
    'DTSTART;VALUE=DATE:20260713',
    'END:VEVENT',
  ));
  assert.equal(eventos.length, 0);
});

test('un evento cancelado se marca como tal', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u3',
    'SUMMARY:Roma',
    'DTSTART;VALUE=DATE:20260801',
    'STATUS:CANCELLED',
    'END:VEVENT',
  ));
  assert.equal(e.cancelado, true);
});

test('el plegado de líneas recompone una palabra partida', () => {
  // Google pliega a los 75 octetos con CRLF + espacio, y ese espacio es marca
  // de plegado, no contenido: al desplegar desaparece y la palabra se recompone.
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u4',
    'SUMMARY:Viaje a Lis',
    ' boa y vuelta',
    'DTSTART;VALUE=DATE:20260901',
    'END:VEVENT',
  ));
  assert.equal(e.titulo, 'Viaje a Lisboa y vuelta');
});

test('los escapes de texto se deshacen en las notas', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u5',
    'SUMMARY:Nueva York',
    'DESCRIPTION:Hotel\\, calle 5\\; reserva 42\\nvuelo AA100',
    'DTSTART;VALUE=DATE:20261010',
    'END:VEVENT',
  ));
  assert.equal(e.notas, 'Hotel, calle 5; reserva 42\nvuelo AA100');
});

/**
 * El recordatorio de dentro no es el evento.
 *
 * Un `VEVENT` puede llevar dentro sus alarmas, y una alarma trae `SUMMARY` y
 * `DESCRIPTION` propios. Sin saltarse los bloques anidados, la última lectura
 * ganaba: el vuelo se importaba titulado «Recordatorio» y con el texto de la
 * alarma por notas. No desaparecía —que es lo que parecía desde la agenda—,
 * llegaba con otro nombre, y por eso no se reconocía ni lo pillaba
 * `presentarVuelo`.
 */
test('un VALARM dentro del evento no le pisa el título ni las notas', () => {
  const [e] = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u-alarma',
    'SUMMARY:Madrid → Múnich',
    'DTSTART;TZID=Europe/Madrid:20260810T104000',
    'DTEND;TZID=Europe/Berlin:20260810T131500',
    'DESCRIPTION:IB 3192. Terminal 4.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT2H',
    'SUMMARY:Recordatorio',
    'DESCRIPTION:Sal para el aeropuerto',
    'END:VALARM',
    'END:VEVENT',
  ));
  assert.equal(e.titulo, 'Madrid → Múnich');
  assert.equal(e.notas, 'IB 3192. Terminal 4.');
  assert.equal(e.inicio, '2026-08-10T10:40:00');
});

test('dos alarmas seguidas tampoco, y el evento siguiente se lee entero', () => {
  const eventos = parsearICal(ics(
    'BEGIN:VEVENT',
    'UID:u-dos-alarmas',
    'SUMMARY:Ida',
    'DTSTART;TZID=Europe/Madrid:20260810T104000',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Uno', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:AUDIO', 'SUMMARY:Dos', 'END:VALARM',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'UID:u-vuelta',
    'SUMMARY:Vuelta',
    'DTSTART;TZID=Europe/Berlin:20260814T190000',
    'END:VEVENT',
  ));
  assert.deepEqual(eventos.map((e) => e.titulo), ['Ida', 'Vuelta']);
  assert.equal(eventos[1].inicio, '2026-08-14T19:00:00');
});

test('un VEVENT sin UID se descarta', () => {
  const eventos = parsearICal(ics(
    'BEGIN:VEVENT',
    'SUMMARY:Sin identificador',
    'DTSTART;VALUE=DATE:20261010',
    'END:VEVENT',
  ));
  assert.equal(eventos.length, 0);
});

test('un documento vacío o basura no revienta', () => {
  assert.deepEqual(parsearICal(''), []);
  assert.deepEqual(parsearICal('no soy un ics'), []);
});
