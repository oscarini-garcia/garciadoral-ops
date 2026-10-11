/**
 * Claude por MCP, de la petición a la base: el enlace de cada uno, el protocolo
 * y lo que se consulta y se apunta.
 *
 * Corre contra SQLite de verdad con todas las migraciones (`apoyo/d1.js`), y no
 * contra una base de mentira, porque lo que más importa aquí es que lo apuntado
 * desde una conversación quede escrito igual que desde el teléfono —las mismas
 * columnas, las mismas relaciones— y que lo que se lee pase por el mismo recorte:
 * una idea para Ana no puede salir por el enlace de Ana.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../src/index.js';
import { emitirEspera, emitirSesion } from '../src/portero/sesion.js';
import { baseDeVerdad } from './apoyo/d1.js';

const SECRETO = 'secreto-de-pruebas';

const PERSONAS = [
  { id: 'p-oscar', nombre: 'Óscar', apellidos: 'García', rol: 'administrador', circulo: 'familia', tiene_cuenta: 1 },
  {
    id: 'p-ana', nombre: 'Ana', apellidos: 'Doral', rol: 'administrador', circulo: 'familia', tiene_cuenta: 1,
    fecha_nacimiento: '1980-10-15',
  },
  { id: 'p-marta', nombre: 'Marta', rol: 'miembro', circulo: 'familia', tiene_cuenta: 1 },
  { id: 'p-mariona', nombre: 'Mariona', apodo: 'Falu', rol: 'miembro', circulo: 'familia', tiene_cuenta: 1 },
  { id: 'p-tia', nombre: 'Carmen', parentesco: 'tía', rol: 'miembro', circulo: 'extendida', tiene_cuenta: 1 },
  { id: 'p-abuela', nombre: 'Pilar', parentesco: 'abuela', circulo: 'extendida', tiene_cuenta: 0 },
];

/** La casa de las pruebas: seis personas, cuatro de ellas en casa. */
function casa() {
  const db = baseDeVerdad();
  for (const p of PERSONAS) {
    db.sqlite.prepare(
      `INSERT INTO persona (id, nombre, apellidos, fecha_nacimiento, parentesco, tiene_cuenta, rol, circulo, apodo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(p.id, p.nombre, p.apellidos || '', p.fecha_nacimiento || null, p.parentesco || '', p.tiene_cuenta,
      p.rol || null, p.circulo, p.apodo || null);
  }
  return { SESION_SECRETO: SECRETO, DB: db };
}

async function pedir(env, metodo, camino, { token, cuerpo, cabeceras = {} } = {}) {
  const peticion = new Request(`https://api.example${camino}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo !== undefined ? { 'content-type': 'application/json' } : {}),
      ...cabeceras,
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const pendientes = [];
  const respuesta = await worker.fetch(peticion, env, { waitUntil: (promesa) => pendientes.push(promesa) });
  await Promise.all(pendientes);
  const texto = await respuesta.text();
  return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

const sesionDe = (personaId) => emitirSesion(SECRETO, PERSONAS.find((p) => p.id === personaId), 'web');

/** Crea el enlace de alguien por la ruta de Ajustes y devuelve su camino. */
async function enlaceDe(env, personaId) {
  const { estado, cuerpo } = await pedir(env, 'POST', '/api/mcp/enlace', { token: await sesionDe(personaId) });
  assert.equal(estado, 200);
  return new URL(cuerpo.enlace.url).pathname;
}

const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) });

/** Llama a una herramienta y devuelve su texto y si fue un error. */
async function usar(env, camino, nombre, argumentos = {}) {
  const { estado, cuerpo } = await pedir(env, 'POST', camino, {
    cuerpo: rpc('tools/call', { name: nombre, arguments: argumentos }),
  });
  assert.equal(estado, 200, JSON.stringify(cuerpo));
  return { texto: cuerpo.result.content[0].text, error: cuerpo.result.isError };
}

// ------------------------------------------------------------- El enlace --

