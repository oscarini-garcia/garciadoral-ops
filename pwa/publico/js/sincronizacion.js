/**
 * Motor de sincronización: interfaz optimista sobre una cola persistente.
 *
 * Toda escritura se refleja de inmediato en la instantánea local y se apila en
 * la cola; la subida ocurre después, cuando hay red. No hay indicadores de
 * espera en el camino principal (specs/ux.md §1).
 *
 * La respuesta del servidor **sustituye** la instantánea local. Es lo que hace
 * que la retirada retroactiva funcione sola: cuando alguien pasa a ser
 * destinatario de un elemento que ya tenía sincronizado, la siguiente respuesta
 * sencillamente no lo trae y desaparece de su dispositivo.
 */

import {
  encolarCambio, guardarInstantanea, leerCola, leerInstantanea, vaciarCola,
} from './almacen.js';
import { ahora } from './modelo.js';

const PLURAL = {
  persona: 'personas',
  atributo_persona: 'atributos_persona',
  categoria: 'categorias',
  etiqueta: 'etiquetas',
  evento: 'eventos',
  idea: 'ideas',
  ocasion: 'ocasiones',
  regalo: 'regalos',
  comentario: 'comentarios',
};

let configuracion = { base: '', token: '', demostracion: false };
let instantaneaActual = null;
let estadoActual = { estado: navigator.onLine ? 'al-dia' : 'sin-conexion', ultima: null };
const suscriptores = new Set();
let sincronizando = false;

export const instantanea = () => instantaneaActual;
export const estado = () => estadoActual;

export function suscribir(escuchador) {
  suscriptores.add(escuchador);
  return () => suscriptores.delete(escuchador);
}

function anunciar() {
  for (const escuchador of suscriptores) escuchador(instantaneaActual, estadoActual);
}

function fijarEstado(estado, ultima = estadoActual.ultima) {
  estadoActual = { estado, ultima };
  anunciar();
}

// --------------------------------------------------------------- Arranque --

export async function iniciar({ base, token, demostracion = false, inicial = null }) {
  configuracion = { base, token, demostracion };

  instantaneaActual = inicial || (await leerInstantanea());
  if (instantaneaActual) anunciar();

  if (demostracion) {
    if (inicial) await guardarInstantanea(inicial);
    fijarEstado('demostracion');
    return instantaneaActual;
  }

  window.addEventListener('online', () => sincronizar());
  window.addEventListener('offline', () => fijarEstado('sin-conexion'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sincronizar();
  });

  await sincronizar();
  return instantaneaActual;
}

// ------------------------------------------------------------- Escrituras --

/**
 * Registra un cambio. `campos` son solo los que cambian; el resto se conserva.
 * Devuelve la instantánea ya actualizada, de modo que quien llama puede pintar
 * sin esperar a nada.
 */
export async function guardar(tipo, id, campos) {
  const cambio = { tipo, id, campos, actualizado_en: ahora() };
  aplicarEnLocal(cambio);
  derivarEnLocal();
  await guardarInstantanea(instantaneaActual);
  anunciar();

  if (configuracion.demostracion) return instantaneaActual;

  await encolarCambio(cambio);
  sincronizar();
  return instantaneaActual;
}

/** El borrado nunca es físico: se marca como inactivo (specs/modelo-datos.md §1). */
export function retirar(tipo, id) {
  const campo = ['persona', 'idea', 'ocasion', 'categoria', 'etiqueta'].includes(tipo) ? 'activa' : 'activo';
  return guardar(tipo, id, { [campo]: 0 });
}

function aplicarEnLocal(cambio) {
  const clave = PLURAL[cambio.tipo];

  if (cambio.tipo === 'presupuesto') {
    const ocasion = instantaneaActual.ocasiones.find((o) => o.id === cambio.campos.ocasion_id);
    if (!ocasion) return;
    ocasion.presupuestos = (ocasion.presupuestos || []).filter((p) => p.persona_id !== cambio.campos.persona_id);
    ocasion.presupuestos.push({ persona_id: cambio.campos.persona_id, importe: Number(cambio.campos.importe) || 0 });
    return;
  }

  if (!clave) return;
  instantaneaActual[clave] = instantaneaActual[clave] || [];
  const lista = instantaneaActual[clave];
  const indice = lista.findIndex((fila) => fila.id === cambio.id);

  if (indice === -1) {
    lista.push({ id: cambio.id, creado_en: cambio.actualizado_en, actualizado_en: cambio.actualizado_en, ...cambio.campos });
  } else {
    lista[indice] = { ...lista[indice], ...cambio.campos, actualizado_en: cambio.actualizado_en };
  }
}

/**
 * Los estados que nadie mantiene a mano, replicados en el cliente para que la
 * interfaz no muestre una idea «activa» un segundo después de promoverla. El
 * servidor vuelve a calcularlos y su versión es la que manda.
 */
function derivarEnLocal() {
  const regalos = (instantaneaActual.regalos || []).filter((r) => r.activo !== false);

  for (const idea of instantaneaActual.ideas || []) {
    const suyos = regalos.filter((r) => r.idea_id === idea.id);
    if (suyos.some((r) => r.estado === 'entregado')) idea.estado = 'cerrada';
    else if (suyos.length && idea.estado === 'activa') idea.estado = 'en_curso';
    else if (!suyos.length && idea.estado === 'en_curso') idea.estado = 'activa';
  }

  for (const ocasion of instantaneaActual.ocasiones || []) {
    const suyos = regalos.filter((r) => r.ocasion_id === ocasion.id);
    if (suyos.length && suyos.every((r) => r.estado === 'entregado')) ocasion.estado = 'cerrada';
  }
}

// ------------------------------------------------------------ Subida/bajada --

async function peticion(camino, opciones = {}) {
  const respuesta = await fetch(`${configuracion.base}${camino}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${configuracion.token}`,
      'X-Plataforma': 'web',
      ...(opciones.headers || {}),
    },
  });
  if (respuesta.status === 401) {
    const error = new Error('sesión caducada');
    error.sesionCaducada = true;
    throw error;
  }
  if (!respuesta.ok) throw new Error(`la API respondió ${respuesta.status}`);
  return respuesta.json();
}

export async function sincronizar() {
  if (configuracion.demostracion || sincronizando) return instantaneaActual;
  if (!navigator.onLine) { fijarEstado('sin-conexion'); return instantaneaActual; }

  sincronizando = true;
  fijarEstado('sincronizando');

  try {
    const cola = await leerCola();
    let nueva;

    if (cola.length) {
      const respuesta = await peticion('/api/cambios', {
        method: 'POST',
        body: JSON.stringify({ cambios: cola.map(({ orden, ...cambio }) => cambio) }),
      });
      await vaciarCola(cola[cola.length - 1].orden);
      nueva = respuesta.instantanea;

      const rechazados = (respuesta.resultados || []).filter((r) => !r.aplicado);
      if (rechazados.length) {
        console.warn('Cambios no aplicados por el servidor:', rechazados);
      }
    } else {
      nueva = await peticion('/api/sync');
    }

    instantaneaActual = nueva;
    await guardarInstantanea(nueva);
    fijarEstado('al-dia', new Date().toISOString());
  } catch (error) {
    if (error.sesionCaducada) {
      fijarEstado('sesion-caducada');
      anunciar();
    } else {
      console.warn('Sincronización fallida:', error);
      fijarEstado(navigator.onLine ? 'error' : 'sin-conexion');
    }
  } finally {
    sincronizando = false;
  }

  return instantaneaActual;
}
