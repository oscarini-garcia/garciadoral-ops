/**
 * Modo demostración.
 *
 * Carga un registro de ejemplo y compone la instantánea de un observador que se
 * elige a mano, de modo que se puede ver la misma semana con los ojos de una
 * madre y con los de una hija sin desplegar nada.
 *
 * **Esto no es el modelo de seguridad.** Aquí el recorte ocurre en el navegador
 * porque no hay servidor con el que hablar; en la aplicación real el filtrado se
 * produce antes de transmitir y el dispositivo nunca llega a recibir lo que su
 * titular no puede ver. La copia de la función de visibilidad que sigue existe
 * solo para que la demostración sea fiel a lo que se verá; la implementación que
 * cuenta vive en `api/src/visibilidad.js` y en `scripts/agenda/visibilidad.py`.
 */

const REGISTRO = '/demo/registro-demo.json';

function destinatarios(registro, elemento, clase) {
  if (clase === 'regalo') {
    return new Set([elemento.destinatario_principal_id, ...(elemento.codestinatarios || [])]);
  }
  if (clase === 'idea') {
    const conCuenta = new Set(registro.personas.filter((p) => p.tiene_cuenta).map((p) => p.id));
    return new Set((elemento.orientaciones || []).map((o) => o.persona_id).filter((id) => id && conCuenta.has(id)));
  }
  return new Set();
}

function visible(registro, elemento, clase, observador) {
  if (!observador?.tiene_cuenta) return false;
  if (clase === 'idea' && elemento.tipo === 'deseo' && elemento.autor_id === observador.id) return true;

  const categoria = elemento.categoria_id
    ? registro.categorias.find((c) => c.id === elemento.categoria_id)
    : null;
  if (categoria) {
    if (categoria.regla === 'privada' && observador.rol !== 'administrador') return false;
    if (categoria.regla === 'restringida'
      && !(registro.acceso_categoria || []).some((a) => a.categoria_id === categoria.id && a.persona_id === observador.id)) {
      return false;
    }
  }

  return !destinatarios(registro, elemento, clase).has(observador.id);
}

export async function cargarRegistroDemo() {
  const respuesta = await fetch(REGISTRO);
  if (!respuesta.ok) throw new Error('no se pudo cargar el registro de demostración');
  return respuesta.json();
}

export function componerDemo(registro, observadorId) {
  const observador = registro.personas.find((p) => p.id === observadorId);
  if (!observador) throw new Error(`observador desconocido: ${observadorId}`);

  const eventos = registro.eventos.filter((e) => visible(registro, e, 'evento', observador));
  const ideas = registro.ideas.filter((i) => visible(registro, i, 'idea', observador));
  const regalos = registro.regalos.filter((r) => visible(registro, r, 'regalo', observador));

  const ids = { evento: new Set(eventos.map((e) => e.id)), idea: new Set(ideas.map((i) => i.id)), regalo: new Set(regalos.map((r) => r.id)) };
  const esAdministrador = observador.rol === 'administrador';

  return {
    ...registro,
    generado_en: new Date().toISOString(),
    yo: { id: observador.id, nombre: observador.nombre, rol: observador.rol, es_administrador: esAdministrador },
    categorias: registro.categorias.filter((categoria) => {
      if (categoria.regla === 'publica') return true;
      if (categoria.regla === 'privada') return esAdministrador;
      return (registro.acceso_categoria || []).some((a) => a.categoria_id === categoria.id && a.persona_id === observador.id);
    }),
    eventos,
    ideas,
    regalos,
    ocasiones: registro.ocasiones.map((o) => ({ ...o, presupuestos: esAdministrador ? o.presupuestos : [] })),
    comentarios: (registro.comentarios || []).filter((c) => ids[c.objeto_tipo]?.has(c.objeto_id)),
  };
}
