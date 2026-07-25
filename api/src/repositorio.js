/**
 * Lectura y escritura del registro canónico sobre D1.
 *
 * La lectura devuelve el registro entero; el recorte por lector lo hace
 * `filtrado.js` justo antes de responder. Es una separación deliberada: quien
 * lee de la base no decide qué se transmite, y quien decide qué se transmite no
 * habla con la base.
 */

const CAMPOS = {
  persona: [
    'nombre', 'apellidos', 'fecha_nacimiento', 'parentesco',
    'tiene_cuenta', 'identificador_apple', 'rol', 'activa',
  ],
  atributo_persona: ['persona_id', 'clave', 'valor', 'activo'],
  categoria: ['nombre', 'regla', 'orden', 'activa'],
  etiqueta: ['nombre', 'activa', 'fusionada_en'],
  evento: [
    'titulo', 'tipo_id', 'emoji', 'inicio', 'fin', 'jornada_completa',
    'ubicacion', 'notas', 'repeticion', 'repeticion_hasta', 'lleva_regalos',
    'categoria_id', 'origen', 'persona_origen_id', 'calendario_id', 'autor_id', 'activo',
  ],
  idea: [
    'tipo', 'titulo', 'descripcion', 'categoria_id', 'precio_min', 'precio_max',
    'enlace', 'establecimiento', 'estado', 'autor_id', 'activa',
  ],
  ocasion: ['nombre', 'fecha', 'estado', 'evento_id', 'autor_id', 'activa'],
  regalo: [
    'ocasion_id', 'idea_id', 'destinatario_principal_id', 'compartido',
    'responsable_id', 'coste_real', 'estado', 'categoria_id', 'autor_id', 'activo',
  ],
  comentario: ['objeto_tipo', 'objeto_id', 'autor_id', 'texto', 'activo'],
};

/** Campos cuyo conflicto se conserva para revisión en lugar de descartarse en
 *  silencio: suelen indicar que dos personas actúan sobre el mismo regalo. */
const CAMPOS_DE_COORDINACION = { regalo: ['responsable_id', 'estado'] };

const bool = (valor) => valor === 1 || valor === true;

async function filas(db, sql, ...parametros) {
  const { results } = await db.prepare(sql).bind(...parametros).all();
  return results || [];
}

/**
 * Lee el registro completo. `soloActivos` deja fuera lo marcado como inactivo,
 * que es lo que quieren tanto la sincronización como el generador del plan.
 */
export async function leerRegistro(db, { soloActivos = true } = {}) {
  const activo = (columna) => (soloActivos ? `WHERE ${columna} = 1` : '');

  const [
    personas, atributos, categorias, accesos, etiquetas, tipos,
    eventos, participantesEvento, ideas, orientaciones,
    ocasiones, participantesOcasion, presupuestos,
    regalos, codestinatarios, comentarios, conflictos,
  ] = await Promise.all([
    filas(db, `SELECT * FROM persona ${activo('activa')} ORDER BY nombre`),
    filas(db, `SELECT * FROM atributo_persona ${activo('activo')}`),
    filas(db, `SELECT * FROM categoria ${activo('activa')} ORDER BY orden`),
    filas(db, 'SELECT * FROM acceso_categoria'),
    filas(db, `SELECT * FROM etiqueta ${activo('activa')} ORDER BY nombre`),
    filas(db, 'SELECT * FROM tipo_evento ORDER BY orden'),
    filas(db, `SELECT * FROM evento ${activo('activo')} ORDER BY inicio`),
    filas(db, 'SELECT * FROM participante_evento'),
    filas(db, `SELECT * FROM idea ${activo('activa')} ORDER BY creado_en DESC`),
    filas(db, 'SELECT * FROM orientacion_idea'),
    filas(db, `SELECT * FROM ocasion ${activo('activa')} ORDER BY fecha`),
    filas(db, 'SELECT * FROM participante_ocasion'),
    filas(db, 'SELECT * FROM presupuesto_persona'),
    filas(db, `SELECT * FROM regalo ${activo('activo')}`),
    filas(db, 'SELECT * FROM codestinatario_regalo'),
    filas(db, `SELECT * FROM comentario ${activo('activo')} ORDER BY creado_en`),
    filas(db, 'SELECT * FROM conflicto WHERE revisado = 0'),
  ]);

  const agrupar = (lista, clave) => {
    const indice = new Map();
    for (const fila of lista) {
      if (!indice.has(fila[clave])) indice.set(fila[clave], []);
      indice.get(fila[clave]).push(fila);
    }
    return indice;
  };

  const porEvento = agrupar(participantesEvento, 'evento_id');
  const porIdea = agrupar(orientaciones, 'idea_id');
  const porOcasion = agrupar(participantesOcasion, 'ocasion_id');
  const presupuestosPorOcasion = agrupar(presupuestos, 'ocasion_id');
  const porRegalo = agrupar(codestinatarios, 'regalo_id');

  return {
    personas: personas.map((p) => ({
      ...p,
      tiene_cuenta: bool(p.tiene_cuenta),
      activa: bool(p.activa),
    })),
    // Todos los indicadores viajan como booleanos de verdad, nunca como el 0 y
    // el 1 de SQLite: los tres clientes —web, iOS y el generador del plan— los
    // decodifican con tipos estrictos y una conversión suelta rompe el conjunto.
    atributos_persona: atributos.map((a) => ({ ...a, activo: bool(a.activo) })),
    categorias: categorias.map((c) => ({ ...c, activa: bool(c.activa) })),
    acceso_categoria: accesos,
    etiquetas: etiquetas.map((e) => ({ ...e, activa: bool(e.activa) })),
    tipos_evento: tipos.map((t) => ({ ...t, lleva_regalos: bool(t.lleva_regalos) })),
    eventos: eventos.map((e) => ({
      ...e,
      jornada_completa: bool(e.jornada_completa),
      lleva_regalos: e.lleva_regalos === null ? null : bool(e.lleva_regalos),
      activo: bool(e.activo),
      participantes: (porEvento.get(e.id) || []).map((p) => ({
        persona_id: p.persona_id,
        rol: p.rol,
      })),
    })),
    ideas: ideas.map((i) => ({
      ...i,
      activa: bool(i.activa),
      orientaciones: (porIdea.get(i.id) || []).map((o) =>
        o.persona_id ? { persona_id: o.persona_id } : { etiqueta_id: o.etiqueta_id },
      ),
    })),
    ocasiones: ocasiones.map((o) => ({
      ...o,
      activa: bool(o.activa),
      participantes: (porOcasion.get(o.id) || []).map((p) => p.persona_id),
      presupuestos: (presupuestosPorOcasion.get(o.id) || []).map((p) => ({
        persona_id: p.persona_id,
        importe: p.importe,
      })),
    })),
    regalos: regalos.map((r) => ({
      ...r,
      compartido: bool(r.compartido),
      activo: bool(r.activo),
      codestinatarios: (porRegalo.get(r.id) || []).map((c) => c.persona_id),
    })),
    comentarios: comentarios.map((c) => ({ ...c, activo: bool(c.activo) })),
    conflictos,
  };
}

