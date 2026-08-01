/**
 * El aviso de que alguien quiere entrar.
 *
 * Va por su cuenta y no por `FUENTES`, porque una solicitud no es un cambio de
 * la agenda: entra por su propia ruta y nunca aparece en el lote que sube la
 * sincronización. Eso deja fuera de juego la comprobación que protege a los
 * demás avisos, así que lo que hay que sujetar aquí es a quién alcanza.
 *
 * Y alcanza solo a los administradores, que son los únicos que pueden abrir la
 * puerta. Que le sonara el teléfono a una hija por una solicitud que no puede
 * resolver sería contarle quién anda pidiendo entrar en su casa a cambio de
 * nada.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { empujarSolicitud } from '../src/avisos.js';

const PERSONAS = [
  { id: 'p-oscar', rol: 'administrador', tiene_cuenta: 1, activa: 1 },
  { id: 'p-ana', rol: 'administrador', tiene_cuenta: 1, activa: 1 },
  { id: 'p-marta', rol: 'miembro', tiene_cuenta: 1, activa: 1 },
  { id: 'p-vieja', rol: 'administrador', tiene_cuenta: 1, activa: 0 },
];

const APARATOS = {
  'p-oscar': [{ id: 'd1', token_push: 'token-oscar' }],
  'p-ana': [{ id: 'd2', token_push: 'token-ana' }],
  'p-marta': [{ id: 'd3', token_push: 'token-marta' }],
  'p-vieja': [{ id: 'd4', token_push: 'token-vieja' }],
};

/** Una D1 de mentira que solo entiende las dos consultas que esto hace. */
function baseDeDatos() {
  return {
    prepare(sql) {
      const consulta = {
        _sql: sql,
        _args: [],
        bind(...args) { consulta._args = args; return consulta; },
        async all() {
          if (/FROM persona/.test(sql)) {
            return {
              results: PERSONAS.filter((p) => p.rol === 'administrador' && p.tiene_cuenta && p.activa),
            };
          }
          return { results: APARATOS[consulta._args[0]] || [] };
        },
        async run() { return {}; },
      };
      return consulta;
    },
  };
}

/** Recoge a qué tokens se ha empujado, interceptando la llamada a APNs. */
function entorno(enviados) {
  return {
    DB: baseDeDatos(),
    APNS_CLAVE_P8: '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
    APNS_CLAVE_ID: 'ABC123',
    APPLE_EQUIPO: '38URFH7NXL',
    APPLE_AUD_IOS: 'com.garciadoral.ops',
    _enviados: enviados,
  };
}

const SOLICITUD = {
  id: 's-1',
  nombre_declarado: 'Marta Ruiz',
  correo: 'marta@example.com',
  correo_privado: 0,
};

test('solo se avisa a los administradores con cuenta activa', async () => {
  const enviados = [];
  const enviar = async (env, token, aviso) => {
    enviados.push({ token, aviso });
    return { ok: true };
  };

  await empujarSolicitud(entorno(enviados), SOLICITUD, { enviar });

  assert.deepEqual(enviados.map((e) => e.token).sort(), ['token-ana', 'token-oscar']);
});

test('el aviso lleva el nombre y el correo de quien pide entrar', async () => {
  const avisos = [];
  await empujarSolicitud(entorno([]), SOLICITUD, {
    enviar: async (env, token, aviso) => { avisos.push(aviso); return { ok: true }; },
  });

  assert.match(avisos[0].titulo, /Marta Ruiz/);
  assert.equal(avisos[0].cuerpo, 'marta@example.com');
  assert.equal(avisos[0].urgente, true);
});

test('dice cuando el correo viene oculto, en vez de callar', async () => {
  const avisos = [];
  await empujarSolicitud(entorno([]), { ...SOLICITUD, correo: null }, {
    enviar: async (env, token, aviso) => { avisos.push(aviso); return { ok: true }; },
  });

  assert.match(avisos[0].cuerpo, /ocultar su correo/);
});

test('sin APNs configurado no se intenta nada', async () => {
  const resultado = await empujarSolicitud({ DB: baseDeDatos() }, SOLICITUD);
  assert.equal(resultado.enviados, 0);
  assert.equal(resultado.motivo, 'sin-configurar');
});
