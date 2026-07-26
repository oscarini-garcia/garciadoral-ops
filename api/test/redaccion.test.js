/**
 * Lo que la agenda le pide a Anthropic: contar el día, proponer un regalo y
 * felicitar un cumpleaños.
 *
 * Lo que aquí se comprueba no se ve al usarlo: cuando algo va mal el día se
 * comparte igual, tal cual, así que un fallo en esta pieza es silencioso por
 * diseño. Interesan tres cosas, en este orden: que por el material que se le
 * manda al modelo no pueda salir nada que quien pide no ve —ni un evento ni una
 * idea reservada—, que la clave no vuelva nunca entera hacia el dispositivo, y
 * que la cadena de repuesto baje de un modelo al siguiente y guarde el porqué
 * de cada intento fallido.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTRUCCION_FELICITACION_POR_DEFECTO,
  INSTRUCCION_POR_DEFECTO,
  INSTRUCCION_REGALO_POR_DEFECTO,
  MODELOS_DE_RESERVA,
  cadenaDeModelos,
  componerMaterial,
  componerMaterialDeFelicitacion,
  componerMaterialDePeriodo,
  componerMaterialDeRegalo,
  configuracionPublica,
  interpretarFelicitaciones,
  interpretarPropuestas,
  modelosDisponibles,
  redactar,
} from '../src/redaccion.js';

// --------------------------------------------------------------- Utilidades --

/** Un `fetch` de mentira que contesta por turnos, y anota lo que le llega. */
function fetchDe(respuestas) {
  const llamadas = [];
  const cola = [...respuestas];
  const buscar = async (url, opciones = {}) => {
    llamadas.push({ url, cuerpo: opciones.body ? JSON.parse(opciones.body) : null, opciones });
    const siguiente = cola.shift();
    if (typeof siguiente === 'function') return siguiente();
    return {
      ok: (siguiente.estado || 200) < 400,
      status: siguiente.estado || 200,
      json: async () => siguiente.datos,
    };
  };
  buscar.llamadas = llamadas;
  return buscar;
}

const respuestaConTexto = (texto) => ({
  estado: 200,
  datos: { content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', usage: {} },
});

const CONFIGURACION = { clave: 'sk-ant-secreta-9876', modelo: 'claude-haiku-4-5', instruccion: 'Cuenta el día.' };

const INSTANTANEA = {
  eventos: [
    { id: 'e1', titulo: 'Dentista', inicio: '2026-04-14T09:00:00', jornada_completa: 0, ubicacion: 'Calle Mayor 3' },
    { id: 'e2', titulo: 'Cumpleaños de la abuela', inicio: '2026-04-14T00:00:00', jornada_completa: 1 },
  ],
};

// -------------------------------------------------------------- El material --

test('el material solo lleva lo que hay en la instantánea de quien pide', () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1', 'e2', 'ajeno']);

  assert.equal(material.titulo, 'martes 14 de Abril');
  assert.deepEqual(material.lineas, [
    '09:00 · Dentista · Calle Mayor 3',
    'todo el día · Cumpleaños de la abuela',
  ]);
});

test('un identificador que no está en la instantánea se descarta sin ruido', () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['reservado', 'e1']);
  assert.deepEqual(material.lineas, ['09:00 · Dentista · Calle Mayor 3']);
});

test('un día sin nada da un material vacío, y entonces no se llama a nadie', async () => {
  const material = componerMaterial(INSTANTANEA, '2026-04-14', []);
  assert.equal(material.lineas.length, 0);

  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});

// ------------------------------------------------------------ Cumpleaños --

// Los cumpleaños no son filas de `evento`: el dispositivo los deriva de la
// fecha de nacimiento y los manda con un identificador compuesto. Antes se
// caían aquí en silencio, y el modelo contaba una semana sin el cumpleaños que
// la ocupaba.
const CON_PERSONAS = {
  eventos: INSTANTANEA.eventos,
  personas: [
    { id: 'p-mariona', nombre: 'Mariona', fecha_nacimiento: '1982-04-14', activa: 1 },
    { id: 'p-sin-fecha', nombre: 'Quien sea', fecha_nacimiento: null, activa: 1 },
    { id: 'p-baja', nombre: 'Quien se fue', fecha_nacimiento: '1975-04-14', activa: 0 },
  ],
};

