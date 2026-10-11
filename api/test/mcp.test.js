/**
 * Claude por MCP, de la petición a la base: el enlace de cada uno, el protocolo
 * y lo que se consulta, se apunta, se cambia, se borra y se comenta.
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

/** La referencia que devuelve un «apuntar», o la primera entre corchetes. */
function refDe(texto) {
  const hallada = /Referencia: (\S+)/.exec(texto)
    || /\[((?:evento|idea|regalo|sitio|apunte|mejora|comentario):[\w-]+|cena:\d{4}-\d{2}-\d{2})\]/.exec(texto);
  assert.ok(hallada, `sin referencia en: ${texto}`);
  return hallada[1];
}

/** Una fila escrita a mano, como la habría dejado la aplicación. */
function insertar(env, tabla, campos) {
  const columnas = Object.keys(campos);
  env.DB.sqlite
    .prepare(`INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`)
    .run(...Object.values(campos));
}

const hoyEnMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const masDias = (iso, dias) => new Date(Date.parse(`${iso}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

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
    'ver_detalle', 'editar_evento', 'editar_idea', 'editar_regalo', 'editar_apunte', 'editar_mejora',
    'borrar', 'marcar_hecho', 'marcar_paseo_de_lio', 'comentar',
  ]);
  for (const herramienta of herramientas) {
    assert.match(herramienta.name, /^[a-z_]{1,64}$/);
    assert.equal(herramienta.inputSchema.type, 'object', herramienta.name);
    assert.ok(herramienta.description.length > 40, herramienta.name);
    assert.equal(herramienta.annotations.readOnlyHint, herramienta.name.startsWith('ver_'), herramienta.name);
  }

  // Lo que puede pisar o quitar algo lo dice, para que el cliente pregunte;
  // apuntar y comentar solo añaden.
  const pisan = herramientas.filter((h) => h.annotations.destructiveHint).map((h) => h.name);
  assert.deepEqual(pisan, [
    'apuntar_cena', 'editar_evento', 'editar_idea', 'editar_regalo', 'editar_apunte', 'editar_mejora',
    'borrar', 'marcar_hecho', 'marcar_paseo_de_lio',
  ]);
  for (const nombre of ['ver_detalle', 'editar_evento', 'borrar', 'marcar_hecho', 'comentar']) {
    assert.ok(herramientas.find((h) => h.name === nombre).inputSchema.required.includes('ref'), nombre);
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
  assert.match(
    visto.texto,
    /Llevar:\n {2}\[ \] Ladrón blanco de dos enchufes \[apunte:[\w-]+\]\n {2}\[ \] Crema solar \[apunte:[\w-]+\]/,
  );
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

  // La noche se queda sin cena, y el recetario no se toca.
  const quitada = await usar(env, camino, 'borrar', { ref: 'cena:2026-10-15' });
  assert.equal(quitada.error, false, quitada.texto);
  assert.match(quitada.texto, /queda sin cena apuntada/);
  assert.equal(env.DB.filas('SELECT activo FROM cena')[0].activo, 0);
  assert.equal(env.DB.filas('SELECT activo FROM receta')[0].activo, 1);
});

test('las mejoras se apuntan una vez y se leen', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  await usar(env, camino, 'apuntar_mejora', { texto: 'Que la semana empiece en hoy' });
  assert.match((await usar(env, camino, 'apuntar_mejora', { texto: 'que la semana empiece en hoy' })).texto, /ya estaba/);
  assert.equal(env.DB.filas('SELECT * FROM mejora').length, 1);
  const lista = (await usar(env, camino, 'ver_mejoras')).texto;
  assert.match(lista, /^\[ \] Que la semana empiece en hoy — Óscar.*\[mejora:[\w-]+\]$/);

  assert.match((await usar(env, camino, 'borrar', { ref: refDe(lista) })).texto, /Mejora quitada/);
  assert.equal((await usar(env, camino, 'ver_mejoras')).texto, 'No hay mejoras apuntadas.');
});

// ----------------------------------------------- Referencias y detalle --

test('cada cosa consultada lleva su referencia, y ver_detalle la cuenta entera', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const apuntado = await usar(env, camino, 'apuntar_evento', {
    titulo: 'Médico de Lío', fecha: '2026-10-14', hora: '17:00', donde: 'Clínica Sur', notas: 'Llevar la cartilla',
    de_quien: ['Falu'],
  });
  const ref = refDe(apuntado.texto);
  assert.match(ref, /^evento:[\w-]+$/);

  const agenda = (await usar(env, camino, 'ver_agenda', { desde: '2026-10-14', hasta: '2026-10-14' })).texto;
  assert.ok(agenda.includes('17:00 · Médico de Lío'), agenda);
  assert.ok(agenda.includes(`[${ref}]`), 'la línea de la agenda lleva su referencia');

  // Con corchetes o sin ellos, como venga copiada.
  for (const forma of [ref, `[${ref}]`]) {
    const { texto, error } = await usar(env, camino, 'ver_detalle', { ref: forma });
    assert.equal(error, false, texto);
    assert.match(texto, /^Evento «Médico de Lío» \[evento:/);
    assert.match(texto, /Cuándo: miércoles 14 de Octubre de 2026, a las 17:00\./);
    assert.match(texto, /Dónde: Clínica Sur\./);
    assert.match(texto, /De: Falu\./);
    assert.match(texto, /Notas: Llevar la cartilla/);
    assert.match(texto, /Apuntado por Óscar/);
    assert.match(texto, /Comentarios: ninguno todavía\./);
  }

  const mal = await usar(env, camino, 'ver_detalle', { ref: 'el médico' });
  assert.equal(mal.error, true);
  assert.match(mal.texto, /no es una referencia/);
  const inventada = await usar(env, camino, 'ver_detalle', { ref: 'evento:no-existe' });
  assert.equal(inventada.error, true);
  assert.match(inventada.texto, /No encuentro evento:no-existe/);
});

test('lo que una cuenta no ve no se puede tocar, aunque se sepa su referencia', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');
  const ref = refDe((await usar(env, deOscar, 'apuntar_idea', { para: ['Ana'], titulo: 'Bolso' })).texto);

  const deAna = await enlaceDe(env, 'p-ana');
  for (const [nombre, argumentos] of [
    ['ver_detalle', { ref }],
    ['editar_idea', { ref, titulo: 'Ya lo sé' }],
    ['borrar', { ref, confirmado: true }],
    ['comentar', { ref, texto: '¿Qué es esto?' }],
  ]) {
    const { error, texto } = await usar(env, deAna, nombre, argumentos);
    assert.equal(error, true, nombre);
    assert.equal(texto, `No encuentro ${ref}: o ya no está, o tu cuenta no lo ve.`, nombre);
  }
  const [idea] = env.DB.filas('SELECT * FROM idea');
  assert.equal(idea.titulo, 'Bolso');
  assert.equal(idea.activa, 1);
  assert.equal(env.DB.filas('SELECT * FROM comentario').length, 0);
});

// --------------------------------------------------------------- Cambiar --

test('editar un evento cambia solo lo que se dice, como lo guarda el formulario', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const fila = (ref) => env.DB.filas('SELECT * FROM evento WHERE id = ?', ref.split(':')[1])[0];
  const medico = refDe((await usar(env, camino, 'apuntar_evento', {
    titulo: 'Médico de Lío', fecha: '2026-10-14', notas: 'Ayunas',
  })).texto);

  const conHora = await usar(env, camino, 'editar_evento', { ref: medico, hora: '17:30', donde: 'Clínica Sur' });
  assert.equal(conHora.error, false, conHora.texto);
  assert.match(conHora.texto, /^Cambiado\. Así queda:\nEvento «Médico de Lío»/);
  assert.match(conHora.texto, /Cuándo: miércoles 14 de Octubre de 2026, a las 17:30\./);
  assert.equal(fila(medico).inicio, '2026-10-14T17:30:00');
  assert.equal(fila(medico).jornada_completa, 0);
  assert.equal(fila(medico).ubicacion, 'Clínica Sur');
  assert.equal(fila(medico).notas, 'Ayunas', 'lo que no se dice no se toca');

  // Una hora vacía la quita: vuelve a ser de todo el día.
  await usar(env, camino, 'editar_evento', { ref: medico, hora: '' });
  assert.equal(fila(medico).inicio, '2026-10-14');
  assert.equal(fila(medico).jornada_completa, 1);

  // Mover algo de varios días conserva lo que dura, con su hora; de quién es se
  // sustituye entero.
  const campamento = refDe((await usar(env, camino, 'apuntar_evento', {
    titulo: 'Campamento', fecha: '2026-10-20', hora: '9:00', hasta: '2026-10-22', de_quien: ['Falu'],
  })).texto);
  await usar(env, camino, 'editar_evento', { ref: campamento, fecha: '2026-10-27', de_quien: ['Marta', 'Falu'] });
  assert.equal(fila(campamento).inicio, '2026-10-27T09:00:00');
  assert.equal(fila(campamento).fin, '2026-10-29T09:00:00');
  assert.deepEqual(
    env.DB.filas('SELECT persona_id, rol FROM participante_evento WHERE evento_id = ? ORDER BY persona_id', fila(campamento).id),
    [{ persona_id: 'p-mariona', rol: 'protagonista' }, { persona_id: 'p-marta', rol: 'protagonista' }],
  );
  // Y un «hasta» vacío lo deja en un solo día.
  await usar(env, camino, 'editar_evento', { ref: campamento, hasta: '' });
  assert.equal(fila(campamento).fin, null);

  const nada = await usar(env, camino, 'editar_evento', { ref: medico });
  assert.equal(nada.error, true);
  assert.match(nada.texto, /no hay nada que cambiar/);
  const alReves = await usar(env, camino, 'editar_evento', { ref: campamento, hasta: '2026-10-01' });
  assert.equal(alReves.error, true);
  assert.match(alReves.texto, /no puede ir antes/);
});

test('de una recurrente se cambia el título, y lo importado no se toca', async () => {
  const env = casa();
  insertar(env, 'evento', {
    id: 'e-hipica', titulo: 'Hípica', tipo_id: 'recurrente', inicio: '2026-09-01T17:30:00', repeticion: 'semanal',
    plugin_id: 'extraescolar', extra: JSON.stringify({ dias: [1], reparto: {} }),
  });
  insertar(env, 'evento', {
    id: 'e-vuelo', titulo: 'Madrid → Bolonia', tipo_id: 'viaje', inicio: '2026-11-02T08:00:00', origen: 'importado',
  });
  const camino = await enlaceDe(env, 'p-oscar');

  const otraFecha = await usar(env, camino, 'editar_evento', { ref: 'evento:e-hipica', fecha: '2026-09-02' });
  assert.equal(otraFecha.error, true);
  assert.match(otraFecha.texto, /es una recurrente/);
  const titulo = await usar(env, camino, 'editar_evento', { ref: 'evento:e-hipica', titulo: '🐴 Hípica' });
  assert.equal(titulo.error, false, titulo.texto);
  assert.match(titulo.texto, /Se repite cada semana: martes\./);
  assert.equal(env.DB.filas("SELECT titulo FROM evento WHERE id = 'e-hipica'")[0].titulo, '🐴 Hípica');

  for (const [nombre, argumentos] of [
    ['editar_evento', { ref: 'evento:e-vuelo', titulo: 'Otro' }],
    ['borrar', { ref: 'evento:e-vuelo' }],
  ]) {
    const { error, texto } = await usar(env, camino, nombre, argumentos);
    assert.equal(error, true, nombre);
    assert.match(texto, /viene del calendario/, nombre);
  }
  assert.deepEqual(env.DB.filas("SELECT titulo, activo FROM evento WHERE id = 'e-vuelo'"), [{ titulo: 'Madrid → Bolonia', activo: 1 }]);
});

test('una idea, un apunte y una mejora se corrigen, y la idea dice quién la ve', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');
  const deMarta = await enlaceDe(env, 'p-marta');
  const bolso = refDe((await usar(env, deOscar, 'apuntar_idea', { para: ['Ana'], titulo: 'Bolso', precio: 80 })).texto);

  const cambiada = await usar(env, deOscar, 'editar_idea', {
    ref: bolso, titulo: 'Bolso de piel', precio: null, para: ['Ana', 'Marta'],
  });
  assert.equal(cambiada.error, false, cambiada.texto);
  assert.match(cambiada.texto, /^Cambiada\. Así queda:\nIdea «Bolso de piel»/);
  // Las dos a quienes va, y quienes no administran: la apuntó un administrador.
  assert.match(cambiada.texto, /La ven: Óscar\.\nOculta para: Ana, Carmen, Falu y Marta\.$/);
  const [idea] = env.DB.filas('SELECT * FROM idea');
  assert.equal(idea.titulo, 'Bolso de piel');
  assert.equal(idea.precio_max, null);
  assert.deepEqual(
    env.DB.filas('SELECT persona_id FROM orientacion_idea ORDER BY persona_id'),
    [{ persona_id: 'p-ana' }, { persona_id: 'p-marta' }],
  );

  // Solo para quien la apunta no puede ser: eso es un deseo.
  const paraMi = await usar(env, deOscar, 'editar_idea', { ref: bolso, para: ['yo'] });
  assert.equal(paraMi.error, true);
  assert.match(paraMi.texto, /apúntalo como deseo/);

  // «También las niñas» es de quien administra, y un deseo es de quien lo pide.
  const libro = refDe((await usar(env, deMarta, 'apuntar_idea', { para: ['Pilar'], titulo: 'Libro' })).texto);
  const todos = await usar(env, deMarta, 'editar_idea', { ref: libro, para_todos: true });
  assert.equal(todos.error, true);
  assert.match(todos.texto, /solo lo cambia quien administra/);
  const botas = refDe((await usar(env, deMarta, 'apuntar_idea', { para: 'yo', titulo: 'Botas' })).texto);
  const deseoAjeno = await usar(env, deOscar, 'editar_idea', { ref: botas, para: ['Ana'] });
  assert.equal(deseoAjeno.error, true);
  assert.match(deseoAjeno.texto, /Un deseo es de quien lo pide/);

  // Ponerse uno mismo entre quienes la reciben la esconde de su cuenta, y se dice.
  const conmigo = await usar(env, deOscar, 'editar_idea', { ref: bolso, para: ['Ana', 'yo'] });
  assert.equal(conmigo.error, false, conmigo.texto);
  assert.match(conmigo.texto, /^Cambiada\. Con este cambio tu cuenta deja de verlo/);
  assert.match(conmigo.texto, /Oculta para: .*Óscar/);

  // Un apunte de Llevar no lleva detalle; cualquiera de casa lo corrige.
  const pimienta = refDe((await usar(env, deOscar, 'apuntar_en_sitio', {
    sitio: 'Llivia', clase: 'llevar', titulo: 'Pimienta japones', crear_sitio: true,
  })).texto);
  const conDetalle = await usar(env, deOscar, 'editar_apunte', { ref: pimienta, detalle: 'Del súper' });
  assert.equal(conDetalle.error, true);
  assert.match(conDetalle.texto, /no lleva detalle/);
  const corregido = await usar(env, deMarta, 'editar_apunte', { ref: pimienta, titulo: 'Pimienta japonesa' });
  assert.equal(corregido.error, false, corregido.texto);
  assert.match(corregido.texto, /Apunte «Pimienta japonesa» en Llivia › Llevar/);
  await usar(env, deOscar, 'editar_apunte', { ref: pimienta, clase: 'saber', detalle: 'En el súper de Puigcerdà' });
  assert.deepEqual(
    env.DB.filas('SELECT titulo, clase, detalle FROM apunte'),
    [{ titulo: 'Pimienta japonesa', clase: 'saber', detalle: 'En el súper de Puigcerdà' }],
  );

  const mejora = refDe((await usar(env, deOscar, 'apuntar_mejora', { texto: 'Que la semana empiece en hoy' })).texto);
  const otra = await usar(env, deMarta, 'editar_mejora', { ref: mejora, texto: 'Que la semana empiece hoy' });
  assert.equal(otra.error, false, otra.texto);
  assert.equal(env.DB.filas('SELECT texto FROM mejora')[0].texto, 'Que la semana empiece hoy');
});

test('un regalo cambia de estado y de encargado, y quitarlo devuelve su idea', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');
  const idea = refDe((await usar(env, deOscar, 'apuntar_idea', { para: ['Ana'], titulo: 'Bolso' })).texto);
  insertar(env, 'ocasion', { id: 'o-cumple', nombre: 'Cumpleaños de Ana', fecha: '2026-10-15', autor_id: 'p-oscar' });
  insertar(env, 'regalo', {
    id: 'g-bolso', ocasion_id: 'o-cumple', idea_id: idea.split(':')[1], destinatario_principal_id: 'p-ana', autor_id: 'p-oscar',
  });

  // De la idea cuelga un regalo: borrarla pide confirmado.
  const sinConfirmar = await usar(env, deOscar, 'borrar', { ref: idea });
  assert.equal(sinConfirmar.error, true);
  assert.match(sinConfirmar.texto, /cuelga un regalo.*confirmado: true/s);
  assert.equal(env.DB.filas('SELECT activa FROM idea')[0].activa, 1);

  const listo = await usar(env, deOscar, 'editar_regalo', { ref: 'regalo:g-bolso', estado: 'listo', se_encarga: 'yo', coste: 45.5 });
  assert.equal(listo.error, false, listo.texto);
  assert.match(listo.texto, /Regalo «Bolso» \[regalo:g-bolso\]/);
  assert.match(listo.texto, /Estado: listo\./);
  assert.match(listo.texto, /Se encarga: Óscar\./);
  assert.match(listo.texto, /Ha costado: 45,5 €\./);
  assert.deepEqual(
    env.DB.filas('SELECT estado, responsable_id, coste_real FROM regalo'),
    [{ estado: 'comprado', responsable_id: 'p-oscar', coste_real: 45.5 }],
  );

  await usar(env, deOscar, 'editar_regalo', { ref: 'regalo:g-bolso', se_encarga: 'nadie', coste: null });
  assert.deepEqual(env.DB.filas('SELECT responsable_id, coste_real FROM regalo'), [{ responsable_id: null, coste_real: null }]);
  assert.equal((await usar(env, deOscar, 'editar_regalo', { ref: 'regalo:g-bolso', estado: 'envuelto' })).error, true);

  // Entregarlo cierra la idea, como en la aplicación; quitarlo la devuelve al banco.
  await usar(env, deOscar, 'editar_regalo', { ref: 'regalo:g-bolso', estado: 'entregado' });
  assert.equal(env.DB.filas('SELECT estado FROM idea')[0].estado, 'cerrada');
  const quitado = await usar(env, deOscar, 'borrar', { ref: 'regalo:g-bolso' });
  assert.equal(quitado.error, false, quitado.texto);
  assert.match(quitado.texto, /la idea de la que salió vuelve a estar disponible/);
  assert.equal(env.DB.filas('SELECT activo FROM regalo')[0].activo, 0);
  assert.equal(env.DB.filas('SELECT estado FROM idea')[0].estado, 'activa');

  // Sin nada colgando, se borra sin preguntar más.
  assert.equal((await usar(env, deOscar, 'borrar', { ref: idea })).error, false);
  assert.equal(env.DB.filas('SELECT activa FROM idea')[0].activa, 0);
});

// ---------------------------------------------------------------- Borrar --

test('borrar: un evento suelto, un día de algo que se repite o la serie entera', async () => {
  const env = casa();
  insertar(env, 'evento', {
    id: 'e-hipica', titulo: 'Hípica', tipo_id: 'recurrente', inicio: '2026-09-01T17:30:00', repeticion: 'semanal',
    plugin_id: 'extraescolar', extra: JSON.stringify({ dias: [1], reparto: {} }),
  });
  const camino = await enlaceDe(env, 'p-oscar');
  const medico = refDe((await usar(env, camino, 'apuntar_evento', { titulo: 'Médico de Lío', fecha: '2026-10-14' })).texto);

  const otroDia = await usar(env, camino, 'borrar', { ref: medico, fecha: '2026-10-15' });
  assert.equal(otroDia.error, true);
  assert.match(otroDia.texto, /no el jueves 15 de Octubre de 2026: no lo he borrado/);

  const borrado = await usar(env, camino, 'borrar', { ref: medico });
  assert.equal(borrado.error, false, borrado.texto);
  assert.match(borrado.texto, /Borrado de la agenda: «Médico de Lío»\./);
  assert.equal(env.DB.filas("SELECT activo FROM evento WHERE titulo = 'Médico de Lío'")[0].activo, 0, 'se apaga, no se borra');
  assert.doesNotMatch((await usar(env, camino, 'ver_agenda', { desde: '2026-10-14', hasta: '2026-10-14' })).texto, /Médico/);
  assert.match((await usar(env, camino, 'borrar', { ref: medico })).texto, /No encuentro/);

  // Lo que se repite pide decir qué: un día, o la serie con confirmado.
  const sinDecir = await usar(env, camino, 'borrar', { ref: 'evento:e-hipica' });
  assert.equal(sinDecir.error, true);
  assert.match(sinDecir.texto, /se repite cada semana: martes.*«fecha».*confirmado: true/s);
  const jueves = await usar(env, camino, 'borrar', { ref: 'evento:e-hipica', fecha: '2026-11-12' });
  assert.equal(jueves.error, true);
  assert.match(jueves.texto, /El jueves 12 de Noviembre de 2026 no hay «Hípica»/);

  const martes = await usar(env, camino, 'borrar', { ref: 'evento:e-hipica', fecha: '2026-11-17' });
  assert.equal(martes.error, false, martes.texto);
  assert.match(martes.texto, /el martes 17 de Noviembre de 2026 no hay «Hípica»; los demás días siguen igual/);
  assert.deepEqual(
    env.DB.filas('SELECT id, evento_id, fecha, cancelado, autor_id, activo FROM evento_dia'),
    [{ id: 'dia:e-hipica:2026-11-17', evento_id: 'e-hipica', fecha: '2026-11-17', cancelado: 1, autor_id: 'p-oscar', activo: 1 }],
  );
  assert.match((await usar(env, camino, 'ver_agenda', { desde: '2026-11-17', hasta: '2026-11-17' })).texto, /Hípica.*este día no hay/);
  assert.match((await usar(env, camino, 'borrar', { ref: 'evento:e-hipica', fecha: '2026-11-17' })).texto, /Ya constaba/);
  assert.equal(env.DB.filas("SELECT activo FROM evento WHERE id = 'e-hipica'")[0].activo, 1);

  const serie = await usar(env, camino, 'borrar', { ref: 'evento:e-hipica', confirmado: true });
  assert.equal(serie.error, false, serie.texto);
  assert.match(serie.texto, /con todos sus días/);
  assert.equal(env.DB.filas("SELECT activo FROM evento WHERE id = 'e-hipica'")[0].activo, 0);
});

test('un sitio se borra vacío, y un apunte lo borra quien lo escribió o quien administra', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');
  const deMarta = await enlaceDe(env, 'p-marta');
  const ladron = refDe((await usar(env, deOscar, 'apuntar_en_sitio', {
    sitio: 'Llivia', clase: 'llevar', titulo: 'Ladrón', crear_sitio: true,
  })).texto);
  const sitio = `sitio:${env.DB.filas('SELECT id FROM lugar')[0].id}`;

  const lleno = await usar(env, deOscar, 'borrar', { ref: sitio });
  assert.equal(lleno.error, true);
  assert.match(lleno.texto, /todavía tiene 1 apunte, y un sitio se borra vacío/);

  const ajeno = await usar(env, deMarta, 'borrar', { ref: ladron });
  assert.equal(ajeno.error, true);
  assert.match(ajeno.texto, /un apunte lo borra quien lo escribió/);
  assert.equal(env.DB.filas('SELECT activo FROM apunte')[0].activo, 1);

  assert.match((await usar(env, deOscar, 'borrar', { ref: ladron })).texto, /Borrado de Llivia › Llevar: «Ladrón»/);
  const vacio = await usar(env, deOscar, 'borrar', { ref: sitio });
  assert.equal(vacio.error, false, vacio.texto);
  assert.equal(env.DB.filas('SELECT activo FROM lugar')[0].activo, 0);
});

// ------------------------------------------------------------ Marcar --

test('se marca hecho lo de Llevar y una mejora, y nada más', async () => {
  const env = casa();
  const camino = await enlaceDe(env, 'p-oscar');
  const ladron = refDe((await usar(env, camino, 'apuntar_en_sitio', {
    sitio: 'Llivia', clase: 'llevar', titulo: 'Ladrón', crear_sitio: true,
  })).texto);
  const plan = refDe((await usar(env, camino, 'apuntar_en_sitio', { sitio: 'Llivia', clase: 'hacer', titulo: 'Ir al lago' })).texto);
  const mejora = refDe((await usar(env, camino, 'apuntar_mejora', { texto: 'Que la semana empiece en hoy' })).texto);
  const evento = refDe((await usar(env, camino, 'apuntar_evento', { titulo: 'Médico', fecha: '2026-10-14' })).texto);

  const hecho = await usar(env, camino, 'marcar_hecho', { ref: ladron });
  assert.equal(hecho.error, false, hecho.texto);
  assert.match(hecho.texto, /Marcado como hecho: «Ladrón»/);
  assert.match((await usar(env, camino, 'ver_sitios', { sitio: 'Llivia' })).texto, /\[x\] Ladrón/);
  assert.match((await usar(env, camino, 'marcar_hecho', { ref: ladron })).texto, /ya estaba marcado/);
  assert.match((await usar(env, camino, 'marcar_hecho', { ref: ladron, hecho: false })).texto, /Desmarcado/);
  assert.equal(env.DB.filas("SELECT hecho FROM apunte WHERE titulo = 'Ladrón'")[0].hecho, 0);

  // Volver a pedir que se lleve lo ya metido lo desmarca, en vez de repetirlo.
  await usar(env, camino, 'marcar_hecho', { ref: ladron });
  const otraVez = await usar(env, camino, 'apuntar_en_sitio', { sitio: 'Llivia', clase: 'llevar', titulo: 'ladrón' });
  assert.equal(otraVez.error, false, otraVez.texto);
  assert.match(otraVez.texto, /tachado: lo he vuelto a poner por meter/);
  assert.deepEqual(env.DB.filas("SELECT hecho FROM apunte WHERE clase = 'llevar'"), [{ hecho: 0 }]);

  await usar(env, camino, 'marcar_hecho', { ref: mejora });
  assert.equal(env.DB.filas('SELECT hecho FROM mejora')[0].hecho, 1);
  assert.match((await usar(env, camino, 'ver_mejoras')).texto, /^\[x\] Que la semana/);

  for (const ref of [plan, evento]) {
    const { error, texto } = await usar(env, camino, 'marcar_hecho', { ref });
    assert.equal(error, true, ref);
    assert.match(texto, /no se marca|no tiene hecho/, ref);
  }
});

test('los paseos de Lío se marcan con las reglas de la aplicación', async () => {
  const env = casa();
  env.DB.sqlite.prepare("INSERT INTO configuracion (clave, valor) VALUES ('lio.cuadro', ?)").run(JSON.stringify({
    manana: Array(7).fill('p-oscar'), noche: Array(7).fill('p-ana'),
  }));
  const haceTres = masDias(hoyEnMadrid(), -3);
  const deOscar = await enlaceDe(env, 'p-oscar');
  const deAna = await enlaceDe(env, 'p-ana');
  const paseo = (turno) => env.DB.filas('SELECT * FROM paseo WHERE id = ?', `lio:${haceTres}:${turno}`)[0];

  const futuro = await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: masDias(hoyEnMadrid(), 3), turno: 'manana' });
  assert.equal(futuro.error, true);
  assert.match(futuro.texto, /todavía no ha empezado/);

  const propio = await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'manana' });
  assert.equal(propio.error, false, propio.texto);
  assert.match(propio.texto, /^Apuntado: sacaste a Lío por la mañana del /);
  assert.equal(paseo('manana').asignado_id, 'p-oscar');
  assert.equal(paseo('manana').hecho_por_id, 'p-oscar');
  assert.ok(paseo('manana').hecho_en);
  assert.match((await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'manana' })).texto, /Ya constaba/);

  // El turno de otro que ya pasó sin marcar lo confirma quien lo tenía: por
  // aquí no se escribe, y que no salió solo lo dice quien lo tenía.
  const ajeno = await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'noche' });
  assert.equal(ajeno.error, true);
  assert.match(ajeno.texto, /era de Ana y ya pasó sin marcar/);
  const noSalioAjeno = await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'noche', salio: false });
  assert.equal(noSalioAjeno.error, true);
  assert.match(noSalioAjeno.texto, /solo se dice del turno propio/);
  assert.equal(paseo('noche'), undefined);

  const noSalio = await usar(env, deAna, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'noche', salio: false });
  assert.equal(noSalio.error, false, noSalio.texto);
  assert.match(noSalio.texto, /Lío no salió por la noche/);
  assert.equal(paseo('noche').hecho_por_id, null);
  assert.ok(paseo('noche').hecho_en);

  // Contestado ya, decir que lo sacó otro no es corregir a nadie: se apunta.
  const loSaco = await usar(env, deOscar, 'marcar_paseo_de_lio', { fecha: haceTres, turno: 'noche' });
  assert.equal(loSaco.error, false, loSaco.texto);
  assert.match(loSaco.texto, /Era el turno de Ana\./);
  assert.equal(paseo('noche').asignado_id, 'p-ana');
  assert.equal(paseo('noche').hecho_por_id, 'p-oscar');

  const deLaTia = await enlaceDe(env, 'p-tia');
  const tia = await usar(env, deLaTia, 'marcar_paseo_de_lio', { turno: 'manana' });
  assert.equal(tia.error, true);
  assert.match(tia.texto, /de quien vive en casa/);
});

// -------------------------------------------------------------- Comentar --

test('comentar firma con quien habla, no repite y se borra solo lo propio', async () => {
  const env = casa();
  const deOscar = await enlaceDe(env, 'p-oscar');
  const deAna = await enlaceDe(env, 'p-ana');
  const medico = refDe((await usar(env, deOscar, 'apuntar_evento', { titulo: 'Médico de Lío', fecha: '2026-10-14' })).texto);

  const dicho = await usar(env, deAna, 'comentar', { ref: medico, texto: 'Lo llevo yo, salgo antes' });
  assert.equal(dicho.error, false, dicho.texto);
  assert.match(dicho.texto, /Comentario añadido en «Médico de Lío»/);
  const comentario = refDe(dicho.texto);
  assert.deepEqual(env.DB.filas('SELECT objeto_tipo, objeto_id, autor_id, texto, activo FROM comentario'), [{
    objeto_tipo: 'evento', objeto_id: medico.split(':')[1], autor_id: 'p-ana', texto: 'Lo llevo yo, salgo antes', activo: 1,
  }]);

  assert.match((await usar(env, deAna, 'comentar', { ref: medico, texto: 'lo llevo yo,  salgo antes' })).texto, /ya estaba/);
  assert.equal(env.DB.filas('SELECT * FROM comentario').length, 1);
  assert.match(
    (await usar(env, deOscar, 'ver_detalle', { ref: medico })).texto,
    /Comentarios:\n {2}· Ana, .*: Lo llevo yo, salgo antes \[comentario:[\w-]+\]/,
  );

  const ajeno = await usar(env, deOscar, 'borrar', { ref: comentario });
  assert.equal(ajeno.error, true);
  assert.match(ajeno.texto, /un comentario solo lo modifica quien lo escribió/);
  assert.match((await usar(env, deAna, 'borrar', { ref: comentario })).texto, /Comentario borrado/);
  assert.equal(env.DB.filas('SELECT activo FROM comentario')[0].activo, 0);
  assert.match((await usar(env, deOscar, 'ver_detalle', { ref: medico })).texto, /Comentarios: ninguno todavía/);

  // Ni una mejora ni lo de Llevar tienen hilo en la aplicación.
  const mejora = refDe((await usar(env, deOscar, 'apuntar_mejora', { texto: 'Algo que cambiar' })).texto);
  const ladron = refDe((await usar(env, deOscar, 'apuntar_en_sitio', {
    sitio: 'Llivia', clase: 'llevar', titulo: 'Ladrón', crear_sitio: true,
  })).texto);
  for (const ref of [mejora, ladron]) {
    const { error, texto } = await usar(env, deOscar, 'comentar', { ref, texto: 'Hola' });
    assert.equal(error, true, ref);
    assert.match(texto, /Sobre eso no se comenta/, ref);
  }
  assert.doesNotMatch((await usar(env, deOscar, 'ver_detalle', { ref: ladron })).texto, /Comentarios/);
});
