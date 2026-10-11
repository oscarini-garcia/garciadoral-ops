/**
 * El protocolo MCP sobre HTTP, reducido a lo que necesita un servidor de herramientas.
 *
 * MCP es la manera en que Claude habla con un servidor ajeno para consultarlo y
 * hacer cosas en él. Aquí se sirve el transporte «Streamable HTTP» en su forma
 * sin estado: cada mensaje JSON-RPC llega en un POST y se contesta con JSON, sin
 * flujo de eventos y sin sesión. Es todo lo que hace falta cuando lo único que se
 * ofrece son herramientas que contestan en el acto, y es lo que cabe en un
 * Worker, que no guarda nada de una petición a la siguiente.
 *
 * **Habla las dos épocas del protocolo.** Hasta la revisión 2025-11-25 el
 * cliente saluda con `initialize`, se acuerda una versión y después pide; desde
 * la 2026-07-28 no hay saludo: cada petición lleva su versión en `params._meta`
 * y el cliente puede preguntar antes con `server/discover`. Conviven porque los
 * clientes de Claude no cambian todos el mismo día, y lo que se ofrece —la lista
 * de herramientas y lo que contestan— es lo mismo en las dos.
 *
 * Es tolerante con lo que no afecta al sentido —cabeceras que falten, un
 * `Accept` incompleto— y estricto con lo que sí: una versión que no conoce se
 * dice con su error y la lista de las que sabe hablar.
 *
 * Como el portero, no sabe qué es una persona ni qué hay en la agenda: las
 * herramientas le llegan hechas (`asistente.js`) y la credencial la comprueba
 * quien lo llama (`index.js`) antes de que llegue aquí nada.
 */

/** Las versiones que se acuerdan con `initialize`, de la más nueva a la más vieja. */
export const VERSIONES_CON_SALUDO = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];

/** Las que van sin saludo, con la versión dentro de cada petición. */
export const VERSIONES_SIN_SALUDO = ['2026-07-28'];

/** Las revisiones son fechas ISO: desde esta, todas van sin saludo. */
const PRIMERA_SIN_SALUDO = '2026-07-28';

const CLAVE_VERSION = 'io.modelcontextprotocol/protocolVersion';
const CLAVE_SERVIDOR = 'io.modelcontextprotocol/serverInfo';

/** Los códigos de error de JSON-RPC que se usan, y el de la versión sin saludo. */
const ERROR = {
  sintaxis: -32700,
  peticion: -32600,
  metodo: -32601,
  parametros: -32602,
  interno: -32603,
  metodoHttp: -32000,
  version: -32022,
};

/** Solo herramientas, y una lista que no cambia mientras dura la conexión. */
const CAPACIDADES = { tools: { listChanged: false } };

const CABECERAS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/** Un error del protocolo, distinto del fallo de una herramienta: este no lo
 *  lee el modelo, lo lee el cliente. */
class ErrorDeProtocolo extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function responder(estado, cuerpo, extra = {}) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CABECERAS, ...extra } });
}

/** Lo que se contesta a un aviso, que no espera respuesta. */
const aceptado = () => new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } });

function errorDe(id, code, message, data) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

/**
 * Atiende una petición HTTP al punto MCP.
 *
 * - `servidor`: `{ name, title, version }`, lo que el cliente enseña como nombre.
 * - `instrucciones`: una función que devuelve el texto para el modelo; solo se
 *   compone cuando se pide, en el saludo o en el descubrimiento.
 * - `herramientas`: `[{ nombre, titulo, descripcion, entrada, anotaciones, hacer }]`,
 *   donde `hacer(argumentos)` devuelve el texto de la respuesta o lanza con lo
 *   que el modelo tiene que leer.
 */
export async function servirMcp(peticion, { servidor, instrucciones = null, herramientas = [] }) {
  // Sin flujo de eventos que abrir con un GET ni sesión que cerrar con un
  // DELETE: lo mismo que contesta el modo sin estado del SDK oficial.
  if (peticion.method !== 'POST') {
    return responder(405, errorDe(null, ERROR.metodoHttp, 'Method not allowed.'), { allow: 'POST' });
  }

  let cuerpo;
  try {
    cuerpo = await peticion.json();
  } catch {
    return responder(400, errorDe(null, ERROR.sintaxis, 'Parse error: el cuerpo no es JSON'));
  }

  const contexto = {
    servidor,
    instrucciones,
    herramientas,
    cabecera: peticion.headers.get('mcp-protocol-version') || null,
  };

  // Un lote es de la época con saludo; se atiende mensaje a mensaje y se
  // contesta solo lo que lleva `id`.
  if (Array.isArray(cuerpo)) {
    if (!cuerpo.length) return responder(400, errorDe(null, ERROR.peticion, 'Invalid Request: lote vacío'));
    const respuestas = [];
    for (const mensaje of cuerpo) {
      const respuesta = await atender(mensaje, contexto);
      if (respuesta) respuestas.push(respuesta.cuerpo);
    }
    return respuestas.length ? responder(200, respuestas) : aceptado();
  }

  const respuesta = await atender(cuerpo, contexto);
  return respuesta ? responder(respuesta.estado, respuesta.cuerpo) : aceptado();
}

/** La versión que trae una petición: la de su sobre, y si no, la de la cabecera. */
function versionPedida(params, cabecera) {
  const meta = params && typeof params === 'object' ? params._meta : null;
  const enSobre = meta && typeof meta === 'object' ? meta[CLAVE_VERSION] : null;
  return typeof enSobre === 'string' && enSobre ? enSobre : cabecera;
}