test('el cumpleaños derivado llega al modelo, con el nombre del registro', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:cumpleanos:p-mariona']);

  assert.deepEqual(material.lineas, [
    '09:00 · Dentista · Calle Mayor 3',
    'todo el día · Cumpleaños de Mariona',
  ]);
});

test('también dentro de un tramo', () => {
  const material = componerMaterialDePeriodo(CON_PERSONAS, {
    desde: '2026-04-13',
    hasta: '2026-04-19',
    dias: [{ fecha: '2026-04-14', eventos: ['derivado:cumpleanos:p-mariona', 'e1'] }],
  });

  assert.deepEqual(material.lineas, [
    'martes 14 de Abril:',
    '  todo el día · Cumpleaños de Mariona',
    '  09:00 · Dentista · Calle Mayor 3',
  ]);
});

test('el de quien ya no está en la familia no se deriva', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-baja']);
  assert.deepEqual(material.lineas, []);
});

test('sin fecha de nacimiento no hay cumpleaños que contar', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-sin-fecha']);
  assert.deepEqual(material.lineas, []);
});

test('un cumpleaños inventado de alguien que no se ve tampoco pasa', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['derivado:cumpleanos:p-de-otra-familia']);
  assert.deepEqual(material.lineas, []);
});

// Lo que costó encontrar el fallo de los cumpleaños fue el silencio, no el
// descarte. Lo que no se reconoce se devuelve, para que la próxima familia de
// eventos derivados se anuncie en lugar de acortar el mensaje sin más.
test('lo que no se sabe resolver se devuelve en lugar de caerse callando', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:loquesea:p-mariona', 'ev-fantasma']);

  assert.deepEqual(material.lineas, ['09:00 · Dentista · Calle Mayor 3']);
  assert.deepEqual(material.omitidos, ['derivado:loquesea:p-mariona', 'ev-fantasma']);
});

test('y también en un tramo', () => {
  const material = componerMaterialDePeriodo(CON_PERSONAS, {
    desde: '2026-04-13',
    hasta: '2026-04-19',
    dias: [{ fecha: '2026-04-14', eventos: ['e1', 'derivado:viajes:v-1'] }],
  });

  assert.deepEqual(material.omitidos, ['derivado:viajes:v-1']);
});

test('cuando todo se resuelve, no se omite nada', () => {
  const material = componerMaterial(CON_PERSONAS, '2026-04-14', ['e1', 'derivado:cumpleanos:p-mariona']);
  assert.deepEqual(material.omitidos, []);
});

// ------------------------------------------------------ El material del tramo --

const INSTANTANEA_LARGA = {
  eventos: [
    ...INSTANTANEA.eventos,
    { id: 'e3', titulo: 'Entreno de hípica', inicio: '2026-04-13T18:00:00', jornada_completa: 0 },
    { id: 'e4', titulo: 'Dentista', inicio: '2026-04-16T10:00:00', jornada_completa: 0 },
  ],
};

const SEMANA = {
  desde: '2026-04-13',
  hasta: '2026-04-19',
  dias: [
    { fecha: '2026-04-13', eventos: ['e3'] },
    { fecha: '2026-04-14', eventos: ['e1', 'e2'] },
    { fecha: '2026-04-15', eventos: [] },
    { fecha: '2026-04-16', eventos: ['e4'] },
  ],
};

test('el tramo se compone por días, con el rango por encabezado', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, SEMANA);

  assert.equal(material.titulo, 'del 13 al 19 de Abril de 2026');
  assert.deepEqual(material.lineas, [
    'lunes 13 de Abril:',
    '  18:00 · Entreno de hípica',
    'martes 14 de Abril:',
    '  09:00 · Dentista · Calle Mayor 3',
    '  todo el día · Cumpleaños de la abuela',
    'jueves 16 de Abril:',
    '  10:00 · Dentista',
  ]);
});

test('los días sin nada no llegan al modelo', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, SEMANA);
  assert.equal(material.lineas.some((l) => l.startsWith('miércoles 15')), false);
});

