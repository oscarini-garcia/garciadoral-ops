/**
 * La bandeja: quién está esperando a que le abran la puerta, y la aprobación.
 *
 * Es la otra mitad de cliente del portero (`acceso.js` es la de quien espera;
 * esta, la de quien decide). Vive fuera de la pantalla de Gente porque no habla
 * de la gente del hogar sino de quien todavía no lo es; lo que necesita de la
 * aplicación llega por `ctx` —`ctx.vista.personasSinCuenta()` es el enganche
 * que hace posible el camino de la abuela— y por `sincronizacion.js`, que es
 * quien sabe hablar con la API.
 *
 * Solo la ven los administradores, y no por discreción sino porque son los
 * únicos que pueden hacer algo al respecto.
 */

import { abrirHoja, avisar, campo, cerrarHoja, el, entrada, seleccion, vaciar } from './ui.js';
import { listarSolicitudes, resolverSolicitud, sincronizar } from './sincronizacion.js';
import { TAMANO_FAMILIA } from './modelo.js';
import { formatearHace } from './semana.js';

/**
 * El botón de la pantalla de Gente. El recuento llega con la instantánea, de
 * modo que no hace falta preguntar por él: si no hay nadie esperando, aquí no
 * aparece nada. Solo al abrir la bandeja se pide la lista, que es donde están
 * el nombre y el correo.
 */
export function bloqueDeSolicitudes(ctx) {
  const cuantas = ctx.vista.datos.solicitudes_pendientes || 0;
  if (!cuantas) return null;

  return el('div', { class: 'grupo' }, [
    el('button', {
      class: 'boton crecer', type: 'button', onclick: () => abrirBandeja(ctx),
    }, [cuantas === 1 ? 'Hay 1 persona esperando' : `Hay ${cuantas} personas esperando`]),
  ]);
}

export async function abrirBandeja(ctx) {
  abrirHoja('Quién quiere entrar', (cuerpo) => {
    cuerpo.append(el('p', { class: 'pista', texto: 'Cargando…' }));

    listarSolicitudes()
      .then((solicitudes) => {
        vaciar(cuerpo);
        if (!solicitudes.length) {
          cuerpo.append(el('p', { class: 'pista', texto: 'Ya no queda nadie esperando.' }));
          return;
        }
        for (const solicitud of solicitudes) {
          cuerpo.append(tarjetaDeSolicitud(solicitud, ctx));
        }
      })
      .catch((error) => {
        vaciar(cuerpo).append(el('p', { class: 'pista', texto: error.message }));
      });
  });
}

function tarjetaDeSolicitud(solicitud, ctx) {
  const cuando = new Date(`${solicitud.creado_en.replace(' ', 'T')}Z`);

  return el('div', { class: 'tarjeta' }, [
    el('h3', { texto: solicitud.nombre_declarado || 'Sin nombre' }),
    // De dónde sale el nombre importa, porque es el dato sobre el que se decide
    // y no lo verifica nadie: lo da Apple en la primera autorización y quien
    // espera puede corregirlo. Puede faltar —Apple no lo entrega a partir de la
    // segunda vez— y entonces el correo es lo único que hay.
    el('p', {
      class: 'pista',
      texto: solicitud.nombre_declarado
        ? 'Lo da Apple al entrar, y quien lo pide puede corregirlo. No lo verifica nadie.'
        : 'Apple no ha dado el nombre esta vez. Escríbelo tú al darle acceso.',
    }),
    el('p', {
      texto: solicitud.correo
        ? solicitud.correo
        : 'Sin correo: no lo compartió al entrar con Apple.',
    }),
    solicitud.correo_privado
      ? el('p', {
          class: 'pista',
          texto: 'Es una dirección de reenvío de Apple, así que no dice de quién es.',
        })
      : null,
    // En palabras y no en cifras, como el resto de fechas de la aplicación:
    // «hace un rato» o «el martes» sitúan de un vistazo, y «4/8/2026» no.
    el('p', {
      class: 'pista',
      texto: `Lo pidió ${formatearHace(cuando)}. Caduca a los catorce días sin asomarse.`,
    }),
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: () => abrirAprobacion(solicitud, ctx),
      }, ['Darle acceso']),
      el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: async (evento) => {
          evento.currentTarget.disabled = true;
          await resolver({ id: solicitud.id, accion: 'rechazar' }, ctx, 'Solicitud rechazada');
        },
      }, ['Rechazar']),
    ]),
  ]);
}

