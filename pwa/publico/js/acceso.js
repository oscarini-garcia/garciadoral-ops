/**
 * La puerta: la pantalla de acceso y la sala de espera.
 *
 * Es la mitad de cliente del portero (`api/src/portero/`): entrar con Apple,
 * mandar la solicitud sin preguntar nada, esperar, corregir el nombre, retirar.
 * No sabe nada de la agenda — ni instantánea, ni pestañas, ni modelo—: lo que
 * necesita de la aplicación se lo pasa `iniciarAcceso` como enganches, y otra
 * aplicación con el mismo patrón lo reutiliza escribiendo los suyos.
 *
 * Enganches de `iniciarAcceso`:
 *   - `configuracion` — la de `cargarConfiguracion` (`sesion.js`).
 *   - `alEntrar(respuesta)` — hay sesión plena: arranca la aplicación.
 *   - `verDemo()` — el botón de demostración, si la aplicación tiene una.
 *   - `pie()` — un nodo para el pie de la sala de espera (aquí, la versión).
 *   - `marca` — el rótulo del `eyebrow`.
 *
 * El marcado que espera son las tres secciones de `index.html`: `#acceso` con
 * `#botonApple`, `#botonDemo` y `#accesoAviso`; `#espera` con `#esperaMarco`;
 * y `#aplicacion`, que aquí solo se oculta.
 *
 * Cierra `specs/autenticacion.md` §5 y §8: la solicitud sale sola con lo que
 * Apple haya dado —sin nombre si no lo hay, que es lo normal a partir de la
 * segunda autorización— y ponerlo es una corrección voluntaria desde la sala de
 * espera, nunca un formulario. Un formulario aquí es la directriz 4.
 */

import { abrirHoja, avisar, campo, cerrarHoja, el, entrada, vaciar } from './ui.js';
import { borrarSesion, guardarSesion, olvidarTodo } from './almacen.js';
import {
  codigoDeAutorizacion,
  consultarSolicitud,
  entrarConApple,
  pedirEntrar,
  retirarSolicitud,
} from './sesion.js';

let enganches = {
  configuracion: {},
  alEntrar: async () => {},
  verDemo: null,
  pie: () => null,
  marca: 'Agenda Familiar',
};

export function iniciarAcceso(opciones) {
  enganches = { ...enganches, ...opciones };
}

const TEXTO_ESPERA = {
  pendiente: {
    titulo: 'Tu solicitud está hecha.',
    cuerpo: 'La revisa una persona, así que no hay un plazo. Cuando te aprueben, entra otra vez con Apple y ya estarás dentro.',
  },
  rechazada: {
    titulo: 'De momento, no.',
    cuerpo: 'Esta cuenta no tiene acceso a la agenda. Si crees que es un error, habla con quien te pasó la aplicación.',
  },
};

export function mostrarAcceso(mensaje = null) {
  document.getElementById('aplicacion').hidden = true;
  document.getElementById('espera').hidden = true;
  const acceso = document.getElementById('acceso');
  acceso.hidden = false;

  const aviso = document.getElementById('accesoAviso');
  aviso.hidden = !mensaje;
  if (mensaje) aviso.textContent = mensaje;

  const boton = document.getElementById('botonApple');
  boton.disabled = false;
  boton.onclick = async () => {
    // Mientras la hoja de Apple y la API contestan, el botón no admite otro
    // toque: dos seguidos lanzaban dos autorizaciones a la vez.
    boton.disabled = true;
    try {
      const respuesta = await entrarConApple(enganches.configuracion);

      // Sin cuenta no hay error que mostrar: es el estado normal de quien acaba
      // de descargarse la aplicación, y lo que toca es la sala de espera.
      if (respuesta.estado !== 'activa') {
        acceso.hidden = true;
        guardarSesion({ espera: respuesta.token_espera });
        return pintarEspera(respuesta.token_espera, respuesta, respuesta.nombre_apple);
      }

      // Se descarta cualquier instantánea anterior: el almacén local pertenece
      // a un titular concreto y no debe sobrevivir a un cambio de persona.
      await olvidarTodo();
      guardarSesion({ token: respuesta.token, persona: respuesta.persona });
      acceso.hidden = true;
      await enganches.alEntrar(respuesta);
    } catch (error) {
      mostrarAcceso(error.message);
    } finally {
      boton.disabled = false;
    }
    return null;
  };

  const demo = document.getElementById('botonDemo');
  demo.hidden = !enganches.verDemo;
  if (enganches.verDemo) demo.onclick = () => enganches.verDemo();
}