test('el enlace se crea, se vuelve a enseñar igual y la base no guarda la firma', async () => {
  const env = casa();
  const token = await sesionDe('p-oscar');

  const creado = await pedir(env, 'POST', '/api/mcp/enlace', { token });
  assert.match(creado.cuerpo.enlace.url, /^https:\/\/api\.example\/mcp\/[\w-]{22}\.[\w-]{43}$/);

  const leido = await pedir(env, 'GET', '/api/mcp/enlace', { token });
  assert.equal(leido.cuerpo.enlace.url, creado.cuerpo.enlace.url, 'Ajustes lo vuelve a enseñar sin rehacerlo');

  const [id, firma] = creado.cuerpo.enlace.url.split('/mcp/')[1].split('.');
  const filas = env.DB.filas('SELECT * FROM enlace_mcp');
  assert.equal(filas.length, 1);
  assert.equal(filas[0].id, id);
  assert.equal(JSON.stringify(filas).includes(firma), false, 'la mitad secreta no está en la base');

  // Y quien no tiene enlace, no tiene nada que enseñar.
  const deAna = await pedir(env, 'GET', '/api/mcp/enlace', { token: await sesionDe('p-ana') });
  assert.equal(deAna.cuerpo.enlace, null);
});

test('rehacer el enlace apaga el anterior, y quitarlo también', async () => {
  const env = casa();
  const viejo = await enlaceDe(env, 'p-oscar');
  const nuevo = await enlaceDe(env, 'p-oscar');
  assert.notEqual(viejo, nuevo);

  assert.equal((await pedir(env, 'POST', viejo, { cuerpo: rpc('ping') })).estado, 401);
  assert.equal((await pedir(env, 'POST', nuevo, { cuerpo: rpc('ping') })).estado, 200);

  await pedir(env, 'DELETE', '/api/mcp/enlace', { token: await sesionDe('p-oscar') });
  assert.equal((await pedir(env, 'POST', nuevo, { cuerpo: rpc('ping') })).estado, 401);
});

test('una firma cambiada, un enlace inventado o ninguno no entran', async () => {
  const env = casa();
  const bueno = await enlaceDe(env, 'p-oscar');
  const cambiado = `${bueno.slice(0, -1)}${bueno.endsWith('A') ? 'B' : 'A'}`;

  for (const camino of [cambiado, '/mcp/inventado', '/mcp', `/mcp/${'a'.repeat(22)}.${'b'.repeat(43)}`]) {
    const { estado } = await pedir(env, 'POST', camino, { cuerpo: rpc('ping') });
    assert.equal(estado, 401, camino);
  }

  // La misma credencial en la cabecera vale igual que en el camino.
  const credencial = bueno.split('/mcp/')[1];
  const { estado } = await pedir(env, 'POST', '/mcp', { cuerpo: rpc('ping'), token: credencial });
  assert.equal(estado, 200);
});

test('el enlace muere con la cuenta: la baja lo apaga y no revive', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-marta');
  assert.equal((await pedir(env, 'POST', camino, { cuerpo: rpc('ping') })).estado, 200);

  const baja = await pedir(env, 'POST', '/api/cuenta/baja', { token: await sesionDe('p-marta') });
  assert.equal(baja.estado, 200);
  assert.equal((await pedir(env, 'POST', camino, { cuerpo: rpc('ping') })).estado, 401);

  // Aunque la cuenta vuelva, el enlace de antes sigue apagado.
  env.DB.sqlite.prepare("UPDATE persona SET tiene_cuenta = 1, rol = 'miembro' WHERE id = 'p-marta'").run();
  assert.equal((await pedir(env, 'POST', camino, { cuerpo: rpc('ping') })).estado, 401);
  assert.equal(env.DB.filas('SELECT * FROM enlace_mcp WHERE activo = 1').length, 0);
});

test('las rutas del enlace piden una sesión plena', async () => {
  const env = casa();
  const espera = await emitirEspera(SECRETO, '000123.abc', 'web', {});
  assert.equal((await pedir(env, 'POST', '/api/mcp/enlace', { token: espera })).estado, 401);
  assert.equal((await pedir(env, 'GET', '/api/mcp/enlace', {})).estado, 401);
  assert.equal(env.DB.filas('SELECT * FROM enlace_mcp').length, 0);
});

// ----------------------------------------------------------- El protocolo --