test('tampoco en un tramo sale lo que no está en la instantánea de quien pide', () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, {
    desde: '2026-04-13',
    hasta: '2026-04-13',
    dias: [{ fecha: '2026-04-13', eventos: ['reservado', 'e3', 'de-otra-familia'] }],
  });

  assert.deepEqual(material.lineas, ['lunes 13 de Abril:', '  18:00 · Entreno de hípica']);
});

test('el rango dice el mes dos veces solo cuando lo cruza, y el año cuando lo cruza', () => {
  const rango = (desde, hasta) => componerMaterialDePeriodo({ eventos: [] }, { desde, hasta, dias: [] }).titulo;

  assert.equal(rango('2026-04-13', '2026-04-19'), 'del 13 al 19 de Abril de 2026');
  assert.equal(rango('2026-04-27', '2026-05-03'), 'del 27 de Abril al 3 de Mayo de 2026');
  assert.equal(rango('2026-12-28', '2027-01-03'), 'del 28 de Diciembre de 2026 al 3 de Enero de 2027');
  assert.equal(rango('2026-04-14', '2026-04-14'), 'martes 14 de Abril de 2026');
});

test('un tramo entero vacío no llama a nadie', async () => {
  const material = componerMaterialDePeriodo(INSTANTANEA_LARGA, {
    desde: '2026-05-01', hasta: '2026-05-31', dias: [{ fecha: '2026-05-04', eventos: [] }],
  });
  assert.equal(material.lineas.length, 0);

  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });
  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});

test('un mes desbordado se corta por arriba en lugar de mandarlo entero', () => {
  const eventos = Array.from({ length: 80 }, (_, i) => ({
    id: `x${i}`, titulo: `Evento ${i}`, inicio: '2026-04-14T09:00:00', jornada_completa: 0,
  }));
  const material = componerMaterialDePeriodo({ eventos }, {
    desde: '2026-04-01',
    hasta: '2026-04-30',
    dias: Array.from({ length: 80 }, (_, i) => ({ fecha: '2026-04-14', eventos: [`x${i}`] })),
  });

  // Sesenta eventos como mucho, y no más de cuarenta días recorridos.
  const deEventos = material.lineas.filter((l) => l.startsWith('  '));
  assert.equal(deEventos.length, 40);
});

// ------------------------------------------------- El material del regalo --

/**
 * La instantánea de quien pide, ya filtrada por el servidor. Lo que no está
 * aquí es que no puede verlo: la idea reservada para Marta no aparece en la
 * suya, y por tanto tampoco puede llegar al modelo.
 */
const CATALOGO = {
  personas: [
    { id: 'p-marta', nombre: 'Marta', parentesco: 'hija', fecha_nacimiento: '2012-03-04' },
    { id: 'p-ana', nombre: 'Ana', parentesco: 'madre' },
  ],
  atributos_persona: [
    { persona_id: 'p-marta', clave: 'talla de calzado', valor: '39' },
    { persona_id: 'p-ana', clave: 'alergias', valor: 'frutos secos' },
  ],
  ideas: [
    { id: 'i1', tipo: 'sugerencia', titulo: 'Botas de montar', estado: 'activa', orientaciones: [{ persona_id: 'p-marta' }] },
    { id: 'i2', tipo: 'deseo', titulo: 'Una cámara instantánea', estado: 'activa', autor_id: 'p-marta', orientaciones: [] },
    { id: 'i3', tipo: 'sugerencia', titulo: 'Descartada hace tiempo', estado: 'descartada', orientaciones: [{ persona_id: 'p-marta' }] },
    { id: 'i4', tipo: 'sugerencia', titulo: 'Delantal de cocina', estado: 'activa', orientaciones: [{ persona_id: 'p-ana' }] },
    { id: 'i9', tipo: 'sugerencia', titulo: 'Casco de hípica', estado: 'cerrada', orientaciones: [{ persona_id: 'p-marta' }] },
  ],
  ocasiones: [
    { id: 'o1', nombre: 'Navidad 2025', estado: 'cerrada' },
    { id: 'o2', nombre: 'Navidad 2026', estado: 'abierta' },
  ],
  regalos: [
    { id: 'r1', ocasion_id: 'o1', idea_id: 'i9', destinatario_principal_id: 'p-marta' },
    { id: 'r2', ocasion_id: 'o2', idea_id: 'i1', destinatario_principal_id: 'p-marta' },
  ],
};

