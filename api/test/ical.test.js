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
