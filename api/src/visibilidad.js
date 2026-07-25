/**
 * Función de visibilidad, aplicada en el servidor antes de transmitir.
 *
 * Espejo exacto de `scripts/agenda/visibilidad.py` y del apartado 6 de
 * `specs/modelo-datos.md`. Vive en el servidor y no en el cliente por el
 * requisito no funcional de mayor importancia del sistema: el dispositivo de una
 * persona nunca debe descargar los datos que le están ocultos, porque en un
 * modelo sin conexión esa información permanecería accesible por otras vías
 * (spec funcional §9).
 */

/** Destinatarios de una idea: solo las personas **con cuenta** de su orientación.
 *  Las etiquetas se ignoran; clasifican, no protegen. */
export function destinatariosDeIdea(registro, idea) {
  const conCuenta = new Set(
    registro.personas.filter((p) => p.tiene_cuenta).map((p) => p.id),
  );
  return new Set(
    (idea.orientaciones || [])
      .map((o) => o.persona_id)
      .filter((id) => id && conCuenta.has(id)),
  );
}

/** Destinatario principal más todos los co-destinatarios. */
export function destinatariosDeRegalo(regalo) {
  return new Set([
    regalo.destinatario_principal_id,
    ...(regalo.codestinatarios || []),
  ]);
}

/**
 * Un evento no se oculta por destinatario: es público por defecto y la reserva
 * se expresa con una categoría, no marcando a una persona. Un cumpleaños no es
 * un secreto; lo que se oculta es la dimensión de regalos.
 */
export function destinatariosDeEvento() {
  return new Set();
}

function destinatarios(registro, elemento, clase) {
  if (clase === 'idea') return destinatariosDeIdea(registro, elemento);
  if (clase === 'regalo') return destinatariosDeRegalo(elemento);
  if (clase === 'evento') return destinatariosDeEvento();
  throw new Error(`clase no soportada por la función de visibilidad: ${clase}`);
}

/**
 * ¿Es visible `elemento` (de clase `idea`, `regalo` o `evento`) para `observador`?
 *
 * El orden de las comprobaciones importa: la cláusula del deseo precede a la del
 * destinatario, porque de lo contrario una persona dejaría de ver su propia
 * lista de deseos en el instante de crearla.
 */
export function visible(registro, elemento, clase, observador) {
  if (!observador || !observador.tiene_cuenta) return false;

  if (clase === 'idea' && elemento.tipo === 'deseo' && elemento.autor_id === observador.id) {
    return true;
  }

  const categoria = elemento.categoria_id
    ? registro.categorias.find((c) => c.id === elemento.categoria_id)
    : null;

  if (categoria) {
    if (categoria.regla === 'privada' && observador.rol !== 'administrador') return false;
    if (categoria.regla === 'restringida') {
      const tieneAcceso = (registro.acceso_categoria || []).some(
        (a) => a.categoria_id === categoria.id && a.persona_id === observador.id,
      );
      if (!tieneAcceso) return false;
    }
  }

  if (destinatarios(registro, elemento, clase).has(observador.id)) return false;

  return true;
}

/**
 * Vista más conservadora, para quien no es observador del modelo. La usa el plan
 * semanal con los destinatarios sin cuenta (specs/plan-semanal.md §5).
 */
export function visiblePublicamente(registro, elemento, clase) {
  if (clase !== 'evento') return false;
  if (!elemento.categoria_id) return true;
  const categoria = registro.categorias.find((c) => c.id === elemento.categoria_id);
  return !categoria || categoria.regla === 'publica';
}