test('el saludo acuerda la versión y presenta el servidor', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');

  const { cuerpo } = await pedir(env, 'POST', camino, {
    cuerpo: rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } }),
  });
  assert.equal(cuerpo.result.protocolVersion, '2025-06-18');
  assert.deepEqual(cuerpo.result.capabilities, { tools: { listChanged: false } });
  assert.equal(cuerpo.result.serverInfo.name, 'agenda-familiar');
  assert.match(cuerpo.result.instructions, /Te ha conectado Óscar/);
  assert.match(cuerpo.result.instructions, /Falu/, 'dice quién vive en casa, con su apodo');

  // Una versión que no conoce: contesta con la más nueva que sabe hablar.
  const otra = await pedir(env, 'POST', camino, { cuerpo: rpc('initialize', { protocolVersion: '1999-01-01' }) });
  assert.equal(otra.cuerpo.result.protocolVersion, '2025-11-25');
});

test('los avisos no se contestan, y lo que no es POST no se atiende', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');

  const aviso = await pedir(env, 'POST', camino, { cuerpo: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  assert.equal(aviso.estado, 202);
  assert.equal(aviso.cuerpo, null);

  assert.equal((await pedir(env, 'GET', camino)).estado, 405);
});

test('sin saludo: descubrir, la versión en cada petición y una versión que no conoce', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const sobre = (version) => ({ _meta: { 'io.modelcontextprotocol/protocolVersion': version } });
  const cabeceras = { 'mcp-protocol-version': '2026-07-28' };

  const descubierto = await pedir(env, 'POST', camino, { cuerpo: rpc('server/discover', sobre('2026-07-28')), cabeceras });
  assert.deepEqual(descubierto.cuerpo.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(descubierto.cuerpo.result.capabilities, { tools: { listChanged: false } });
  assert.match(descubierto.cuerpo.result.instructions, /Óscar/);

  // Lo que esta época exige en cada resultado: de qué clase es, cuánto se puede
  // guardar una lista —nada, y solo quien la pidió— y qué servidor lo firma.
  const lista = await pedir(env, 'POST', camino, { cuerpo: rpc('tools/list', sobre('2026-07-28')), cabeceras });
  assert.equal(lista.cuerpo.result._meta['io.modelcontextprotocol/serverInfo'].name, 'agenda-familiar');
  assert.equal(lista.cuerpo.result.resultType, 'complete');
  assert.equal(lista.cuerpo.result.ttlMs, 0);
  assert.equal(lista.cuerpo.result.cacheScope, 'private');
  assert.ok(lista.cuerpo.result.tools.length > 0);

  const llamada = await pedir(env, 'POST', camino, {
    cuerpo: rpc('tools/call', { ...sobre('2026-07-28'), name: 'ver_mejoras', arguments: {} }), cabeceras,
  });
  assert.equal(llamada.cuerpo.result.resultType, 'complete');
  assert.equal(llamada.cuerpo.result.ttlMs, undefined, 'una llamada no se guarda');

  // En la época del saludo, nada de esto: un cliente de 2025 no lo conoce.
  const clasica = await pedir(env, 'POST', camino, { cuerpo: rpc('tools/list') });
  assert.equal(clasica.cuerpo.result.resultType, undefined);
  assert.equal(clasica.cuerpo.result._meta, undefined);

  const futura = await pedir(env, 'POST', camino, { cuerpo: rpc('tools/list', sobre('2027-03-01')) });
  assert.equal(futura.estado, 400);
  assert.equal(futura.cuerpo.error.code, -32022);
  assert.deepEqual(futura.cuerpo.error.data, { supported: ['2026-07-28'], requested: '2027-03-01' });
});

test('la lista de herramientas, cada una con su esquema y sus avisos de lectura', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const { cuerpo } = await pedir(env, 'POST', camino, { cuerpo: rpc('tools/list') });
  const herramientas = cuerpo.result.tools;

  assert.deepEqual(herramientas.map((h) => h.name), [
    'ver_agenda', 'ver_gente', 'ver_regalos', 'ver_sitios', 'ver_mejoras',
    'apuntar_evento', 'apuntar_idea', 'apuntar_en_sitio', 'apuntar_cena', 'apuntar_mejora',
  ]);
  for (const herramienta of herramientas) {
    assert.match(herramienta.name, /^[a-z_]{1,64}$/);
    assert.equal(herramienta.inputSchema.type, 'object', herramienta.name);
    assert.ok(herramienta.description.length > 40, herramienta.name);
    assert.equal(herramienta.annotations.readOnlyHint, herramienta.name.startsWith('ver_'), herramienta.name);
  }
});