test('el material del regalo reúne lo que se sabe de esa persona y de nadie más', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.equal(material.titulo, 'Un regalo para Marta');
  assert.deepEqual(material.lineas, [
    'Para Marta (hija, 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
    'Lo que ha pedido:',
    '  Una cámara instantánea',
    'Ideas que ya hay apuntadas para ella:',
    '  Botas de montar',
    '  Casco de hípica',
    'Lo que ya ha recibido:',
    '  Casco de hípica (Navidad 2025)',
  ]);
});

test('lo que no está en la instantánea de quien pide tampoco llega al modelo', () => {
  // La misma persona, pero mirada por quien no ve ni la idea ni el regalo.
  const recortada = { ...CATALOGO, ideas: [], regalos: [] };
  const material = componerMaterialDeRegalo(recortada, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.deepEqual(material.lineas, [
    'Para Marta (hija, 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
  ]);
});

test('una idea descartada no se le propone al modelo como ya apuntada', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  assert.equal(material.lineas.some((l) => l.includes('Descartada hace tiempo')), false);
});

test('sin fecha de nacimiento no se inventa una edad', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-ana', hoy: '2026-07-26' });
  assert.equal(material.lineas[0], 'Para Ana (madre)');
});

test('la edad son los años cumplidos, no los que caen ese año', () => {
  const enero = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-01-15' });
  assert.equal(enero.lineas[0], 'Para Marta (hija, 13 años)');
});

test('la pista de quien apunta se recorta y va al final', () => {
  const material = componerMaterialDeRegalo(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', pista: `algo para el verano ${'x'.repeat(400)}`,
  });

  const ultima = material.lineas[material.lineas.length - 1];
  assert.equal(material.lineas.includes('Lo que apunta quien lo pide:'), true);
  assert.equal(ultima.startsWith('  algo para el verano'), true);
  assert.equal(ultima.length <= 202, true);
});

test('lo ya propuesto se le devuelve al modelo para que no se repita', () => {
  const material = componerMaterialDeRegalo(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', descartadas: ['Hamaca de playa', 'Gafas de bucear'],
  });

  const desde = material.lineas.indexOf('Ya has propuesto esto, no lo repitas ni propongas variantes suyas:');
  assert.notEqual(desde, -1);
  assert.deepEqual(material.lineas.slice(desde + 1), ['  Hamaca de playa', '  Gafas de bucear']);
});

test('sin nada propuesto todavía no se le dice nada de repetir', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  assert.equal(material.lineas.some((l) => l.startsWith('Ya has propuesto')), false);
});

test('una persona que no está en la instantánea no da material ninguno', () => {
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-de-otra-casa' });
  assert.deepEqual(material.lineas, []);
});