export async function personaPorApple(db, sub) {
  const fila = await db
    .prepare('SELECT * FROM persona WHERE identificador_apple = ? AND activa = 1')
    .bind(sub)
    .first();
  return fila ? { ...fila, tiene_cuenta: bool(fila.tiene_cuenta), activa: bool(fila.activa) } : null;
}

export async function personaPorId(db, id) {
  const fila = await db.prepare('SELECT * FROM persona WHERE id = ?').bind(id).first();
  return fila ? { ...fila, tiene_cuenta: bool(fila.tiene_cuenta), activa: bool(fila.activa) } : null;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

class Rechazo extends Error {}

/** Quién puede tocar qué. La configuración del hogar es de los administradores;
 *  los contenidos, de cualquier miembro (spec funcional §2). */
function comprobarPermiso(tipo, actor, anterior, campos) {
  const soloAdministradores = ['persona', 'categoria', 'etiqueta', 'presupuesto'];
  if (soloAdministradores.includes(tipo) && actor.rol !== 'administrador') {
    throw new Rechazo(`solo un administrador puede modificar ${tipo}`);
  }

  // Cada comentario solo puede editarlo o eliminarlo quien lo escribió (§5.3).
  if (tipo === 'comentario' && anterior && anterior.autor_id !== actor.id) {
    throw new Rechazo('un comentario solo lo modifica quien lo escribió');
  }

  // De los tres orígenes solo el manual admite edición completa; en los otros
  // dos son editables el emoji, la asociación de regalos y los avisos (§4.2).
  if (tipo === 'evento' && anterior && anterior.origen !== 'manual') {
    const permitidos = new Set(['emoji', 'lleva_regalos']);
    const intrusos = Object.keys(campos).filter((c) => !permitidos.has(c));
    if (intrusos.length) {
      throw new Rechazo(
        `un evento ${anterior.origen} solo admite cambios de emoji y de regalos; ` +
        `llegaron: ${intrusos.join(', ')}`,
      );
    }
  }

  // Un regalo entregado no admite modificación de destinatario ni de ocasión (§4).
  if (tipo === 'regalo' && anterior && anterior.estado === 'entregado') {
    const congelados = ['destinatario_principal_id', 'ocasion_id'];
    const intrusos = congelados.filter((c) => c in campos);
    if (intrusos.length) {
      throw new Rechazo(`un regalo entregado no cambia de ${intrusos.join(' ni de ')}`);
    }
  }
}

async function registrarConflicto(db, tipo, id, campo, descartado, conservado, actorId) {
  await db
    .prepare(
      `INSERT INTO conflicto (id, entidad, entidad_id, campo, valor_descartado,
                              valor_conservado, autor_descartado)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), tipo, id, campo, String(descartado ?? ''), String(conservado ?? ''), actorId)
    .run();
}

async function guardarRelaciones(db, tipo, id, campos) {
  if (tipo === 'evento' && Array.isArray(campos.participantes)) {
    await db.prepare('DELETE FROM participante_evento WHERE evento_id = ?').bind(id).run();
    for (const p of campos.participantes) {
      await db
        .prepare('INSERT INTO participante_evento (evento_id, persona_id, rol) VALUES (?, ?, ?)')
        .bind(id, p.persona_id, p.rol || 'asistente')
        .run();
    }
  }

  if (tipo === 'idea' && Array.isArray(campos.orientaciones)) {
    await db.prepare('DELETE FROM orientacion_idea WHERE idea_id = ?').bind(id).run();
    for (const o of campos.orientaciones) {
      await db
        .prepare('INSERT INTO orientacion_idea (idea_id, persona_id, etiqueta_id) VALUES (?, ?, ?)')
        .bind(id, o.persona_id || null, o.etiqueta_id || null)
        .run();
    }
  }

  if (tipo === 'ocasion' && Array.isArray(campos.participantes)) {
    await db.prepare('DELETE FROM participante_ocasion WHERE ocasion_id = ?').bind(id).run();
    for (const persona of campos.participantes) {
      await db
        .prepare('INSERT INTO participante_ocasion (ocasion_id, persona_id) VALUES (?, ?)')
        .bind(id, persona)
        .run();
    }
  }

  if (tipo === 'regalo' && Array.isArray(campos.codestinatarios)) {
    await db.prepare('DELETE FROM codestinatario_regalo WHERE regalo_id = ?').bind(id).run();
    for (const persona of campos.codestinatarios) {
      if (persona === campos.destinatario_principal_id) continue;
      await db
        .prepare('INSERT INTO codestinatario_regalo (regalo_id, persona_id) VALUES (?, ?)')
        .bind(id, persona)
        .run();
    }
  }
}

/**
 * Aplica un cambio con criterio de última escritura por campo.
 *
 * Devuelve `{ aplicado, motivo }`. Un cambio rechazado no interrumpe el resto
 * del lote: la cola del dispositivo debe poder vaciarse aunque una de sus
 * entradas haya quedado obsoleta.
 */
export async function aplicarCambio(db, actor, cambio) {
  const { tipo, id, campos = {}, actualizado_en: marca } = cambio;

  if (tipo === 'presupuesto') {
    comprobarPermiso(tipo, actor, null, campos);
    await db
      .prepare(
        `INSERT INTO presupuesto_persona (ocasion_id, persona_id, importe, actualizado_en)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ocasion_id, persona_id) DO UPDATE SET importe = excluded.importe,
                                                           actualizado_en = excluded.actualizado_en`,
      )
      .bind(campos.ocasion_id, campos.persona_id, Number(campos.importe) || 0, marca || new Date().toISOString())
      .run();
    return { aplicado: true };
  }

  const columnas = CAMPOS[tipo];
  if (!columnas) return { aplicado: false, motivo: `tipo desconocido: ${tipo}` };

  const anterior = await db.prepare(`SELECT * FROM ${tipo} WHERE id = ?`).bind(id).first();

  try {
    comprobarPermiso(tipo, actor, anterior, campos);
  } catch (error) {
    if (error instanceof Rechazo) return { aplicado: false, motivo: error.message };
    throw error;
  }

  const ahora = marca || new Date().toISOString();
  const propuestos = Object.fromEntries(
    Object.entries(campos).filter(([clave]) => columnas.includes(clave)),
  );

  if (anterior && anterior.actualizado_en > ahora) {
    // El servidor tiene una versión más reciente. Se descarta la que llega,
    // salvo en los campos de coordinación, donde queda constancia.
    for (const campo of CAMPOS_DE_COORDINACION[tipo] || []) {
      if (campo in propuestos && String(propuestos[campo] ?? '') !== String(anterior[campo] ?? '')) {
        await registrarConflicto(db, tipo, id, campo, propuestos[campo], anterior[campo], actor.id);
      }
    }
    await guardarRelaciones(db, tipo, id, campos);
    return { aplicado: false, motivo: 'el servidor tiene una versión más reciente' };
  }

  const claves = Object.keys(propuestos);
  if (anterior) {
    if (claves.length) {
      const asignaciones = claves.map((c) => `${c} = ?`).join(', ');
      await db
        .prepare(`UPDATE ${tipo} SET ${asignaciones}, actualizado_en = ? WHERE id = ?`)
        .bind(...claves.map((c) => propuestos[c]), ahora, id)
        .run();
    }
  } else {
    const conId = ['id', ...claves];
    const valores = [id, ...claves.map((c) => propuestos[c])];
    await db
      .prepare(
        `INSERT INTO ${tipo} (${conId.join(', ')}, creado_en, actualizado_en)
         VALUES (${conId.map(() => '?').join(', ')}, ?, ?)`,
      )
      .bind(...valores, ahora, ahora)
      .run();
  }

  await guardarRelaciones(db, tipo, id, campos);
  return { aplicado: true };
}
