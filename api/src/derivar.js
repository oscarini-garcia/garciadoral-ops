/**
 * Estados que nadie mantiene a mano.
 *
 * El diseño de la especificación se sostiene sobre un principio: de las
 * transiciones de una idea, **solo dos son manuales** —el descarte y la
 * reactivación—. Las restantes se derivan de lo que ocurre en la ocasión
 * vinculada, porque es en el mantenimiento manual donde este tipo de sistemas se
 * degrada hasta quedar inservible (spec funcional §5.2).
 *
 * Se ejecuta después de aplicar un lote de cambios, sobre el registro entero.
 * Es barato —el volumen es el de un hogar— y evita tener que razonar sobre qué
 * transición dispara cada mutación concreta.
 */

import { caducarTratos } from './lio.js';

export async function derivarEstados(db) {
  // 0. Propuestas de paseo que ya no pueden aceptarse.
  //
  //    Es lo único de Lío que se deriva aquí. Aceptar un cambio o confirmar una
  //    corrección lo escribe el dispositivo —la propuesta resuelta y la fila del
  //    paseo van en el mismo lote—, porque el trato es una convención entre
  //    cuatro personas de la misma casa y no una frontera que haya que blindar:
  //    el Worker ya comprueba lo único que sí lo es, que quien contesta sea a
  //    quien se le preguntó. Caducar, en cambio, no lo puede hacer nadie a mano.
  await caducarTratos(db);

  // 1. Idea promovida a una ocasión -> en curso; entregada -> cerrada.
  //    Cerrada es terminal: para reutilizar la idea se emplea el duplicado.
  //
  //    Cierra igual la ocasión archivada, y no solo el regalo entregado. Son las
  //    dos maneras de terminar que tiene un regalo —se entrega, o su ocasión se
  //    da por cerrada cuando la fecha ya pasó—, y contar solo una dejaba en el
  //    banco ideas «en curso» para siempre, señaladas con una ocasión archivada
  //    que nadie iba a reabrir y que por tanto ya nunca las liberaría.
  await db
    .prepare(
      `UPDATE idea
          SET estado = 'cerrada', actualizado_en = datetime('now')
        WHERE estado IN ('activa', 'en_curso')
          AND EXISTS (SELECT 1 FROM regalo r
                        JOIN ocasion o ON o.id = r.ocasion_id
                       WHERE r.idea_id = idea.id AND r.activo = 1
                         AND (r.estado = 'entregado' OR o.estado = 'cerrada'))`,
    )
    .run();

  await db
    .prepare(
      `UPDATE idea
          SET estado = 'en_curso', actualizado_en = datetime('now')
        WHERE estado = 'activa'
          AND EXISTS (SELECT 1 FROM regalo r
                       WHERE r.idea_id = idea.id AND r.activo = 1)`,
    )
    .run();

  // 2. Idea retirada de la ocasión -> vuelve a estar disponible.
  //
  //    Vale también para la que estaba cerrada, y no solo para la que estaba en
  //    curso. Cerrar era hasta ahora un punto sin retorno escondido: bastaba con
  //    marcar un regalo como entregado por error para que su idea se fuera del
  //    banco, y retirarlo después no la devolvía. La regla queda simétrica —una
  //    idea está cogida mientras algo cuelgue de ella, y libre cuando no cuelga
  //    nada—, que es lo que hace que tirar atrás un regalo funcione siempre.
  await db
    .prepare(
      `UPDATE idea
          SET estado = 'activa', actualizado_en = datetime('now')
        WHERE estado IN ('en_curso', 'cerrada')
          AND NOT EXISTS (SELECT 1 FROM regalo r
                           WHERE r.idea_id = idea.id AND r.activo = 1)`,
    )
    .run();

  // 3. Ocasión con todos sus regalos entregados -> cerrada. Sus regalos pasan a
  //    formar parte del histórico consultable de cada destinatario, que se
  //    deriva por consulta y no se almacena (spec funcional §6.5).
  await db
    .prepare(
      `UPDATE ocasion
          SET estado = 'cerrada', actualizado_en = datetime('now')
        WHERE estado = 'abierta'
          AND EXISTS (SELECT 1 FROM regalo r WHERE r.ocasion_id = ocasion.id AND r.activo = 1)
          AND NOT EXISTS (SELECT 1 FROM regalo r
                           WHERE r.ocasion_id = ocasion.id AND r.activo = 1
                             AND r.estado <> 'entregado')`,
    )
    .run();
}