test('el encargo del regalo es el suyo, y no el de contar el día', async () => {
  const buscar = fetchDe([respuestaConTexto('Cámara instantánea\nLleva meses pidiéndola.')]);
  const material = componerMaterialDeRegalo(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  await redactar({
    configuracion: { ...CONFIGURACION, regalo: 'Propón un regalo.' },
    material,
    instruccion: 'Propón un regalo.',
    buscar,
  });

  assert.equal(buscar.llamadas[0].cuerpo.system, 'Propón un regalo.');
});

test('sin encargo propio guardado se usa el de origen', () => {
  const publica = configuracionPublica({
    ...CONFIGURACION, regalo: INSTRUCCION_REGALO_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.regalo, INSTRUCCION_REGALO_POR_DEFECTO);
});

// -------------------------------------------------- Las cinco propuestas --

test('las cinco líneas numeradas se convierten en cinco propuestas', () => {
  const propuestas = interpretarPropuestas([
    '1. Hamaca de playa plegable — Se lleva la bici a todas partes.',
    '2. Gafas de bucear con tubo — Este año le tocan las calas del norte.',
    '3. Altavoz que aguanta el agua — El suyo no sale del cuarto.',
    '4. Toalla de microfibra grande — La suya ocupa media mochila.',
    '5. Cantimplora térmica de un litro — Sale a montar en agosto.',
  ].join('\n'));

  assert.equal(propuestas.length, 5);
  assert.deepEqual(propuestas[0], {
    que: 'Hamaca de playa plegable',
    porque: 'Se lleva la bici a todas partes.',
  });
  assert.equal(propuestas[4].que, 'Cantimplora térmica de un litro');
});

test('se admite lo que el modelo suele hacer de más: viñetas, comillas y dos puntos', () => {
  const propuestas = interpretarPropuestas([
    '- «Hamaca de playa»: se la lleva a todas partes.',
    '2) Gafas de bucear – le tocan las calas.',
    '• Toalla grande',
  ].join('\n'));

  assert.deepEqual(propuestas, [
    { que: 'Hamaca de playa', porque: 'se la lleva a todas partes.' },
    { que: 'Gafas de bucear', porque: 'le tocan las calas.' },
    { que: 'Toalla grande', porque: '' },
  ]);
});

test('las líneas de más se descartan, y una respuesta vacía no da propuestas', () => {
  const seis = Array.from({ length: 6 }, (_, i) => `${i + 1}. Regalo ${i + 1} — porque sí`).join('\n');
  assert.equal(interpretarPropuestas(seis).length, 5);
  assert.deepEqual(interpretarPropuestas(''), []);
  assert.deepEqual(interpretarPropuestas(null), []);
});

// ------------------------------------------------- El material del cumple --

test('la felicitación lleva quién cumple, los años que cumple y lo que se sabe', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-01-15',
  });

  assert.equal(material.titulo, 'Una felicitación para Marta');
  assert.deepEqual(material.lineas, [
    'Felicita a Marta (hija, cumple 14 años)',
    'Lo que se sabe de ella:',
    '  talla de calzado: 39',
  ]);
});

test('los años son los que cumple, no los cumplidos', () => {
  // El 4 de marzo de 2026 cumple 14; el día mismo se dicen 14, y a partir del
  // día siguiente la que toca escribir ya es la del año que viene.
  const elDia = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-03-04' });
  const despues = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });

  assert.equal(elDia.lineas[0], 'Felicita a Marta (hija, cumple 14 años)');
  assert.equal(despues.lineas[0], 'Felicita a Marta (hija, cumple 15 años)');
});

test('sin fecha de nacimiento no se inventa ninguna edad que cumplir', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-ana', hoy: '2026-07-26' });
  assert.equal(material.lineas[0], 'Felicita a Ana (madre)');
});

/**
 * La regla que sostiene esta pieza: lo que se escribe se le manda a quien cumple,
 * de modo que ni las ideas apuntadas para ella, ni el regalo que está esperando en
 * la ocasión abierta, ni lo que recibió el año pasado pueden llegar al modelo.
 */
test('ni las ideas ni los regalos llegan al modelo de una felicitación', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26',
  });
  const entero = material.lineas.join('\n');

  for (const secreto of ['Botas de montar', 'Casco de hípica', 'Una cámara instantánea', 'Navidad']) {
    assert.equal(entero.includes(secreto), false, `se ha colado «${secreto}»`);
  }
});

test('lo ya escrito se le devuelve al modelo para que la siguiente tanda cambie', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, {
    personaId: 'p-marta', hoy: '2026-07-26', descartadas: ['¡Felicidades, campeona! 🎉'],
  });

  const desde = material.lineas.indexOf('Ya has escrito estas, escribe otras distintas:');
  assert.notEqual(desde, -1);
  assert.deepEqual(material.lineas.slice(desde + 1), ['  ¡Felicidades, campeona! 🎉']);
});

test('una persona que no está en la instantánea no da felicitación ninguna', () => {
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-de-otra-casa' });
  assert.deepEqual(material.lineas, []);
});