async function atender(mensaje, contexto) {
  if (!mensaje || typeof mensaje !== 'object' || mensaje.jsonrpc !== '2.0') {
    return { estado: 400, cuerpo: errorDe(mensaje?.id, ERROR.peticion, 'Invalid Request') };
  }
  // Una respuesta a algo que este servidor hubiera preguntado —no pregunta
  // nada—, o un aviso como `notifications/initialized`: no se contesta.
  if (typeof mensaje.method !== 'string' || !('id' in mensaje)) return null;

  const { id, method: metodo } = mensaje;
  const params = mensaje.params && typeof mensaje.params === 'object' ? mensaje.params : {};

  const pedida = versionPedida(params, contexto.cabecera);
  const sinSaludo = typeof pedida === 'string' && pedida >= PRIMERA_SIN_SALUDO;
  if (sinSaludo && !VERSIONES_SIN_SALUDO.includes(pedida)) {
    return {
      estado: 400,
      cuerpo: errorDe(id, ERROR.version, `Unsupported protocol version: ${pedida}`, {
        supported: VERSIONES_SIN_SALUDO,
        requested: pedida,
      }),
    };
  }

  try {
    const resultado = await resolver(metodo, params, contexto);
    if (resultado === undefined) {
      return { estado: 200, cuerpo: errorDe(id, ERROR.metodo, `Method not found: ${metodo}`) };
    }
    const final = sinSaludo ? paraLaEpocaSinSaludo(metodo, resultado, contexto.servidor) : resultado;
    return { estado: 200, cuerpo: { jsonrpc: '2.0', id, result: final } };
  } catch (error) {
    if (error instanceof ErrorDeProtocolo) return { estado: 200, cuerpo: errorDe(id, error.codigo, error.message) };
    console.warn('mcp: fallo atendiendo', metodo, String(error?.message || error));
    return { estado: 200, cuerpo: errorDe(id, ERROR.interno, 'Internal error') };
  }
}

/** Los resultados que la época sin saludo deja guardar a quien los pide. */
const SE_PUEDEN_GUARDAR = new Set([
  'tools/list', 'prompts/list', 'resources/list', 'resources/templates/list', 'resources/read', 'server/discover',
]);

/**
 * Lo que la época sin saludo exige en cada resultado y la otra no conoce: de qué
 * clase es —aquí siempre completo, porque ninguna herramienta pide nada a mitad
 * de camino—, cuánto puede guardarse lo que se pide a menudo —nada, y solo para
 * quien lo pidió: la dirección es de una persona— y qué servidor lo firma, que
 * en la otra época se decía una vez, en el `initialize`.
 */
function paraLaEpocaSinSaludo(metodo, resultado, servidor) {
  return {
    ...resultado,
    resultType: 'complete',
    ...(SE_PUEDEN_GUARDAR.has(metodo) ? { ttlMs: 0, cacheScope: 'private' } : {}),
    _meta: { ...(resultado._meta || {}), [CLAVE_SERVIDOR]: servidor },
  };
}

async function resolver(metodo, params, contexto) {
  switch (metodo) {
    case 'initialize':
      return saludar(params, contexto);
    case 'server/discover':
      return descubrir(contexto);
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: contexto.herramientas.map(definicionDe) };
    case 'tools/call':
      return llamar(params, contexto);
    // No se anuncian, pero hay clientes que las piden igual: una lista vacía
    // es más honrada que un error por algo que no existe.
    case 'resources/list':
      return { resources: [] };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'prompts/list':
      return { prompts: [] };
    default:
      return undefined;
  }
}

/** El saludo de la época con saludo: la versión del cliente si se sabe
 *  hablar, y si no la más nueva que se sabe, para que él decida. */
async function saludar(params, { servidor, instrucciones }) {
  const pedida = params.protocolVersion;
  const texto = instrucciones ? await instrucciones() : '';
  return {
    protocolVersion: VERSIONES_CON_SALUDO.includes(pedida) ? pedida : VERSIONES_CON_SALUDO[0],
    capabilities: CAPACIDADES,
    serverInfo: servidor,
    ...(texto ? { instructions: texto } : {}),
  };
}

async function descubrir({ instrucciones }) {
  const texto = instrucciones ? await instrucciones() : '';
  return {
    supportedVersions: VERSIONES_SIN_SALUDO,
    capabilities: CAPACIDADES,
    ...(texto ? { instructions: texto } : {}),
  };
}

function definicionDe(herramienta) {
  return {
    name: herramienta.nombre,
    ...(herramienta.titulo ? { title: herramienta.titulo } : {}),
    description: herramienta.descripcion,
    inputSchema: herramienta.entrada,
    ...(herramienta.anotaciones
      ? { annotations: { ...(herramienta.titulo ? { title: herramienta.titulo } : {}), ...herramienta.anotaciones } }
      : {}),
  };
}

/**
 * Una llamada a una herramienta.
 *
 * Lo que falla **dentro** de la herramienta —un nombre que no está, una fecha
 * mal escrita, algo que no se puede apuntar— vuelve como resultado con
 * `isError` y no como error del protocolo, que es lo que pide la especificación:
 * así lo lee el modelo, y puede corregir la llamada o preguntar. Una herramienta
 * que no existe sí es un error del protocolo, porque es el cliente el que se ha
 * equivocado.
 */
async function llamar(params, { herramientas }) {
  const herramienta = herramientas.find((h) => h.nombre === params.name);
  if (!herramienta) throw new ErrorDeProtocolo(ERROR.parametros, `Unknown tool: ${params.name}`);

  const argumentos = params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
    ? params.arguments
    : {};
  try {
    const texto = await herramienta.hacer(argumentos);
    return { content: [{ type: 'text', text: String(texto) }], isError: false };
  } catch (error) {
    const motivo = String(error?.message || error);
    console.warn(`mcp: ${herramienta.nombre} no ha podido`, motivo);
    return { content: [{ type: 'text', text: motivo }], isError: true };
  }
}