/**
 * Vuelve a la sala de espera al abrir la aplicación, y de paso pregunta.
 *
 * Si la aprobación llegó mientras tanto, la API lo dice y aquí solo queda
 * mandar a esa persona por la puerta de siempre: entrar con Apple otra vez,
 * ahora ya con cuenta. Si la credencial ha caducado —dura siete días— se vuelve
 * a la pantalla de acceso sin drama.
 */
export async function volverALaEspera(token) {
  try {
    const situacion = await consultarSolicitud(enganches.configuracion, token);
    if (situacion.estado === 'activa') {
      borrarSesion();
      return mostrarAcceso('Ya tienes acceso. Vuelve a entrar con Apple.');
    }
    return pintarEspera(token, situacion);
  } catch {
    borrarSesion();
    return mostrarAcceso();
  }
}

function pintarEspera(token, situacion, nombreDeApple = null) {
  document.getElementById('aplicacion').hidden = true;
  document.getElementById('acceso').hidden = true;
  document.getElementById('espera').hidden = false;

  const marco = vaciar(document.getElementById('esperaMarco'));

  if (situacion.estado === 'sin_solicitud') {
    // Nunca se pregunta nada aquí, haya dado Apple el nombre o no. Pedir después
    // de Sign in with Apple un dato que el marco de Apple ya entrega es lo que
    // rechaza la directriz 4 de la App Store, y el nombre solo llega en la
    // primerísima autorización: un formulario «solo para cuando falte» acaba
    // siendo el formulario de todo el mundo a partir de la segunda vez.
    return pedirAccesoSinPreguntar(marco, token, situacion, nombreDeApple);
  }

  const texto = TEXTO_ESPERA[situacion.estado] || TEXTO_ESPERA.pendiente;
  marco.append(
    el('p', { class: 'eyebrow', texto: enganches.marca }),
    el('h1', { texto: texto.titulo }),
    el('p', { class: 'acceso-texto', texto: texto.cuerpo }),
  );

  if (situacion.estado === 'pendiente') {
    marco.append(lineaDelNombre(token, situacion));

    marco.append(el('button', {
      class: 'boton crecer', type: 'button',
      onclick: async (evento) => {
        const boton = evento.currentTarget;
        boton.disabled = true;
        boton.textContent = 'Comprobando…';
        await volverALaEspera(token);
      },
    }, ['Comprobar si ya está']));
  }

  // Un rechazo es un «ahora no», no una lista negra: quien insiste es que ha
  // hablado con quien decide, y el servidor devuelve la solicitud a pendiente.
  // Sin este botón, el único camino de vuelta era retirar la solicitud y pasar
  // otra vez por la hoja de Apple, que es un rodeo que nadie va a adivinar.
  if (situacion.estado === 'rechazada') {
    marco.append(el('button', {
      class: 'boton crecer', type: 'button',
      onclick: async (evento) => {
        const boton = evento.currentTarget;
        boton.disabled = true;
        boton.textContent = 'Enviando…';
        try {
          const resultado = await pedirEntrar(enganches.configuracion, token);
          pintarEspera(token, resultado);
          avisar('Solicitud enviada otra vez');
        } catch (error) {
          boton.disabled = false;
          boton.textContent = 'Volver a pedirlo';
          avisar(error.message || 'No se ha podido enviar.');
        }
      },
    }, ['Volver a pedirlo']));
  }

  // Retirar tiene que estar aquí, y no es una comodidad: desde que se guarda el
  // correo de alguien, la directriz 5.1.1(v) de la App Store exige que pueda
  // borrarlo desde dentro de la aplicación, tenga cuenta o no.
  marco.append(el('button', {
    class: 'enlace-discreto', type: 'button',
    onclick: () => confirmarRetirada(token),
  }, ['Retirar mi solicitud']));

  if (enganches.verDemo) {
    marco.append(el('button', {
      class: 'enlace-discreto', type: 'button', onclick: () => enganches.verDemo(),
    }, ['Ver una demostración mientras tanto']));
  }

  // Quien espera no tiene barra de pestañas ni Ajustes: sin esto no habría
  // manera de traerse una versión nueva desde aquí, que es justo donde puede
  // hacer falta si lo que falla es el acceso.
  const pie = enganches.pie();
  if (pie) marco.append(pie);
  return null;
}