test('el encargo de la felicitación es el suyo, y se puede reescribir', async () => {
  const buscar = fetchDe([respuestaConTexto('1. ¡Felicidades! 🎂')]);
  const material = componerMaterialDeFelicitacion(CATALOGO, { personaId: 'p-marta', hoy: '2026-07-26' });
  await redactar({
    configuracion: { ...CONFIGURACION, felicitacion: 'Felicítala en verso.' },
    material,
    instruccion: 'Felicítala en verso.',
    buscar,
  });

  assert.equal(buscar.llamadas[0].cuerpo.system, 'Felicítala en verso.');

  const publica = configuracionPublica({
    ...CONFIGURACION, felicitacion: INSTRUCCION_FELICITACION_POR_DEFECTO, guardada_en: null,
  });
  assert.equal(publica.felicitacion, INSTRUCCION_FELICITACION_POR_DEFECTO);
});

// ----------------------------------------------- Las cinco felicitaciones --

test('cada línea es una felicitación entera, con sus emojis y su puntuación', () => {
  const felicitaciones = interpretarFelicitaciones([
    '1. ¡Felicidades, Marta! 🎂 Que cumplas muchos más — y que te duren las botas 🐴',
    '2. Otro año montando: ¡felicidades! 🎉🥳',
    '3. «Feliz cumple, crack 🎈»',
    '- Felicidades, guapa 🎁',
    '5) 16 años y sigues igual de brasas 😄 ¡Felicidades!',
  ].join('\n'));

  assert.equal(felicitaciones.length, 5);
  // La raya de dentro no parte nada, la puntuación final se queda y las comillas
  // de los extremos se van.
  assert.equal(felicitaciones[0], '¡Felicidades, Marta! 🎂 Que cumplas muchos más — y que te duren las botas 🐴');
  assert.equal(felicitaciones[1], 'Otro año montando: ¡felicidades! 🎉🥳');
  assert.equal(felicitaciones[2], 'Feliz cumple, crack 🎈');
  assert.equal(felicitaciones[3], 'Felicidades, guapa 🎁');
  // Con separador es numeración; sin él, un número que empieza la frase se queda.
  assert.equal(felicitaciones[4], '16 años y sigues igual de brasas 😄 ¡Felicidades!');
});

test('un número sin separador detrás no se confunde con la numeración', () => {
  assert.deepEqual(interpretarFelicitaciones('16 años ya 🎂'), ['16 años ya 🎂']);
});

test('las felicitaciones de más se descartan, y una respuesta vacía no da ninguna', () => {
  const seis = Array.from({ length: 6 }, (_, i) => `${i + 1}. Felicidades ${i + 1} 🎉`).join('\n');
  assert.equal(interpretarFelicitaciones(seis).length, 5);
  assert.deepEqual(interpretarFelicitaciones(''), []);
  assert.deepEqual(interpretarFelicitaciones(null), []);
});

// ----------------------------------------------------------- Configuración --

test('la clave no vuelve entera: solo su cola y la fecha en que se guardó', () => {
  const publica = configuracionPublica({ ...CONFIGURACION, guardada_en: '2026-04-14 10:00:00' });

  assert.equal(publica.hay_clave, true);
  assert.equal(publica.cola, '9876');
  assert.equal(publica.guardada_en, '2026-04-14 10:00:00');
  assert.equal(JSON.stringify(publica).includes(CONFIGURACION.clave), false);
});

test('sin clave puesta se dice que no la hay y no se inventa una cola', () => {
  const publica = configuracionPublica({ clave: '', modelo: 'x', instruccion: 'y', guardada_en: null });
  assert.equal(publica.hay_clave, false);
  assert.equal(publica.cola, null);
});

// ---------------------------------------------------------------- Modelos --

test('la cadena empieza por el configurado y no lo repite detrás', () => {
  assert.deepEqual(cadenaDeModelos('claude-sonnet-5'), [
    'claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-5',
  ]);
});

test('un modelo de fuera de la reserva encabeza la cadena y deja la reserva entera', () => {
  assert.deepEqual(cadenaDeModelos('claude-de-mañana'), [
    'claude-de-mañana', ...MODELOS_DE_RESERVA.map((m) => m.id),
  ]);
});

test('sin clave, la lista de modelos es la de reserva y no se pregunta a nadie', async () => {
  const buscar = fetchDe([]);
  const { modelos, de } = await modelosDisponibles('', buscar);

  assert.equal(de, 'reserva');
  assert.deepEqual(modelos, MODELOS_DE_RESERVA);
  assert.equal(buscar.llamadas.length, 0);
});

