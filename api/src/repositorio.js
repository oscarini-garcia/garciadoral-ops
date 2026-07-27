/**
 * Lectura y escritura del registro canónico sobre D1.
 *
 * La lectura devuelve el registro entero; el recorte por lector lo hace
 * `filtrado.js` justo antes de responder. Es una separación deliberada: quien
 * lee de la base no decide qué se transmite, y quien decide qué se transmite no
 * habla con la base.
 */

import { contarPendientes } from './solicitudes.js';
import { esDeLaCasa, guardarCuadro, leerCuadro } from './lio.js';

const CAMPOS = {
  persona: [
    'nombre', 'apellidos', 'fecha_nacimiento', 'parentesco',
    'tiene_cuenta', 'identificador_apple', 'rol', 'circulo', 'genero', 'activa',
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
  paseo: ['fecha', 'turno', 'asignado_id', 'hecho_por_id', 'hecho_en', 'activo'],
  trato_paseo: [
    'fecha', 'turno', 'clase', 'proponente_id', 'destinatario_id',
    'asignado_previo_id', 'estado', 'resuelto_en', 'activo',
  ],
  lugar: ['nombre', 'emoji', 'evento_id', 'autor_id', 'activo'],
  apunte: ['lugar_id', 'clase', 'titulo', 'detalle', 'hecho', 'autor_id', 'activo'],
  voto: ['apunte_id', 'persona_id', 'activo'],
  visto: ['persona_id', 'objeto_tipo', 'objeto_id', 'hasta'],
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
 * Lo mismo, pero para una tabla que puede no existir todavía.
 *
 * Desplegar y migrar son dos pasos distintos: el empujón a `main` sube el
 * Worker solo, y las tablas nuevas se aplican marcando una casilla que alguien
 * tiene que marcar. Entre una cosa y la otra hay una ventana, y sin esto la
 * ventana es una caída: una consulta a una tabla que no está tumba
 * `leerRegistro` entera, y con ella la sincronización de todos los dispositivos
 * por una función que ninguno estaba usando.
 *
 * Solo se traga ese error y solo para las tablas que se le pasan. Cualquier otro
 * fallo de la base sigue subiendo, que es lo que tiene que hacer.
 */
async function filasSiLaTablaEsta(db, sql, ...parametros) {
  try {
    return await filas(db, sql, ...parametros);
  } catch (error) {
    if (/no such table/i.test(String(error?.message || error))) return [];
    throw error;
  }
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
    paseos, tratos, cuadroLio,
    lugares, apuntes, votos, vistos,
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
    filasSiLaTablaEsta(db, `SELECT * FROM paseo ${activo('activo')} ORDER BY fecha`),
    // Las propuestas resueltas se quedan en la base pero no viajan: lo que la
    // pantalla necesita es lo que hay que contestar, y una bandeja con el
    // historial de todos los cambios del año no la lee nadie.
    filasSiLaTablaEsta(
      db,
      `SELECT * FROM trato_paseo WHERE estado = 'pendiente' ${soloActivos ? 'AND activo = 1' : ''}`,
    ),
    leerCuadro(db),
    // Sitios llega por `filasSiLaTablaEsta` como Lío: desplegar el Worker y
    // aplicar las migraciones son dos pasos, y entre uno y otro hay una ventana
    // en la que estas tablas no existen todavía. Sin esto, esa ventana es una
    // caída de la sincronización entera.
    filasSiLaTablaEsta(db, `SELECT * FROM lugar ${activo('activo')} ORDER BY nombre`),
    filasSiLaTablaEsta(db, `SELECT * FROM apunte ${activo('activo')} ORDER BY creado_en`),
    filasSiLaTablaEsta(db, `SELECT * FROM voto ${activo('activo')}`),
    filasSiLaTablaEsta(db, 'SELECT * FROM visto'),
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
    // Lío: el cuadro es la regla y los paseos son las excepciones escritas. Van
    // los dos porque sin el cuadro un día sin fila no diría nada, y sin las
    // filas el cuadro reescribiría el pasado cada vez que se cambia.
    lio_cuadro: cuadroLio,
    paseos: paseos.map((p) => ({ ...p, activo: bool(p.activo) })),
    tratos_paseo: tratos.map((t) => ({ ...t, activo: bool(t.activo) })),
    // Sitios: la carpeta, lo que hay dentro y a quién le apetece cada cosa.
    lugares: lugares.map((l) => ({ ...l, activo: bool(l.activo) })),
    apuntes: apuntes.map((a) => ({ ...a, hecho: bool(a.hecho), activo: bool(a.activo) })),
    votos: votos.map((v) => ({ ...v, activo: bool(v.activo) })),
    // Lo visto no se recorta por visibilidad sino por dueño, y eso lo hace
    // `filtrado.js`: las filas de una persona no le sirven de nada a otra.
    vistos,
    // Cuántas personas esperan a que alguien las apruebe. Va aquí y no en una
    // ruta propia para que llegue con la sincronización, sin una petición más;
    // `filtrado.js` decide a quién se le transmite, que es solo a los
    // administradores.
    solicitudes_pendientes: await contarPendientes(db),
  };
}

/**
 * La persona con cuenta a la que pertenece un identificador de Apple.
 *
 * Exige `tiene_cuenta`, y no solo el vínculo: un identificador que quedara
 * apuntando a alguien a quien se le retiró la cuenta abriría sesión aquí y
 * fallaría en la petición siguiente, que es la peor forma de decir que no.
 */
export async function personaPorApple(db, sub) {
  const fila = await db
    .prepare(
      'SELECT * FROM persona WHERE identificador_apple = ? AND tiene_cuenta = 1 AND activa = 1',
    )
    .bind(sub)
    .first();
  return fila ? { ...fila, tiene_cuenta: bool(fila.tiene_cuenta), activa: bool(fila.activa) } : null;
}

export async function personaPorId(db, id) {
  const fila = await db.prepare('SELECT * FROM persona WHERE id = ?').bind(id).first();
  return fila ? { ...fila, tiene_cuenta: bool(fila.tiene_cuenta), activa: bool(fila.activa) } : null;
}

/**
 * Da de baja la cuenta de una persona sin borrarla del hogar.
 *
 * Aquí «cuenta» y «persona» son dos cosas distintas, y el modelo ya las
 * separaba antes de que hiciera falta para esto: una persona sin cuenta es un
 * estado de primera clase (specs/modelo-datos.md §4), el de la abuela que
 * cumple años y recibe regalos pero no entra en la aplicación. Darse de baja es
 * exactamente pasar a ese estado.
 *
 * Se va, por tanto, todo lo que constituye la cuenta: el vínculo con Apple, la
 * condición de titular, el rol, los dispositivos, las preferencias de aviso y
 * los accesos concedidos a categorías restringidas. Se queda la persona como
 * miembro del hogar, y con ella lo que otras personas escribieron sobre ella o
 * junto a ella —eventos compartidos, regalos, comentarios—, que no es dato de
 * la cuenta sino contenido del registro familiar y no le pertenece a solas.
 *
 * Sin el vínculo con Apple, ese mismo identificador vuelve a ser un
 * desconocido: `personaPorApple` no lo encuentra y `abrirSesion` responde
 * `sin_vincular`, que es la puerta por la que se entra la primera vez. Volver
 * exige que una administradora vuelva a vincular, igual que al principio.
 */
export async function darDeBajaCuenta(db, personaId) {
  await db.batch([
    db.prepare('DELETE FROM dispositivo WHERE persona_id = ?').bind(personaId),
    db.prepare('DELETE FROM preferencia_notificacion WHERE persona_id = ?').bind(personaId),
    db.prepare('DELETE FROM acceso_categoria WHERE persona_id = ?').bind(personaId),
    db.prepare(
      `UPDATE persona
          SET identificador_apple = NULL,
              tiene_cuenta = 0,
              rol = NULL,
              actualizado_en = datetime('now')
        WHERE id = ?`,
    ).bind(personaId),
  ]);
}

/** Cuántas personas con cuenta administradora quedarían sin contar a `exceptoId`. */
export async function administradoresRestantes(db, exceptoId) {
  const fila = await db
    .prepare(
      `SELECT COUNT(*) AS cuantos FROM persona
        WHERE rol = 'administrador' AND tiene_cuenta = 1 AND activa = 1 AND id <> ?`,
    )
    .bind(exceptoId)
    .first();
  return Number(fila?.cuantos || 0);
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

class Rechazo extends Error {}

/** Quién puede tocar qué. La configuración del hogar es de los administradores;
 *  los contenidos, de cualquier miembro (spec funcional §2). */
function comprobarPermiso(tipo, actor, anterior, campos) {
  const soloAdministradores = ['persona', 'categoria', 'etiqueta', 'presupuesto', 'lio_cuadro'];
  if (soloAdministradores.includes(tipo) && actor.rol !== 'administrador') {
    throw new Rechazo(`solo un administrador puede modificar ${tipo}`);
  }

  // Los paseos son de la casa: quien no está en el círculo cerrado no los ve
  // (`filtrado.js`) y tampoco los escribe.
  if ((tipo === 'paseo' || tipo === 'trato_paseo') && !esDeLaCasa(actor)) {
    throw new Rechazo('los paseos de Lío son de quien vive en casa');
  }

  // Una propuesta la resuelve **su destinatario y nadie más**, que es lo único
  // que la convierte en un trato y no en una imposición. Quien la hizo puede
  // retirarla —marcarla inactiva—, y ahí se acaba lo que puede hacer con ella.
  if (tipo === 'trato_paseo' && anterior) {
    const resuelve = 'estado' in campos && campos.estado !== anterior.estado;
    if (resuelve && actor.id !== anterior.destinatario_id) {
      throw new Rechazo('una propuesta la contesta la persona a la que se le hizo');
    }
    if (!resuelve && actor.id !== anterior.proponente_id && actor.id !== anterior.destinatario_id) {
      throw new Rechazo('una propuesta solo la tocan las dos partes');
    }
    if (anterior.estado !== 'pendiente' && resuelve) {
      throw new Rechazo(`esa propuesta ya está ${anterior.estado}`);
    }
  }

  // Cada comentario solo puede editarlo o eliminarlo quien lo escribió (§5.3).
  if (tipo === 'comentario' && anterior && anterior.autor_id !== actor.id) {
    throw new Rechazo('un comentario solo lo modifica quien lo escribió');
  }

  // Sitios es de la casa, igual que Lío: quien no está en el círculo cerrado no
  // lo recibe (`filtrado.js`) y tampoco lo escribe.
  if (['lugar', 'apunte', 'voto'].includes(tipo) && !esDeLaCasa(actor)) {
    throw new Rechazo('los sitios son de quien vive en casa');
  }

  // Un apunte lo borra quien lo escribió, o un administrador. Es la misma regla
  // que el comentario y por el mismo motivo: el único desperfecto que este
  // módulo puede producir es que alguien encuentre borrado lo que escribió y no
  // sepa quién fue. Editarlo sí puede cualquiera de casa —corregir una hora o
  // añadir el detalle que falta es cuidar la guía, no apropiársela—.
  if (tipo === 'apunte' && anterior && 'activo' in campos && !campos.activo) {
    if (anterior.autor_id !== actor.id && actor.rol !== 'administrador') {
      throw new Rechazo('un apunte lo borra quien lo escribió');
    }
  }

  // El voto es de quien vota y de nadie más.
  if (tipo === 'voto' && campos.persona_id && campos.persona_id !== actor.id) {
    throw new Rechazo('un voto es de quien lo pone');
  }
  if (tipo === 'voto' && anterior && anterior.persona_id !== actor.id) {
    throw new Rechazo('un voto es de quien lo pone');
  }

  // Y lo visto es de cada uno: no hay caso en que a alguien le interese escribir
  // en el registro de lectura de otra persona.
  if (tipo === 'visto' && (campos.persona_id || anterior?.persona_id) !== actor.id) {
    throw new Rechazo('lo visto es de quien mira');
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

  // El cuadro de Lío no es una fila con identificador sino una casilla de
  // `configuracion`, así que viaja por la cola como un tipo propio y se escribe
  // entero de una vez: catorce casillas son un solo dato.
  if (tipo === 'lio_cuadro') {
    try {
      comprobarPermiso(tipo, actor, null, campos);
    } catch (error) {
      if (error instanceof Rechazo) return { aplicado: false, motivo: error.message };
      throw error;
    }
    await guardarCuadro(db, actor, campos.cuadro);
    return { aplicado: true };
  }

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

  // Un sitio se borra vacío, y esto se comprueba aquí y no solo en la pantalla
  // porque la pantalla decide con la instantánea que tenga: si otra persona ha
  // apuntado algo desde entonces, ese dispositivo cree que el sitio está vacío y
  // no lo está. Lo que se protege son cosas que escribieron cuatro personas.
  if (tipo === 'lugar' && anterior && 'activo' in campos && !campos.activo) {
    const dentro = await db
      .prepare('SELECT COUNT(*) AS cuantos FROM apunte WHERE lugar_id = ? AND activo = 1')
      .bind(id)
      .first();
    const cuantos = Number(dentro?.cuantos || 0);
    if (cuantos) {
      return {
        aplicado: false,
        motivo: `«${anterior.nombre}» todavía tiene ${cuantos} apunte${cuantos === 1 ? '' : 's'}`,
      };
    }
  }

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