/**
 * Con qué nombre se está esperando, y cómo cambiarlo.
 *
 * Existe porque el nombre ya no lo teclea nadie: lo pone Apple y la solicitud
 * sale sin que quien la manda lo haya visto. Puede llegar a medias, o ser el de
 * la cuenta y no por el que le conocen en casa, y quien decide solo ve eso.
 *
 * **Y puede no llegar**, que es lo normal a partir de la segunda autorización.
 * Entonces esta línea es lo único que hay para ponerlo, y sigue siendo
 * voluntaria: la solicitud ya está hecha y sin nombre se aprueba igual, con el
 * correo. Un campo obligatorio en este punto es lo que rechazó la directriz 4.
 *
 * Corregirlo es volver a mandar la solicitud: el servidor actualiza la que ya
 * existe en lugar de crear otra, así que no hace falta nada más.
 */
function lineaDelNombre(token, situacion) {
  const linea = el('p', { class: 'pista' });

  const mostrar = () => {
    vaciar(linea).append(
      situacion.nombre
        ? `La has pedido como ${situacion.nombre}. `
        : 'La has pedido con tu correo y sin nombre. ',
      el('button', { class: 'enlace-en-linea', type: 'button', onclick: editar }, [
        situacion.nombre ? 'Cambiar' : 'Poner mi nombre',
      ]),
    );
  };

  function editar() {
    const nombre = entrada({ value: situacion.nombre || '', placeholder: 'María', autocomplete: 'name' });
    const guardarlo = el('button', {
      class: 'boton', type: 'button',
      onclick: async () => {
        const limpio = nombre.value.trim();
        if (!limpio) { avisar('Falta tu nombre'); return; }
        guardarlo.disabled = true;
        guardarlo.textContent = 'Guardando…';
        try {
          const resultado = await pedirEntrar(enganches.configuracion, token, limpio);
          situacion.nombre = resultado.nombre || limpio;
          mostrar();
          avisar('Nombre corregido');
        } catch (error) {
          guardarlo.disabled = false;
          guardarlo.textContent = 'Guardar';
          avisar(error.message || 'No se ha podido cambiar.');
        }
      },
    }, ['Guardar']);

    vaciar(linea).append(campo('Tu nombre', nombre), guardarlo);
    nombre.focus();
  }

  mostrar();
  return linea;
}

/**
 * Manda la solicitud sin preguntar nada, con el nombre que Apple haya dado o
 * sin ninguno.
 *
 * Es el único camino: entrar con Apple **es** pedir entrar. Lo que Apple
 * entrega —el `sub`, el correo y, la primerísima vez, el nombre— ya identifica
 * a quien llama, y volver a pedirlo en una pantalla es lo que rechaza la
 * directriz 4. Sin nombre la solicitud sale igual y quien decide ve el correo;
 * ponerlo después es un enlace en la pantalla de espera, no un peaje.
 *
 * Si algo falla, un botón para volver a intentarlo. Antes se caía al
 * formulario, que era pedir un dato a cambio de un fallo de red.
 */