test('un método o una herramienta que no existen son errores del protocolo', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');

  const metodo = await pedir(env, 'POST', camino, { cuerpo: rpc('nada/de/esto') });
  assert.equal(metodo.cuerpo.error.code, -32601);

  const herramienta = await pedir(env, 'POST', camino, { cuerpo: rpc('tools/call', { name: 'borrar_todo', arguments: {} }) });
  assert.equal(herramienta.cuerpo.error.code, -32602);
});

test('un lote se contesta mensaje a mensaje, sin los avisos', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const { estado, cuerpo } = await pedir(env, 'POST', camino, {
    cuerpo: [
      rpc('initialize', { protocolVersion: '2025-03-26' }, 1),
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      rpc('ping', null, 2),
    ],
  });
  assert.equal(estado, 200);
  assert.deepEqual(cuerpo.map((r) => r.id), [1, 2]);
  assert.equal(cuerpo[0].result.protocolVersion, '2025-03-26');
});

// ---------------------------------------------------- Los tres ejemplos --

test('«el miércoles que viene, médico de Lío» queda como lo deja el formulario', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');

  const { texto, error } = await usar(env, camino, 'apuntar_evento', {
    titulo: 'Médico de Lío', fecha: '2026-10-14', tipo: 'cita_medica',
  });
  assert.equal(error, false, texto);
  assert.match(texto, /«Médico de Lío»/);
  assert.match(texto, /miércoles 14 de Octubre de 2026/, 'la fecha vuelve en palabras para confirmarla');
  assert.match(texto, /todo el día/);
  assert.match(texto, /Cita médica/);

  // La `0027` ya siembra el curso de Falu: se busca por título.
  const [evento] = env.DB.filas("SELECT * FROM evento WHERE titulo = 'Médico de Lío'");
  assert.equal(evento.inicio, '2026-10-14');
  assert.equal(evento.fin, null);
  assert.equal(evento.jornada_completa, 1);
  assert.equal(evento.tipo_id, 'cita_medica');
  assert.equal(evento.origen, 'manual');
  assert.equal(evento.autor_id, 'p-oscar');
  assert.equal(evento.activo, 1);

  // Pedirlo otra vez no lo duplica.
  const otra = await usar(env, camino, 'apuntar_evento', { titulo: 'médico de lío', fecha: '2026-10-14' });
  assert.match(otra.texto, /Ya estaba apuntado/);
  assert.equal(env.DB.filas("SELECT * FROM evento WHERE titulo LIKE 'M_dico de L_o'").length, 1);

  // Con hora, de alguien y hasta otro día: los mismos campos que la pantalla.
  const conHora = await usar(env, camino, 'apuntar_evento', {
    titulo: 'Campamento', fecha: '2026-10-20', hora: '9:00', hasta: '2026-10-22', de_quien: ['Falu'],
  });
  assert.equal(conHora.error, false, conHora.texto);
  const campamento = env.DB.filas("SELECT * FROM evento WHERE titulo = 'Campamento'")[0];
  assert.equal(campamento.inicio, '2026-10-20T09:00:00');
  assert.equal(campamento.fin, '2026-10-22T09:00:00');
  assert.equal(campamento.jornada_completa, 0);
  assert.deepEqual(
    env.DB.filas('SELECT persona_id, rol FROM participante_evento WHERE evento_id = ?', campamento.id),
    [{ persona_id: 'p-mariona', rol: 'protagonista' }],
  );
});

test('«apunta para Ana una idea de regalo de un bolso»: Ana no la ve, y las niñas tampoco', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');

  const { texto, error } = await usar(env, deOscar, 'apuntar_idea', { para: ['Ana'], titulo: 'Bolso', precio: 80 });
  assert.equal(error, false, texto);
  assert.match(texto, /Idea apuntada para Ana: «Bolso», unos 80 €/);
  assert.match(texto, /La ven: Óscar\./);
  assert.match(texto, /Oculta para: .*Ana/);

  const [idea] = env.DB.filas('SELECT * FROM idea');
  assert.equal(idea.tipo, 'sugerencia');
  assert.equal(idea.autor_id, 'p-oscar');
  assert.equal(idea.para_todos, 0);
  assert.deepEqual(env.DB.filas('SELECT persona_id FROM orientacion_idea'), [{ persona_id: 'p-ana' }]);

  // Óscar la ve; Ana no, ni preguntando por sí misma; Marta tampoco, porque la
  // apuntó un administrador sin «también las niñas».
  assert.match((await usar(env, deOscar, 'ver_regalos', { para: 'Ana' })).texto, /Idea: Bolso/);
  const deAna = await enlaceDe(env, 'p-ana');
  assert.doesNotMatch((await usar(env, deAna, 'ver_regalos')).texto, /Bolso/);
  assert.doesNotMatch((await usar(env, deAna, 'ver_regalos', { para: 'Ana' })).texto, /Bolso/);
  const deMarta = await enlaceDe(env, 'p-marta');
  assert.doesNotMatch((await usar(env, deMarta, 'ver_regalos', { para: 'Ana' })).texto, /Bolso/);

  // Con `para_todos`, las niñas sí; Ana sigue sin verla.
  await usar(env, deOscar, 'apuntar_idea', { para: ['Ana'], titulo: 'Pulsera', para_todos: true });
  assert.match((await usar(env, deMarta, 'ver_regalos', { para: 'Ana' })).texto, /Pulsera/);
  assert.doesNotMatch((await usar(env, deAna, 'ver_regalos')).texto, /Pulsera/);
});

