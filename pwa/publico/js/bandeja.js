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
import { CIRCULOS, TAMANO_FAMILIA } from './modelo.js';
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
 * Si esa persona ya figuraba en el registro sin cuenta —la abuela, que cumple
 * años y recibe regalos—, hay que vincularla a su ficha y no crear una segunda:
 * así conserva su fecha de nacimiento y todo lo que otros escribieron con ella.
 */
function abrirAprobacion(solicitud, ctx) {
  const candidatas = ctx.vista.personasSinCuenta();

  const rotulo = solicitud.nombre_declarado
    ? `Dar acceso a ${solicitud.nombre_declarado}`
    : `Dar acceso a ${solicitud.correo || 'quien espera'}`;

  abrirHoja(rotulo, (cuerpo) => {
    const quien = seleccion(
      [
        { valor: '', texto: 'Crear una ficha nueva' },
        ...candidatas.map((p) => ({ valor: p.id, texto: `Es ${p.nombre}, que ya está` })),
      ],
      '',
    );
    const rol = seleccion(
      [{ valor: 'miembro', texto: 'Miembro' }, { valor: 'administrador', texto: 'Administrador' }],
      'miembro',
    );

    // El círculo se decide aquí porque en ningún otro sitio se va a decidir: el
    // valor por defecto de la columna es «extendida», y con él una persona
    // aprobada quedaba fuera de Lío y de Sitios sin que nada lo dijera. Familia
    // solo se ofrece si queda sitio, como en la ficha (specs/ux.md §7.1).
    const hayHueco = ctx.vista.personasDe('familia').length < TAMANO_FAMILIA;
    const circulo = seleccion(
      [
        hayHueco ? { valor: 'familia', texto: CIRCULOS.familia } : null,
        { valor: 'extendida', texto: CIRCULOS.extendida },
        { valor: 'amigos', texto: CIRCULOS.amigos },
      ].filter(Boolean),
      hayHueco ? 'familia' : 'extendida',
    );

    const nombre = entrada({ value: solicitud.nombre_declarado || '' });
    const apellidos = entrada();

    const nueva = el('div', {}, [
      campo('Nombre', nombre),
      campo('Apellidos', apellidos),
      campo('Círculo', circulo, 'Quien ya estaba conserva el suyo; esto es solo para la ficha nueva.'),
    ]);

    const ajustar = () => { nueva.hidden = Boolean(quien.value); };
    quien.addEventListener('change', ajustar);
    ajustar();

    cuerpo.append(
      campo('Quién es', quien, 'Si ya estaba en la familia sin cuenta, vincúlala a su ficha: así conserva su cumpleaños y su historial.'),
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
            ...(quien.value ? {} : { circulo: circulo.value }),
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