async function pedirAccesoSinPreguntar(marco, token, situacion, nombre) {
  marco.append(
    el('p', { class: 'eyebrow', texto: enganches.marca }),
    el('h1', { texto: nombre ? `Un momento, ${nombre.split(' ')[0]}.` : 'Un momento.' }),
    el('p', { class: 'acceso-texto', texto: 'Estamos enviando tu solicitud.' }),
  );

  try {
    const resultado = await pedirEntrar(enganches.configuracion, token, nombre);
    pintarEspera(token, resultado);
  } catch (error) {
    pintarNoSePudo(vaciar(marco), token, situacion, nombre, error);
  }
}

/**
 * No se pudo mandar la solicitud. Un botón para reintentar y una salida.
 *
 * Lo que no lleva es ningún campo: el fallo es del envío, no de lo que se sabe
 * de quien está delante, y no hay nada que esta persona pueda teclear que lo
 * arregle.
 */
function pintarNoSePudo(marco, token, situacion, nombre, error) {
  marco.append(
    el('p', { class: 'eyebrow', texto: enganches.marca }),
    el('h1', { texto: 'No se ha podido enviar.' }),
    el('p', {
      class: 'acceso-texto',
      texto: error?.message || 'No hemos conseguido mandar tu solicitud. Puede ser la red.',
    }),
  );

  if (situacion.correo) {
    marco.append(el('p', {
      class: 'pista',
      texto: situacion.correo_privado
        ? `Se enviará con ${situacion.correo}, la dirección de reenvío que te ha dado Apple.`
        : `Se enviará con ${situacion.correo}.`,
    }));
  }

  marco.append(el('button', {
    class: 'boton crecer', type: 'button',
    onclick: async (evento) => {
      const boton = evento.currentTarget;
      boton.disabled = true;
      boton.textContent = 'Enviando…';
      await pedirAccesoSinPreguntar(vaciar(marco), token, situacion, nombre);
    },
  }, ['Volver a intentarlo']));

  marco.append(el('button', {
    class: 'enlace-discreto', type: 'button', onclick: () => salirDeLaEspera(),
  }, ['Ahora no']));

  if (enganches.verDemo) {
    marco.append(el('button', {
      class: 'enlace-discreto', type: 'button', onclick: () => enganches.verDemo(),
    }, ['Ver una demostración mientras tanto']));
  }
}

function confirmarRetirada(token) {
  abrirHoja('Retirar mi solicitud', (cuerpo) => {
    cuerpo.append(el('p', {
      texto: 'Se borra todo lo que hemos guardado de ti: tu nombre, tu correo y el vínculo con tu Apple ID. No queda constancia de que lo hayas pedido. Se avisa además a Apple para que deje de reconocer esta aplicación entre las tuyas.',
    }));
    cuerpo.append(el('p', {
      class: 'pista',
      texto: 'Puedes volver a solicitarlo cuando quieras, entrando otra vez con Apple.',
    }));
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: async (evento) => {
          const boton = evento.currentTarget;
          boton.disabled = true;
          boton.textContent = 'Retirando…';
          try {
            // Vuelve a pasar por Apple para traer un código de autorización, que
            // es con lo que el Worker le pide a Apple que revoque el vínculo. Si
            // no se consigue —hoja cancelada, cáscara antigua—, la retirada
            // sigue: nadie puede quedarse sin poder retirarse.
            const codigo = await codigoDeAutorizacion(enganches.configuracion);
            await retirarSolicitud(enganches.configuracion, token, codigo);
          } catch {
            /* si ya no estaba, el resultado para quien mira es el mismo */
          }
          cerrarHoja();
          await salirDeLaEspera();
          avisar('Solicitud retirada');
        },
      }, ['Retirar']),
      el('button', { class: 'boton crecer', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
    ]));
  });
}

async function salirDeLaEspera() {
  borrarSesion();
  document.getElementById('espera').hidden = true;
  mostrarAcceso();
}