test('lo que uno apunta para sí es un deseo, y lo ven los demás', async () => {
  const env = casa();
  const deMarta = await enlaceDe(env, 'p-marta');

  const { texto } = await usar(env, deMarta, 'apuntar_idea', { para: 'yo', titulo: 'Botas de montar' });
  assert.match(texto, /Apuntado en tus deseos/);
  assert.equal(env.DB.filas('SELECT tipo FROM idea')[0].tipo, 'deseo');

  const deOscar = await enlaceDe(env, 'p-oscar');
  assert.match((await usar(env, deOscar, 'ver_regalos', { para: 'Marta' })).texto, /Pide: Botas de montar/);
  assert.match((await usar(env, deMarta, 'ver_regalos', { para: 'Marta' })).texto, /Lo que has pedido:[\s\S]*Botas/);
});

test('«apunta para Llivia llevar un ladrón blanco de dos enchufes»', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const pedido = { sitio: 'Llivia', clase: 'llevar', titulo: 'Ladrón blanco de dos enchufes' };

  // Sin el sitio, no se inventa: dice cuáles hay y cómo crearlo.
  const sinSitio = await usar(env, camino, 'apuntar_en_sitio', pedido);
  assert.equal(sinSitio.error, true);
  assert.match(sinSitio.texto, /crear_sitio: true/);
  assert.equal(env.DB.filas('SELECT * FROM lugar').length, 0);

  const creado = await usar(env, camino, 'apuntar_en_sitio', { ...pedido, sitio: '⛰️ Llivia', crear_sitio: true });
  assert.equal(creado.error, false, creado.texto);
  assert.match(creado.texto, /Llivia › Llevar: «Ladrón blanco de dos enchufes»/);
  const [lugar] = env.DB.filas('SELECT * FROM lugar');
  assert.equal(lugar.nombre, 'Llivia');
  assert.equal(lugar.emoji, '⛰️');
  const [apunte] = env.DB.filas('SELECT * FROM apunte');
  assert.equal(apunte.clase, 'llevar');
  assert.equal(apunte.lugar_id, lugar.id);
  assert.equal(apunte.detalle, null, 'en Llevar no se guarda detalle');

  // El siguiente va al sitio que ya hay, escrito como se escriba.
  await usar(env, camino, 'apuntar_en_sitio', { sitio: 'llivia', clase: 'llevar', titulo: 'Crema solar' });
  assert.equal(env.DB.filas('SELECT * FROM lugar').length, 1);
  assert.match((await usar(env, camino, 'apuntar_en_sitio', pedido)).texto, /Ya estaba apuntado/);

  const visto = await usar(env, camino, 'ver_sitios', { sitio: 'Llivia' });
  assert.match(visto.texto, /Llevar:\n {2}\[ \] Ladrón blanco de dos enchufes\n {2}\[ \] Crema solar/);
  assert.match((await usar(env, camino, 'ver_sitios')).texto, /⛰️ Llivia — 2 llevar/);
});

test('Sitios y Cenas son de quien vive en casa', async () => {
  const env = casa();
  const deLaTia = await enlaceDe(env, 'p-tia');
  for (const [nombre, argumentos] of [
    ['ver_sitios', {}],
    ['apuntar_en_sitio', { sitio: 'Llivia', titulo: 'Toalla', crear_sitio: true }],
    ['apuntar_cena', { fecha: '2026-10-15', plato: 'Lentejas' }],
  ]) {
    const { error, texto } = await usar(env, deLaTia, nombre, argumentos);
    assert.equal(error, true, nombre);
    assert.match(texto, /de quien vive en casa/, nombre);
  }
  assert.equal(env.DB.filas('SELECT * FROM lugar').length, 0);
});

