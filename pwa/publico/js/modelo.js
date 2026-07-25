/**
 * Consultas sobre la instantánea local.
 *
 * Todo lo que hay aquí opera sobre datos **ya filtrados** por el servidor. La
 * aplicación no vuelve a evaluar la visibilidad: si un elemento está en el
 * almacén es porque su titular puede verlo. El único cálculo relacionado con la
 * ocultación que se hace en el dispositivo es el aviso «Por aquí no se mira»,
 * que se deriva de una condición estática —¿es mío este evento?— y nunca de un
 * recuento recibido del servidor, que sería por sí mismo el dato que se
 * pretende ocultar (spec funcional §9).
 */

export const EMOJI_POR_DEFECTO = '📌';

export const nuevoId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

export const ahora = () => new Date().toISOString();

export function crearVista(instantanea) {
  const personas = new Map((instantanea.personas || []).map((p) => [p.id, p]));
  const categorias = new Map((instantanea.categorias || []).map((c) => [c.id, c]));
  const tipos = new Map((instantanea.tipos_evento || []).map((t) => [t.id, t]));
  const etiquetas = new Map((instantanea.etiquetas || []).map((e) => [e.id, e]));
  const yo = instantanea.yo || {};

  const api = {
    datos: instantanea,
    yo,

    persona: (id) => personas.get(id) || null,
    nombre: (id) => personas.get(id)?.nombre || '—',
    personas: () => [...personas.values()].filter((p) => p.activa !== false),
    personasConCuenta: () => api.personas().filter((p) => p.tiene_cuenta),
    personasSinCuenta: () => api.personas().filter((p) => !p.tiene_cuenta),
    categoria: (id) => categorias.get(id) || null,
    categorias: () => [...categorias.values()],
    tipoEvento: (id) => tipos.get(id) || null,
    tiposEvento: () => [...tipos.values()],
    etiqueta: (id) => etiquetas.get(id) || null,
    etiquetas: () => [...etiquetas.values()],
    emojisPermitidos: () => instantanea.emojis_permitidos || [],
    esAdministrador: () => yo.rol === 'administrador',

    evento: (id) => (instantanea.eventos || []).find((e) => e.id === id) || null,
    idea: (id) => (instantanea.ideas || []).find((i) => i.id === id) || null,
    ocasion: (id) => (instantanea.ocasiones || []).find((o) => o.id === id) || null,
    regalo: (id) => (instantanea.regalos || []).find((r) => r.id === id) || null,

    emojiDe(evento) {
      if (!evento) return EMOJI_POR_DEFECTO;
      if (evento.emoji) return evento.emoji;
      return tipos.get(evento.tipo_id)?.emoji || EMOJI_POR_DEFECTO;
    },

    /** Valor propuesto por el tipo, salvo que el evento lo haya corregido.
     *  Un entreno o una revisión del coche no deben mostrar campos que nunca se
     *  van a rellenar (spec funcional §4.4). */
    llevaRegalos(evento) {
      if (!evento) return false;
      if (evento.lleva_regalos !== null && evento.lleva_regalos !== undefined) return Boolean(evento.lleva_regalos);
      return Boolean(tipos.get(evento.tipo_id)?.lleva_regalos);
    },

    protagonistas: (evento) => (evento?.participantes || []).filter((p) => p.rol === 'protagonista').map((p) => p.persona_id),
    participantes: (evento) => (evento?.participantes || []).map((p) => p.persona_id),

    /** ¿Este evento va de mí? Es la condición estática que enciende el aviso. */
    esMio(evento) {
      if (!evento || !yo.id) return false;
      if (evento.persona_origen_id === yo.id) return true;
      return api.protagonistas(evento).includes(yo.id);
    },

    ocasionDeEvento: (eventoId) => (instantanea.ocasiones || []).find((o) => o.evento_id === eventoId) || null,
    regalosDe: (ocasionId) => (instantanea.regalos || []).filter((r) => r.ocasion_id === ocasionId && r.activo !== false),

    regalosPara(ocasionId, personaId) {
      return api.regalosDe(ocasionId).filter(
        (r) => r.destinatario_principal_id === personaId || (r.codestinatarios || []).includes(personaId),
      );
    },

    comentariosDe: (tipo, id) =>
      (instantanea.comentarios || []).filter((c) => c.objeto_tipo === tipo && c.objeto_id === id && c.activo !== false),

    /** Banco de ideas: lo activo y lo que está en curso, que permanece a la
     *  vista señalado con su ocasión para que nadie lo registre por su cuenta. */
    banco: () => (instantanea.ideas || []).filter(
      (i) => i.activa !== false && i.tipo === 'sugerencia' && ['activa', 'en_curso'].includes(i.estado),
    ),

    deseosDe: (personaId) =>
      (instantanea.ideas || []).filter(
        (i) => i.activa !== false && i.tipo === 'deseo' && i.autor_id === personaId && i.estado !== 'descartada',
      ),

    ideasPara: (personaId) =>
      (instantanea.ideas || []).filter(
        (i) => i.activa !== false && i.tipo === 'sugerencia'
          && (i.orientaciones || []).some((o) => o.persona_id === personaId),
      ),

    /** Histórico derivado por consulta sobre las ocasiones cerradas: no existe
     *  entidad de histórico, de modo que no puede divergir del dato de origen. */
    historicoDe(personaId) {
      const cerradas = new Set((instantanea.ocasiones || []).filter((o) => o.estado === 'cerrada').map((o) => o.id));
      return (instantanea.regalos || []).filter(
        (r) => r.activo !== false && cerradas.has(r.ocasion_id)
          && (r.destinatario_principal_id === personaId || (r.codestinatarios || []).includes(personaId)),
      );
    },

    atributosDe: (personaId) =>
      (instantanea.atributos_persona || []).filter((a) => a.persona_id === personaId && a.activo !== false),

    /** Gasto registrado y número de regalos sin importe. Distinguir ambas cosas
     *  evita mostrar una desviación favorable inexistente (spec funcional §6.3). */
    gastoDe(ocasionId, personaId) {
      const regalos = api.regalosPara(ocasionId, personaId);
      const conImporte = regalos.filter((r) => typeof r.coste_real === 'number');
      return {
        regalos: regalos.length,
        registrado: conImporte.reduce((suma, r) => suma + r.coste_real, 0),
        sinImporte: regalos.length - conImporte.length,
      };
    },
  };

  return api;
}

export const ESTADOS_REGALO = [
  { valor: 'pendiente', texto: 'Pendiente' },
  { valor: 'comprado', texto: 'Comprado' },
  { valor: 'envuelto', texto: 'Envuelto' },
  { valor: 'entregado', texto: 'Entregado' },
];

export const REPETICIONES = [
  { valor: 'ninguna', texto: 'No se repite' },
  { valor: 'semanal', texto: 'Cada semana' },
  { valor: 'mensual', texto: 'Cada mes' },
  { valor: 'anual', texto: 'Cada año' },
];

export function formatearImporte(valor) {
  if (typeof valor !== 'number') return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(valor);
}
