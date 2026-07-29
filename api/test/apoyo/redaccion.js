/**
 * Lo que comparten las pruebas de la redacción: un `fetch` de mentira y las dos
 * instantáneas pequeñas de las que tiran casi todas.
 *
 * Vive aquí y no en un `.test.js` porque `node --test 'test/*.test.js'` recorre
 * solo ese patrón: un fichero de apoyo dentro de `test/` se importaría igual
 * pero además se ejecutaría como si tuviera pruebas, y diría que un fichero sin
 * ninguna ha pasado.
 */

/** Un `fetch` de mentira que contesta por turnos, y anota lo que le llega. */
export function fetchDe(respuestas) {
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

export const respuestaConTexto = (texto) => ({
  estado: 200,
  datos: { content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', usage: {} },
});

export const CONFIGURACION = {
  clave: 'sk-ant-secreta-9876', modelo: 'claude-haiku-4-5', instruccion: 'Cuenta el día.',
};

export const INSTANTANEA = {
  eventos: [
    { id: 'e1', titulo: 'Dentista', inicio: '2026-04-14T09:00:00', jornada_completa: 0, ubicacion: 'Calle Mayor 3' },
    { id: 'e2', titulo: 'Cumpleaños de la abuela', inicio: '2026-04-14T00:00:00', jornada_completa: 1 },
  ],
};

/**
 * La instantánea de quien pide, ya filtrada por el servidor. Lo que no está
 * aquí es que no puede verlo: la idea reservada para Marta no aparece en la
 * suya, y por tanto tampoco puede llegar al modelo.
 */
export const CATALOGO = {
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