// ------------------------------------------------------------ Consultar --

test('la agenda cuenta cada día con lo que se ve, y lo que no se ve no sale', async () => {
  const env = casa();
  const { sqlite } = env.DB;
  const evento = (id, campos) => {
    const columnas = Object.keys(campos);
    sqlite.prepare(`INSERT INTO evento (id, ${columnas.join(', ')}) VALUES (?, ${columnas.map(() => '?').join(', ')})`)
      .run(id, ...Object.values(campos));
  };
  evento('e-dentista', { titulo: 'Dentista', tipo_id: 'cita_medica', inicio: '2026-11-03T09:30:00', autor_id: 'p-oscar' });
  sqlite.prepare("INSERT INTO participante_evento (evento_id, persona_id, rol) VALUES ('e-dentista', 'p-marta', 'protagonista')").run();
  evento('e-compras', {
    titulo: 'Compras de Navidad', tipo_id: 'otro', inicio: '2026-11-03', jornada_completa: 1,
    categoria_id: 'coordinacion', autor_id: 'p-oscar',
  });
  evento('e-bolonia', { titulo: 'Bolonia', tipo_id: 'otro', inicio: '2026-11-02', fin: '2026-11-05', jornada_completa: 1 });
  evento('e-hipica', {
    titulo: 'Hípica', tipo_id: 'recurrente', inicio: '2026-09-01T17:30:00', repeticion: 'semanal',
    plugin_id: 'extraescolar',
    extra: JSON.stringify({ dias: [1], reparto: { 1: { lleva: 'p-ana', recoge: 'p-oscar' } } }),
  });
  sqlite.prepare("INSERT INTO evento_dia (id, evento_id, fecha, cancelado) VALUES ('dia:e-hipica:2026-11-10', 'e-hipica', '2026-11-10', 1)").run();
  sqlite.prepare("INSERT INTO configuracion (clave, valor) VALUES ('lio.cuadro', ?)").run(JSON.stringify({
    manana: Array(7).fill('p-oscar'), noche: Array(7).fill('p-ana'),
  }));
  sqlite.prepare("INSERT INTO cena (id, fecha, texto, activo) VALUES ('cena:2026-11-03', '2026-11-03', 'Lentejas', 1)").run();

  const deOscar = await enlaceDe(env, 'p-oscar');
  const { texto, error } = await usar(env, deOscar, 'ver_agenda', { desde: '2026-11-03', hasta: '2026-11-03' });
  assert.equal(error, false, texto);
  assert.match(texto, /^Hoy es /);
  assert.match(texto, /martes 3 de Noviembre/);
  assert.match(texto, /todo el día · Bolonia \(cont\.\)/);
  assert.match(texto, /todo el día · Compras de Navidad/);
  assert.match(texto, /09:30 · Dentista · de Marta/);
  assert.match(texto, /17:30 · Hípica · lleva Ana, recoge Óscar/);
  assert.match(texto, /Lío \(el perro\): lo saca por la mañana Óscar y por la noche Ana/);
  assert.match(texto, /Cena: Lentejas/);

  // Lo reservado a los administradores no le llega a Marta, ni lo de casa a la tía.
  const deMarta = await enlaceDe(env, 'p-marta');
  const deMartaTexto = (await usar(env, deMarta, 'ver_agenda', { desde: '2026-11-03', hasta: '2026-11-03' })).texto;
  assert.doesNotMatch(deMartaTexto, /Compras de Navidad/);
  assert.match(deMartaTexto, /Dentista/);
  const deLaTia = await enlaceDe(env, 'p-tia');
  const deLaTiaTexto = (await usar(env, deLaTia, 'ver_agenda', { desde: '2026-11-03', hasta: '2026-11-03' })).texto;
  assert.doesNotMatch(deLaTiaTexto, /Hípica|Lío|Cena/);
  assert.match(deLaTiaTexto, /Dentista/);

  // El día que no hay, se dice; y el cumpleaños sale con los años que cumple.
  const otroMartes = (await usar(env, deOscar, 'ver_agenda', { desde: '2026-11-10', hasta: '2026-11-10' })).texto;
  assert.match(otroMartes, /Hípica · lleva Ana, recoge Óscar · este día no hay/);
  const cumple = (await usar(env, deOscar, 'ver_agenda', { desde: '2026-10-15', hasta: '2026-10-15' })).texto;
  assert.match(cumple, /todo el día · Cumpleaños de Ana · cumple 46/);
});