/**
 * Aprobar tiene dos caminos, y el que se olvida es el primero.
 *
 * Si esa persona ya figuraba en el registro —Ana, que lleva ahí desde siempre—,
 * hay que vincularla a su ficha y no crear una segunda: así conserva su fecha de
 * nacimiento y todo lo que otros escribieron con ella.
 *
 * **A quién se puede vincular es cualquiera del registro, no solo Familia.**
 * Se probó a acotarlo a los cuatro de casa, para no perder a quien se busca
 * entre veinte sobrinos y primos que nunca van a entrar; pero eso mismo
 * escondía a quien sí hacía falta encontrar —alguien de Extendida o de Amigos
 * pidiendo acceso de verdad—, así que vuelve a ofrecerse el registro entero.
 *
 * Quien ya tiene cuenta sale igualmente, apagado y con el motivo escrito. Es la
 * diferencia entre «no está» y «está y no se puede», que desde una lista en la
 * que alguien falta no se distingue —y el Worker lo rechaza de todas formas—.
 */
function abrirAprobacion(solicitud, ctx) {
  // Solo los de casa tienen cuenta (H1 en specs/propuesta-ocho-cosas.html), y
  // se ofrecen tengan cuenta o no: aprobar sobre quien ya la tiene es volver a
  // vincularla —cambio de teléfono, copia restaurada, baja y vuelta—, que
  // antes no se podía hacer desde ningún sitio.
  const registro = ctx.vista.personasDe('familia')
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const hayHueco = registro.length < TAMANO_FAMILIA;

  const rotulo = solicitud.nombre_declarado
    ? `Dar acceso a ${solicitud.nombre_declarado}`
    : `Dar acceso a ${solicitud.correo || 'quien espera'}`;

  abrirHoja(rotulo, (cuerpo) => {
    const quien = seleccion(
      [
        { valor: '', texto: hayHueco ? 'Crear una ficha nueva en casa' : 'Crear una ficha nueva — no queda sitio en casa', desactivada: !hayHueco },
        ...registro.map((p) => ({
          valor: p.id,
          texto: p.tiene_cuenta ? `Es ${p.nombre}, que ya tiene cuenta` : `Es ${p.nombre}, que ya está`,
        })),
      ],
      hayHueco ? '' : (registro[0]?.id || ''),
    );
    const rol = seleccion(
      [{ valor: 'miembro', texto: 'Miembro' }, { valor: 'administrador', texto: 'Administrador' }],
      'miembro',
    );

    // Sin círculo que elegir: una cuenta es de casa, y la ficha nueva nace en
    // Familia. Si no queda sitio, lo que queda es vincular a uno de los cuatro.

    const nombre = entrada({ value: solicitud.nombre_declarado || '' });
    const apellidos = entrada();

    const nueva = el('div', {}, [
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
    ]);
    const aviso = el('p', { class: 'pista aviso-vinculo', hidden: true });

    const ajustar = () => {
      nueva.hidden = Boolean(quien.value);
      const elegida = registro.find((p) => p.id === quien.value);
      aviso.hidden = !elegida?.tiene_cuenta;
      if (elegida?.tiene_cuenta) {
        aviso.textContent = `${elegida.nombre} ya entra con otro Apple ID. Al dar acceso, esta solicitud pasa a ser su cuenta: su teléfono anterior deja de entrar y sus avisos se dan de baja hasta que los active en el nuevo.`;
      }
    };
    quien.addEventListener('change', ajustar);
    ajustar();

    cuerpo.append(
      campo('Quién es', quien, 'Los de casa, tengan cuenta o no: vincular a su ficha conserva su cumpleaños y su historial, y sobre quien ya tiene cuenta vuelve a engancharla.'),
      aviso,
      nueva,
      campo('Acceso', rol, 'Un administrador gestiona personas y categorías. Un miembro usa la agenda.'),
    );

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async (evento) => {
          if (!quien.value && !nombre.value.trim()) { avisar('Falta el nombre'); return; }
          evento.currentTarget.disabled = true;
          await resolver({
            id: solicitud.id,
            accion: 'aprobar',
            rol: rol.value,
            persona_id: quien.value || null,
            persona: quien.value
              ? null
              : { nombre: nombre.value.trim(), apellidos: apellidos.value.trim() },
            ...(quien.value ? {} : { circulo: 'familia' }),
          }, ctx, 'Acceso concedido');
        },
      }, ['Dar acceso']),
      el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

async function resolver(cuerpo, ctx, exito) {
  try {
    await resolverSolicitud(cuerpo);
    cerrarHoja();
    avisar(exito);
    // La instantánea trae el recuento y, si se ha aprobado, la persona nueva.
    await sincronizar();
    ctx.refrescar();
  } catch (error) {
    avisar(error.message || 'No se ha podido resolver la solicitud.');
  }
}
