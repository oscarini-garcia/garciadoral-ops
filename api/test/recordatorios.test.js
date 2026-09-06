/**
 * El aviso previo desde el servidor: qué se le empuja a cada aparato cada
 * mañana, y con qué antelación.
 *
 * Lo que se comprueba es lo que decide si suena o no: que la antelación sea la
 * del aparato para lo suyo y la de la casa para los cumpleaños; que una
 * actividad de martes y jueves avise el día que toca y no el jueves de la
 * semana siguiente; que un día cancelado no suene; y que a quien no le llega
 * un plugin tampoco le llega su aviso.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { antelacionDe, arranquesEntre, avisosDelAparato, empujarRecordatorios, recordatoriosDe } from '../src/recordatorios.js';

const OSCAR = { id: 'p-oscar', nombre: 'Óscar', tiene_cuenta: true, rol: 'administrador', circulo: 'familia', activa: true };
const MARTA = { id: 'p-marta', nombre: 'Marta', tiene_cuenta: true, rol: 'miembro', circulo: 'familia', activa: true, fecha_nacimiento: '2010-09-20' };
const ABUELA = { id: 'p-abuela', nombre: 'la abuela', tiene_cuenta: true, rol: 'miembro', circulo: 'extendida', activa: true, santo: '10-16' };

const HIPICA = {
  id: 'ev-hipica', titulo: '🐴 Hípica', tipo_id: 'entreno', inicio: '2026-09-15T18:00:00', jornada_completa: 0,
  repeticion: 'semanal', plugin_id: 'extraescolar', extra: { dias: [1, 3] }, activo: true,
  categoria_id: null, participantes: [], ubicacion: 'El picadero',
};
const CENA = {
  id: 'ev-cena', titulo: 'Cena con los vecinos', tipo_id: 'celebracion', inicio: '2026-09-16T21:30:00',
  jornada_completa: 0, repeticion: 'ninguna', activo: true, categoria_id: null, participantes: [],
};

function registro(extra = {}) {
  return {
    personas: [OSCAR, MARTA, ABUELA],
    atributos_persona: [], categorias: [{ id: 'general', nombre: 'General', regla: 'publica' }],
    acceso_categoria: [], etiquetas: [],
    tipos_evento: [{ id: 'entreno', emoji: '🏃' }, { id: 'celebracion', emoji: '🎉' }, { id: 'cumpleanos', emoji: '🎂' }, { id: 'santo', emoji: '✨' }],
    eventos: [HIPICA, CENA], ideas: [], ocasiones: [], regalos: [], comentarios: [], conflictos: [],
    lugares: [], apuntes: [], votos: [], vistos: [], paseos: [], tratos_paseo: [], tratos_dia: [],
    dias_evento: [], ausencias: [], plugins: {},
    ...extra,
  };
}

const aparato = (extra = {}) => ({ id: 'ap-1', persona_id: 'p-oscar', token_push: 'tok', avisos: null, ...extra });

test('la expansión da los días que arranca cada aparición, y solo esos', () => {
  assert.deepEqual(arranquesEntre(HIPICA, '2026-09-14', '2026-09-27'), ['2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24']);
  assert.deepEqual(arranquesEntre(CENA, '2026-09-16', '2026-09-16'), ['2026-09-16']);
  assert.deepEqual(arranquesEntre(CENA, '2026-09-17', '2026-09-30'), []);
  const cumple = { inicio: '2010-09-20', repeticion: 'anual' };
  assert.deepEqual(arranquesEntre(cumple, '2026-09-19', '2026-09-21'), ['2026-09-20']);
  const bisiesto = { inicio: '2000-02-29', repeticion: 'anual' };
  assert.deepEqual(arranquesEntre(bisiesto, '2027-02-27', '2027-03-02'), ['2027-03-01']);
});

test('lo puntual avisa la víspera de origen, y una actividad no avisa salvo que el aparato lo pida', () => {
  const avisos = recordatoriosDe(registro(), aparato(), '2026-09-15');
  assert.deepEqual(avisos.map((a) => a.titulo), ['🎉 Cena con los vecinos']);
  assert.equal(avisos[0].cuerpo, 'Mañana a las 21:30');
  assert.equal(avisos[0].agrupa, 'recordatorio:ev-cena:2026-09-16');

  const conHipica = recordatoriosDe(registro(), aparato({ avisos: '{"extraescolares":"dia"}' }), '2026-09-15');
  assert.deepEqual(conHipica.map((a) => [a.titulo, a.cuerpo]), [
    ['🐴 Hípica', 'Hoy a las 18:00 · El picadero'],
    ['🎉 Cena con los vecinos', 'Mañana a las 21:30'],
  ]);
});

test('el día en que se dijo «no hay» no suena', () => {
  const datos = registro({ dias_evento: [{ id: 'dia:ev-hipica:2026-09-15', evento_id: 'ev-hipica', fecha: '2026-09-15', cancelado: true, activo: true }] });
  const avisos = recordatoriosDe(datos, aparato({ avisos: '{"extraescolares":"dia"}' }), '2026-09-15');
  assert.deepEqual(avisos.map((a) => a.titulo), ['🎉 Cena con los vecinos']);
});

test('los cumpleaños van por círculo de quien cumple, y los santos también', () => {
  // Marta es de casa: una semana antes. La abuela, extendida: la víspera de su santo.
  const semanaAntes = recordatoriosDe(registro(), aparato(), '2026-09-13');
  assert.deepEqual(semanaAntes.map((a) => a.titulo), ['🎂 Cumpleaños de Marta']);
  assert.equal(semanaAntes[0].cuerpo, 'El domingo 20, dentro de 7 días');
  const vispera = recordatoriosDe(registro(), aparato(), '2026-10-15');
  assert.deepEqual(vispera.map((a) => [a.titulo, a.cuerpo]), [['✨ Santo de la abuela', 'Mañana']]);

  const ajustado = registro({ plugins: { cumples: { aviso: { familia: 1 }, santos: false } } });
  const conAjuste = recordatoriosDe(ajustado, aparato(), '2026-09-19');
  assert.deepEqual(conAjuste.map((a) => a.titulo), ['🎂 Cumpleaños de Marta']);
  assert.deepEqual(recordatoriosDe(ajustado, aparato(), '2026-10-15'), []);
});

test('a quien no le llega un plugin tampoco le llega su aviso', () => {
  const deLaAbuela = aparato({ persona_id: 'p-abuela', avisos: '{"extraescolares":"dia"}' });
  const avisos = recordatoriosDe(registro(), deLaAbuela, '2026-09-15');
  assert.deepEqual(avisos.map((a) => a.titulo), ['🎉 Cena con los vecinos']);
});

test('un `avisos` ilegible vale como ninguno', () => {
  assert.deepEqual(avisosDelAparato('{no es json'), {});
  assert.deepEqual(avisosDelAparato(null), {});
  assert.equal(antelacionDe({ personas: [], plugins: {} }, {}, { id: 'e1' }), 1);
  assert.equal(antelacionDe({ personas: [], plugins: {} }, { puntuales: 'nunca' }, { id: 'e1' }), null);
});

test('el cron empuja a cada aparato lo suyo, y olvida el token caducado', async () => {
  const enviados = [];
  const olvidados = [];
  const env = {
    APPLE_EQUIPO: 'x', APNS_CLAVE_ID: 'x', APNS_CLAVE_P8: 'x',
    DB: {
      prepare: (sql) => ({
        all: async () => ({ results: [aparato(), aparato({ id: 'ap-2', persona_id: 'p-marta', token_push: 'viejo' })] }),
        bind: () => ({ run: async () => { olvidados.push(sql); return {}; } }),
      }),
    },
  };
  const resultado = await empujarRecordatorios(env, {
    hoy: '2026-09-15',
    leerRegistro: async () => registro(),
    enviar: async (_env, token, aviso) => {
      enviados.push([token, aviso.titulo]);
      return token === 'viejo' ? { ok: false, caducado: true } : { ok: true };
    },
  });
  assert.equal(resultado.enviados, 1);
  assert.deepEqual(enviados, [['tok', '🎉 Cena con los vecinos'], ['viejo', '🎉 Cena con los vecinos']]);
  assert.equal(olvidados.length, 1);
});