test('la gente, con su apodo, su cumpleaños y quién habla', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-marta');
  const { texto } = await usar(env, camino, 'ver_gente');
  assert.match(texto, /Familia, en casa:/);
  assert.match(texto, /Mariona \(«Falu»\)/);
  assert.match(texto, /Marta \(quien habla\)/);
  assert.match(texto, /Ana Doral · \d+ años · cumpleaños el 15 de Octubre/);
  assert.match(texto, /Familia extendida:[\s\S]*Pilar · abuela/);
});

// -------------------------------------------------------- Lo que se pregunta --

test('un nombre que no está, o que puede ser dos, se devuelve para preguntar', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');

  const nadie = await usar(env, camino, 'apuntar_idea', { para: ['Lucía'], titulo: 'Libro' });
  assert.equal(nadie.error, true);
  assert.match(nadie.texto, /No hay nadie que se llame «Lucía»/);

  const dos = await usar(env, camino, 'apuntar_idea', { para: ['Mar'], titulo: 'Libro' });
  assert.equal(dos.error, true);
  assert.match(dos.texto, /puede ser .*Mariona.*Marta|puede ser .*Marta.*Mariona/);

  assert.equal(env.DB.filas('SELECT * FROM idea').length, 0, 'en la duda no se apunta nada');
});

test('fechas imposibles y tramos demasiado largos se dicen', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const imposible = await usar(env, camino, 'apuntar_evento', { titulo: 'Algo', fecha: '2026-02-30' });
  assert.equal(imposible.error, true);
  assert.match(imposible.texto, /AAAA-MM-DD/);

  const largo = await usar(env, camino, 'ver_agenda', { desde: '2026-10-01', hasta: '2026-12-31' });
  assert.equal(largo.error, true);
  assert.match(largo.texto, /como mucho 31 días/);
});

// ------------------------------------------------------ Cenas y mejoras --

test('una cena no pisa otra sin permiso, y el plato del recetario se enlaza', async () => {
  const env = casa();
  env.DB.sqlite.prepare("INSERT INTO receta (id, nombre, activo) VALUES ('r-lentejas', 'Lentejas', 1)").run();
  const camino = await enlaceDe(env, 'p-ana');

  const primera = await usar(env, camino, 'apuntar_cena', { fecha: '2026-10-15', plato: 'lentejas' });
  assert.equal(primera.error, false, primera.texto);
  assert.match(primera.texto, /jueves 15 de Octubre de 2026 .*Lentejas/);
  let [cena] = env.DB.filas('SELECT * FROM cena');
  assert.equal(cena.id, 'cena:2026-10-15');
  assert.equal(cena.receta_id, 'r-lentejas');
  assert.equal(cena.texto, null);

  const sinPermiso = await usar(env, camino, 'apuntar_cena', { fecha: '2026-10-15', plato: 'Pizza' });
  assert.equal(sinPermiso.error, true);
  assert.match(sinPermiso.texto, /ya hay apuntado «Lentejas»/);

  const cambiada = await usar(env, camino, 'apuntar_cena', {
    fecha: '2026-10-15', plato: 'Pizza', ninas: 'Pasta', reemplazar: true,
  });
  assert.match(cambiada.texto, /Sustituye a «Lentejas»/);
  [cena] = env.DB.filas('SELECT * FROM cena');
  assert.equal(cena.receta_id, null);
  assert.equal(cena.texto, 'Pizza');
  assert.equal(cena.ninas_texto, 'Pasta');
});

test('las mejoras se apuntan una vez y se leen', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  await usar(env, camino, 'apuntar_mejora', { texto: 'Que la semana empiece en hoy' });
  assert.match((await usar(env, camino, 'apuntar_mejora', { texto: 'que la semana empiece en hoy' })).texto, /ya estaba/);
  assert.equal(env.DB.filas('SELECT * FROM mejora').length, 1);
  assert.match((await usar(env, camino, 'ver_mejoras')).texto, /^\[ \] Que la semana empiece en hoy — Óscar/);
});