test('si Anthropic contesta, los modelos son los suyos', async () => {
  const buscar = fetchDe([{ estado: 200, datos: { data: [{ id: 'claude-x', display_name: 'Claude X' }] } }]);
  const { modelos, de } = await modelosDisponibles('sk-ant-1', buscar);

  assert.equal(de, 'anthropic');
  assert.deepEqual(modelos, [{ id: 'claude-x', nombre: 'Claude X' }]);
  assert.equal(buscar.llamadas[0].opciones.headers['x-api-key'], 'sk-ant-1');
});

test('si la consulta de modelos revienta, se sigue con la reserva', async () => {
  const buscar = fetchDe([() => { throw new Error('sin red'); }]);
  const { de } = await modelosDisponibles('sk-ant-1', buscar);
  assert.equal(de, 'reserva');
});

// ---------------------------------------------------------------- Llamada --

test('al primer modelo que contesta se le coge el texto y no se prueban más', async () => {
  const buscar = fetchDe([respuestaConTexto('Mañana de dentista y tarde de cumpleaños.')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1', 'e2']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, 'Mañana de dentista y tarde de cumpleaños.');
  assert.equal(resultado.modelo, 'claude-haiku-4-5');
  assert.equal(buscar.llamadas.length, 1);

  const enviado = buscar.llamadas[0].cuerpo;
  assert.equal(enviado.model, 'claude-haiku-4-5');
  assert.equal(enviado.system, 'Cuenta el día.');
  assert.equal(enviado.messages[0].content.includes('Dentista'), true);
  // Los modelos nuevos rechazan estos dos con un 400: no deben salir de aquí.
  assert.equal('temperature' in enviado, false);
  assert.equal('thinking' in enviado, false);
});

test('sin instrucción guardada se manda la de por defecto', async () => {
  const buscar = fetchDe([respuestaConTexto('Un día tranquilo.')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  await redactar({ configuracion: { ...CONFIGURACION, instruccion: '' }, material, buscar });

  assert.equal(buscar.llamadas[0].cuerpo.system, INSTRUCCION_POR_DEFECTO);
});

test('si un modelo falla se baja al siguiente, y queda anotado el porqué', async () => {
  const buscar = fetchDe([
    { estado: 429, datos: { error: { type: 'rate_limit_error', message: 'demasiadas peticiones' } } },
    respuestaConTexto('Dentista por la mañana.'),
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, 'Dentista por la mañana.');
  assert.equal(resultado.modelo, 'claude-sonnet-5');
  assert.equal(resultado.intentos.length, 2);
  assert.equal(resultado.intentos[0].estado, 429);
  assert.equal(resultado.intentos[0].tipo, 'rate_limit_error');
  assert.equal(resultado.intentos[0].mensaje, 'demasiadas peticiones');
});

test('un rechazo por política llega con 200 y cuenta como intento fallido', async () => {
  const buscar = fetchDe([
    { estado: 200, datos: { stop_reason: 'refusal', content: [] } },
    respuestaConTexto('Nada que objetar.'),
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.intentos[0].tipo, 'refusal');
  assert.equal(resultado.texto, 'Nada que objetar.');
});

test('si ninguno contesta, no hay texto pero sí la traza de los tres intentos', async () => {
  const buscar = fetchDe([
    { estado: 401, datos: { error: { type: 'authentication_error', message: 'clave no válida' } } },
    () => { throw new Error('sin red'); },
    { estado: 500, datos: {} },
  ]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: CONFIGURACION, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(resultado.intentos.length, 3);
  assert.deepEqual(resultado.intentos.map((i) => i.tipo), ['authentication_error', 'red', 'error']);
  assert.equal(resultado.intentos[1].mensaje, 'sin red');
});

test('sin clave configurada no se llama a nadie', async () => {
  const buscar = fetchDe([respuestaConTexto('no debería llegar aquí')]);
  const material = componerMaterial(INSTANTANEA, '2026-04-14', ['e1']);
  const resultado = await redactar({ configuracion: { ...CONFIGURACION, clave: '' }, material, buscar });

  assert.equal(resultado.texto, null);
  assert.equal(buscar.llamadas.length, 0);
});
