/**
 * Arranque y navegación.
 *
 * La arquitectura es la opción D de `specs/ux.md` con la síntesis que su §11
 * dejaba apuntada: **Hoy abre la aplicación** y la semana queda justo detrás,
 * en la pestaña siguiente, con su marco fijo intacto. La coordinación de
 * regalos vive en su propia pestaña —se visita con intención, no de paso— y la
 * ficha de persona de la opción C hace de pantalla de detalle dentro de Gente.
 *
 * El botón de crear pertenece a la pantalla y no a la aplicación: su acción
 * depende de dónde esté quien lo pulsa. Un botón genérico obligaría a elegir el
 * tipo antes de escribir, que es justo la fricción que la captura rápida trata
 * de evitar.
 */

import {
  el, vaciar, abrirHoja, cerrarHoja, acordeon, avisar, botonIcono, campo, entrada, seleccion,
} from './ui.js';
import { borrarSesion, guardarSesion, leerSesion, olvidarTodo } from './almacen.js';
import { crearVista } from './modelo.js';
import {
  detener, estado, guardarAjustesDeIa, iniciar, instantanea, leerAjustesDeIa,
  probarRedaccion, sincronizar, suscribir,
} from './sincronizacion.js';
import {
  cargarConfiguracion,
  codigoDeAutorizacion,
  consultarSolicitud,
  eliminarLaCuenta,
  entrarConApple,
  pedirEntrar,
  retirarSolicitud,
} from './sesion.js';
import { cargarRegistroDemo, componerDemo } from './demo.js';
import {
  HORIZONTE_RECORDATORIOS_DIAS,
  comprobarActualizacion,
  esNativo,
  iniciarNativo,
  programarRecordatorios,
  toque,
  versionInstalada,
} from './native.js';
import { NOMBRES_DIA, hoy, instanciasEn, iso, sumarDias } from './semana.js';
import {
  TURNOS, cuadroDe, genteDeCasa, guardarCuadro, hayLio, inicialesDe, inicioDeVentana,
  nombreDeTurno, rotuloDeTurno, turnosDe,
} from './lio.js';
import { pintarHoy, reiniciarHoy, tituloDeHoy } from './vistas/hoy.js';
import { abrirFormularioEvento, pintarAgenda, reiniciarAgenda, tituloDeAgenda } from './vistas/semana.js';
import { nuevoDesdeRegalos, pintarRegalos, reiniciarRegalos } from './vistas/regalos.js';
import { pintarFamilia, reiniciarFamilia } from './vistas/familia.js';
import { pintarBuscar, reiniciarBusqueda } from './vistas/buscar.js';

const PESTANAS = {
  // Hoy tampoco repite su nombre arriba: allí va el saludo, que es lo que esta
  // pantalla tiene que decir y no cabe en ningún otro sitio. Va sin botón
  // flotante porque no es una pantalla en la que se cree nada: se abre, se mira
  // y se entra a lo que haya.
  hoy: { titulo: tituloDeHoy, pintar: pintarHoy, fab: null },
  // La agenda no repite su nombre en la cabecera: la vista en la que se está ya
  // se lee en el conmutador, y el sitio lo ocupa mejor el periodo, que es lo
  // único de esa pantalla que cambia. Por eso su título es una función: cambia
  // al pasar de semana, y con las demás pestañas no cambia nunca.
  semana: { titulo: tituloDeAgenda, pintar: pintarAgenda, fab: (ctx) => abrirFormularioEvento(ctx) },
  regalos: { titulo: 'Regalos', pintar: pintarRegalos, fab: (ctx) => nuevoDesdeRegalos(ctx) },
  // La pestaña se llama Gente en la barra; la clave conserva el nombre del
  // módulo que la pinta, que es de donde sale. Y va sin botón flotante: la
  // pantalla lleva un «+» dentro de cada círculo, y uno encima que hiciera otra
  // cosa —apuntar una idea— dejaría dos signos iguales con dos significados a
  // la vez (specs/ux.md §7.1).
  familia: { titulo: 'Gente', pintar: pintarFamilia, fab: null },
  // En las pantallas sin acción de creación el botón no aparece.
  buscar: { titulo: 'Buscar', pintar: pintarBuscar, fab: null },
};

let pestana = 'hoy';
let configuracion = {};
let sesionActual = null;
const ctx = { vista: null, refrescar };

arrancar();

async function arrancar() {
  registrarServiceWorker();
  iniciarNativo();
  configuracion = await cargarConfiguracion();

  const sesion = leerSesion();
  if (sesion?.demostracion) return arrancarDemostracion(sesion.observador);
  if (sesion?.token) return arrancarAplicacion(sesion);
  // Quien dejó una solicitud vuelve a su sala de espera sin pasar otra vez por
  // Apple, y de paso se comprueba sola si ya le han aprobado.
  if (sesion?.espera) return volverALaEspera(sesion.espera);
  return mostrarAcceso();
}

/**
 * En el navegador, el service worker guarda el armazón para que la aplicación
 * abra sin red. Dentro de la cáscara de iOS **no se registra**: allí el armazón
 * ya viene empaquetado y quien decide cuándo cambia es el mecanismo de
 * actualización por OTA. Dos cachés compitiendo por lo mismo solo producen
 * pantallas viejas que nadie sabe por qué no se van.
 */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || esNativo()) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin caché, pero funcional */ });
  });
}

// ------------------------------------------------------------------ Acceso --

function mostrarAcceso(mensaje = null) {
  document.getElementById('aplicacion').hidden = true;
  document.getElementById('espera').hidden = true;
  const acceso = document.getElementById('acceso');
  acceso.hidden = false;

  const aviso = document.getElementById('accesoAviso');
  aviso.hidden = !mensaje;
  if (mensaje) aviso.textContent = mensaje;

  const boton = document.getElementById('botonApple');
  boton.onclick = async () => {
    try {
      const respuesta = await entrarConApple(configuracion);

      // Sin cuenta no hay error que mostrar: es el estado normal de quien acaba
      // de descargarse la aplicación, y lo que toca es la sala de espera.
      if (respuesta.estado !== 'activa') {
        acceso.hidden = true;
        guardarSesion({ espera: respuesta.token_espera });
        return pintarEspera(respuesta.token_espera, respuesta);
      }

      // Se descarta cualquier instantánea anterior: el almacén local pertenece
      // a un titular concreto y no debe sobrevivir a un cambio de persona.
      await olvidarTodo();
      guardarSesion({ token: respuesta.token, persona: respuesta.persona });
      acceso.hidden = true;
      await arrancarAplicacion(respuesta);
    } catch (error) {
      mostrarAcceso(error.message);
    }
  };
  boton.onkeydown = (evento) => { if (evento.key === 'Enter' || evento.key === ' ') boton.click(); };

  document.getElementById('botonDemo').onclick = () => elegirObservadorDemo();
}

// ---------------------------------------------------------- Sala de espera --

/**
 * Vuelve a la sala de espera al abrir la aplicación, y de paso pregunta.
 *
 * Si la aprobación llegó mientras tanto, la API lo dice y aquí solo queda
 * mandar a esa persona por la puerta de siempre: entrar con Apple otra vez,
 * ahora ya con cuenta. Si la credencial ha caducado —dura siete días— se vuelve
 * a la pantalla de acceso sin drama.
 */
async function volverALaEspera(token) {
  try {
    const situacion = await consultarSolicitud(configuracion, token);
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

function pintarEspera(token, situacion) {
  document.getElementById('aplicacion').hidden = true;
  document.getElementById('acceso').hidden = true;
  document.getElementById('espera').hidden = false;

  const marco = vaciar(document.getElementById('esperaMarco'));

  if (situacion.estado === 'sin_solicitud') return pintarFormulario(marco, token, situacion);

  const texto = TEXTO_ESPERA[situacion.estado] || TEXTO_ESPERA.pendiente;
  marco.append(
    el('p', { class: 'eyebrow', texto: 'Agenda Familiar' }),
    el('h1', { texto: texto.titulo }),
    el('p', { class: 'acceso-texto', texto: texto.cuerpo }),
  );

  if (situacion.estado === 'pendiente') {
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

  // Retirar tiene que estar aquí, y no es una comodidad: desde que se guarda el
  // correo de alguien, la directriz 5.1.1(v) de la App Store exige que pueda
  // borrarlo desde dentro de la aplicación, tenga cuenta o no.
  marco.append(el('button', {
    class: 'enlace-discreto', type: 'button',
    onclick: () => confirmarRetirada(token),
  }, ['Retirar mi solicitud']));

  marco.append(el('button', {
    class: 'enlace-discreto', type: 'button', onclick: () => elegirObservadorDemo(),
  }, ['Ver una demostración mientras tanto']));
}

/**
 * El formulario de la sala de espera: un campo, el nombre.
 *
 * Se pide a mano porque Apple no lo da de forma fiable —solo llega en la
 * primerísima autorización y nunca en el token—, y porque es lo único que
 * identifica a quien pide entrar cuando ha elegido ocultar su correo.
 */
function pintarFormulario(marco, token, situacion) {
  const nombre = entrada({ placeholder: 'Marta Ruiz', autocomplete: 'name' });

  marco.append(
    el('p', { class: 'eyebrow', texto: 'Agenda Familiar' }),
    el('h1', { texto: 'Casi está.' }),
    el('p', {
      class: 'acceso-texto',
      texto: 'Dinos quién eres y le llegará a quien puede darte acceso.',
    }),
    campo('Tu nombre', nombre),
  );

  if (situacion.correo) {
    marco.append(el('p', {
      class: 'pista',
      texto: situacion.correo_privado
        ? `Se enviará con ${situacion.correo}, la dirección de reenvío que te ha dado Apple.`
        : `Se enviará con ${situacion.correo}.`,
    }));
  }

  const enviar = el('button', {
    class: 'boton crecer', type: 'button',
    onclick: async () => {
      if (!nombre.value.trim()) { avisar('Falta tu nombre'); return; }
      enviar.disabled = true;
      enviar.textContent = 'Enviando…';
      try {
        const resultado = await pedirEntrar(configuracion, token, nombre.value.trim());
        pintarEspera(token, resultado);
      } catch (error) {
        enviar.disabled = false;
        enviar.textContent = 'Pedir acceso';
        avisar(error.message || 'No se ha podido enviar la solicitud.');
      }
    },
  }, ['Pedir acceso']);

  marco.append(enviar);
  marco.append(el('button', {
    class: 'enlace-discreto', type: 'button', onclick: () => salirDeLaEspera(),
  }, ['Ahora no']));
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
      el('button', { class: 'boton crecer', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
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
            const codigo = await codigoDeAutorizacion(configuracion);
            await retirarSolicitud(configuracion, token, codigo);
          } catch {
            /* si ya no estaba, el resultado para quien mira es el mismo */
          }
          cerrarHoja();
          await salirDeLaEspera();
          avisar('Solicitud retirada');
        },
      }, ['Retirar']),
    ]));
  });
}

async function salirDeLaEspera() {
  borrarSesion();
  document.getElementById('espera').hidden = true;
  mostrarAcceso();
}

async function elegirObservadorDemo() {
  let registro;
  try {
    registro = await cargarRegistroDemo();
  } catch (error) {
    mostrarAcceso(error.message);
    return;
  }

  const conCuenta = registro.personas.filter((p) => p.tiene_cuenta);
  abrirHoja('Ver la demostración como…', (cuerpo) => {
    cuerpo.append(el('p', {
      class: 'pista',
      texto: 'La misma semana se ve distinta según quién mire. Prueba a entrar como madre y como hija: el viernes cambia.',
    }));
    for (const persona of conCuenta) {
      cuerpo.append(el('button', {
        class: 'tarjeta', type: 'button',
        onclick: async () => {
          cerrarHoja();
          // La demostración sustituye a la sesión que hubiera, incluida la de
          // espera: se sale de ella y se vuelve entrando otra vez con Apple.
          guardarSesion({ demostracion: true, observador: persona.id });
          document.getElementById('acceso').hidden = true;
          document.getElementById('espera').hidden = true;
          await arrancarDemostracion(persona.id);
        },
      }, [
        el('h3', { texto: persona.nombre }),
        el('p', { texto: persona.rol === 'administrador' ? 'administradora: ve la coordinación' : 'miembro' }),
      ]));
    }
  });
}

// --------------------------------------------------------------- Arranque --

async function arrancarDemostracion(observadorId) {
  const registro = await cargarRegistroDemo();
  await iniciar({ demostracion: true, inicial: componerDemo(registro, observadorId) });
  prepararInterfaz();
}

async function arrancarAplicacion(sesion) {
  sesionActual = sesion;
  await iniciar({ base: configuracion.api || '', token: sesion.token });
  prepararInterfaz();
}

function prepararInterfaz() {
  document.getElementById('acceso').hidden = true;
  document.getElementById('aplicacion').hidden = false;

  for (const boton of document.querySelectorAll('.tab')) {
    // Quien vuelve a entrar después de cerrar sesión lo hace por Hoy, y la
    // barra tiene que estar de acuerdo con eso: el marcado la deja en Hoy, pero
    // en memoria podía haber quedado otra de la sesión anterior.
    if (boton.dataset.pestana === pestana) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');

    boton.onclick = () => {
      pestana = boton.dataset.pestana;
      for (const otro of document.querySelectorAll('.tab')) otro.removeAttribute('aria-current');
      boton.setAttribute('aria-current', 'page');
      document.getElementById('pantalla').scrollTo(0, 0);
      refrescar();
    };
  }

  document.getElementById('fab').onclick = () => {
    const accion = PESTANAS[pestana].fab;
    if (!accion) return;
    toque();
    accion(ctx);
  };

  document.getElementById('indicadorSync').onclick = abrirPanelDeSincronizacion;
  document.getElementById('botonAjustes').onclick = abrirAjustes;

  let ultimaInstantanea = null;
  let ultimosRechazos = null;

  suscribir((datos, situacion) => {
    if (situacion.estado === 'sesion-caducada') {
      borrarSesion();
      mostrarAcceso('La sesión ha caducado. Vuelve a entrar.');
      return;
    }
    pintarIndicador(situacion);

    // Lo que el servidor no ha aplicado se dice, y una sola vez por lote: se vio
    // guardado —la interfaz es optimista— y desaparece con esta instantánea. En
    // silencio no parece un error, parece que la aplicación pierde cosas.
    if (situacion.rechazados?.length && situacion.rechazados !== ultimosRechazos) {
      ultimosRechazos = situacion.rechazados;
      const cuantos = situacion.rechazados.length;
      avisar(cuantos === 1 ? 'Un cambio no se ha podido guardar' : `${cuantos} cambios no se han podido guardar`);
    }

    if (!datos) return;
    refrescar();

    // La instantánea se sustituye entera en cada sincronización correcta, de
    // modo que basta comparar la referencia para no reprogramar los avisos en
    // cada cambio de estado de la sincronización.
    if (datos !== ultimaInstantanea) {
      ultimaInstantanea = datos;
      refrescarRecordatorios(datos);
    }
  });

  refrescar();
}

/**
 * Reprograma los recordatorios previos con lo que hay en la instantánea.
 *
 * Se expande la recurrencia igual que para pintar la agenda, porque un
 * cumpleaños anual o una actividad semanal tienen que avisar en cada
 * aparición, no solo en la primera. Fuera de la cáscara no hace nada.
 */
function refrescarRecordatorios(datos) {
  if (!esNativo()) return;
  const desde = hoy();
  const instancias = instanciasEn(datos, desde, sumarDias(desde, HORIZONTE_RECORDATORIOS_DIAS));
  programarRecordatorios(instancias, turnosPropios(datos, desde));
}

/**
 * Los turnos de Lío que le tocan a quien mira en los próximos días, aplanados a
 * lo que el aviso necesita saber.
 *
 * El horizonte es más corto que el de la agenda —una semana— porque el cuadro
 * cambia y un aviso programado con un mes de antelación diría lo que decía el
 * reparto de hace un mes.
 */
function turnosPropios(datos, desde) {
  if (!hayLio(datos)) return [];
  const turnos = [];
  for (let dia = 0; dia < 7; dia += 1) {
    for (const turno of turnosDe(datos, sumarDias(desde, dia))) {
      turnos.push({
        mio: turno.mio,
        estado: turno.estado,
        trato: turno.trato,
        fechaIso: turno.fechaIso,
        turnoId: turno.turno.id,
        rotulo: rotuloDeTurno(turno.turno),
        inicio: inicioDeVentana(turno.fecha, turno.turno.id),
      });
    }
  }
  return turnos;
}

// -------------------------------------------------------------- Pintado --

function refrescar() {
  const datos = instantanea();
  if (!datos) return;

  ctx.vista = crearVista(datos);
  const definicion = PESTANAS[pestana];

  const titulo = document.getElementById('tituloPantalla');
  // Los títulos que son función reciben el contexto: el de Hoy saluda por el
  // nombre de quien mira, y el de la agenda no necesita nada y lo ignora.
  titulo.textContent = typeof definicion.titulo === 'function' ? definicion.titulo(ctx) : definicion.titulo;
  // El de la agenda es una fecha y no un nombre: se compone más largo y se
  // compone en cifras, así que se dibuja con su propio tamaño.
  titulo.dataset.pestana = pestana;
  document.getElementById('fab').hidden = !definicion.fab;

  // Cada pestaña parte de la pantalla desnuda y le añade las clases de
  // disposición que necesite, sin heredar las de la anterior.
  const pantalla = document.getElementById('pantalla');
  pantalla.className = 'pantalla';

  definicion.pintar(
    pantalla,
    document.getElementById('subcabecera'),
    ctx,
  );
  pintarIndicador(estado());
}

const TEXTO_SINCRONIZACION = {
  'al-dia': 'al día',
  sincronizando: 'sincronizando',
  'sin-conexion': 'sin conexión',
  error: 'sin sincronizar',
  demostracion: 'demostración',
};

/**
 * El punto de la sincronización. El estado va en su color y, escrito, en la
 * etiqueta: quien no ve el color lo oye igual, y quien lo ve no necesita leer
 * «al día» a todas horas para saber que todo va bien.
 */
function pintarIndicador(situacion) {
  const indicador = document.getElementById('indicadorSync');
  const texto = TEXTO_SINCRONIZACION[situacion.estado] || situacion.estado;
  indicador.dataset.estado = situacion.estado;
  indicador.setAttribute('aria-label', `Sincronización: ${texto}`);
  indicador.setAttribute('title', texto);
}

// -------------------------------------------- Panel de estado y ajustes --

function abrirPanelDeSincronizacion() {
  const situacion = estado();
  abrirHoja('Estado', (cuerpo) => {
    cuerpo.append(el('p', {
      texto: situacion.estado === 'demostracion'
        ? 'Estás viendo una demostración con datos inventados. Nada de lo que hagas sale de este navegador.'
        : `Sincronización: ${TEXTO_SINCRONIZACION[situacion.estado] || situacion.estado}.`,
    }));
    if (situacion.ultima) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: `Última actualización correcta: ${new Date(situacion.ultima).toLocaleString('es-ES')}.`,
      }));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      situacion.estado === 'demostracion' ? null : el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => { await sincronizar(); avisar('Sincronizado'); },
      }, ['Sincronizar ahora']),
      situacion.estado === 'demostracion' ? el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: () => salir(),
      }, ['Salir de la demostración']) : null,
    ]));
  });
}

/**
 * Ajustes: lo que es de esta instalación y de esta persona, no de la pantalla
 * en la que se esté.
 *
 * Vive en la cabecera y no en una pestaña porque no es un sitio al que se vaya
 * a hacer algo: se entra, se toca una cosa y se sale. Una quinta pestaña le
 * daría un peso que no tiene y le quitaría sitio a las cuatro que sí.
 */
function abrirAjustes() {
  const demostracion = estado().estado === 'demostracion';

  abrirHoja('Ajustes', (cuerpo) => {
    // Quién eres queda fuera de los apartados: es lo primero que uno comprueba
    // al entrar aquí, y no algo que se venga a cambiar.
    if (sesionActual?.persona?.nombre) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: `Sesión iniciada como ${sesionActual.persona.nombre}.`,
      }));
    }

    // Todos empiezan plegados. Ajustes es una lista de cosas que casi nunca se
    // tocan: enseñarlas todas abiertas obliga a leerlas enteras para encontrar
    // la única que se venía a buscar.
    cuerpo.append(acordeon('Aspecto', (dentro) => {
      const tema = seleccion(
        [{ valor: 'auto', texto: 'Como el sistema' }, { valor: 'claro', texto: 'Claro' }, { valor: 'oscuro', texto: 'Oscuro' }],
        localStorage.getItem('agenda.tema') || 'auto',
      );
      tema.addEventListener('change', () => aplicarTema(tema.value));
      dentro.append(campo('Tema', tema));
    }));

    // El cuadro de Lío es el reparto de la casa, no una preferencia de quien
    // mira: cambiarlo por sorpresa reordena la semana de otras tres personas, y
    // por eso lo edita quien administra. Un cambio de un día suelto no pasa por
    // aquí, sino por el turno mismo, que se le pide al otro y él acepta.
    if (ctx.vista?.esAdministrador() && !demostracion) {
      cuerpo.append(acordeon('🐾 Lío', cuadroDeLio));
    }

    if (ctx.vista?.esAdministrador() && !demostracion) {
      cuerpo.append(acordeon('Inteligencia artificial', bloqueDeRedaccion));
    }

    cuerpo.append(acordeon('La aplicación', (dentro) => {
      dentro.append(bloqueDeVersion());
      dentro.append(bloqueLegal());
    }));

    cuerpo.append(acordeon('Tu cuenta', (dentro) => {
      dentro.append(el('div', { class: 'acciones' }, [
        el('button', {
          class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
          onclick: () => salir(),
        }, [demostracion ? 'Salir de la demostración' : 'Cerrar sesión']),
      ]));

      // La baja no está en la demostración porque allí no hay cuenta que dar de
      // baja: nada de lo que se ve ha salido nunca de este navegador.
      if (!demostracion) {
        dentro.append(el('button', {
          class: 'enlace-discreto', type: 'button',
          onclick: () => confirmarBaja(),
        }, ['Eliminar mi cuenta']));
      }
    }));
  }, [
    // Salir de aquí se hacía tocando fuera de la hoja, que es la convención de
    // la plataforma pero no se ve. Con los apartados plegados la hoja es corta y
    // queda mucho fuera que tocar; aun así, quien la busque merece una salida
    // dibujada.
    botonIcono('cerrar', { etiqueta: 'Cerrar los ajustes', tono: 'discreto', onclick: cerrarHoja }),
  ]);
}

/**
 * Quién saca a Lío cada día, si nadie dice lo contrario.
 *
 * De aquí se derivan los turnos de cualquier día que se mire, y por eso
 * cambiarlo cambia el futuro y no el pasado: en cuanto alguien marca un turno o
 * acuerda un cambio, ese día queda escrito y deja de mirar al cuadro.
 *
 * **Una línea por día, con el nombre escrito entero.** Empezó siendo una rejilla
 * de catorce casillas, que es la figura de un cuadro de la nevera y ocupaba un
 * tercio del alto; se cambió porque pedía descifrar. Una casilla decía *cuándo*
 * por dónde estaba y *quién* por dos letras que se parecen entre sí, de modo que
 * lo único que separaba de verdad a una persona de otra era su color, y ese
 * color salía de una cuenta sobre el identificador: cuatro tintes cualesquiera
 * en una pantalla de papel con una sola tinta. Escribiendo «Marta» no hay nada
 * que descifrar y el color deja de tener trabajo. De paso, el blanco del dedo
 * pasa de 30 × 30 puntos a 135 × 34, medidos en la hoja de estilos de verdad.
 *
 * **El turno va pasando de una persona a la siguiente al tocarlo**, y no abre
 * una lista: la lista tendría que ser otra hoja encima de esta, que es la que ya
 * ocupa Ajustes. Se estudió en `specs/prototipo-cuadro-de-lio.html`.
 */
function cuadroDeLio(seccion) {
  const casa = genteDeCasa(ctx.vista);
  if (!casa.length) {
    seccion.append(el('p', { class: 'pista', texto: 'Todavía no hay nadie en el círculo de casa.' }));
    return;
  }

  const cuadro = cuadroDe(instantanea());
  // «Nadie» es una opción de verdad y va la primera: hay días que no toca nadie,
  // y sin ella habría que dejar puesto a alguien que no lo va a sacar.
  const vueltas = [null, ...casa.map((p) => p.id)];

  const dias = el('div', { class: 'lio-dias' });
  // Qué columna es cuál se dice una vez arriba, con su sol o su luna y con todas
  // sus letras, en lugar de un emoji repetido catorce veces dentro de las
  // casillas, donde había que traducirlo en cada línea y le quitaba sitio al
  // nombre.
  dias.append(el('div', { class: 'lio-dia lio-dia-cabecera' }, [
    el('span'),
    ...TURNOS.map((turno) => el('span', { texto: rotuloDeTurno(turno) })),
  ]));
  for (let dia = 0; dia < 7; dia += 1) {
    dias.append(el('div', { class: 'lio-dia' }, [
      // Tres letras y no la inicial: lunes y martes empiezan igual, y aquí no
      // hay una rejilla de siete columnas que sitúe cada día por su posición.
      el('span', { class: 'lio-dia-rotulo', texto: mayusculaInicial(NOMBRES_DIA[dia].slice(0, 3)) }),
      ...TURNOS.map((turno) => turnoDelCuadro(cuadro, turno, dia, casa, vueltas)),
    ]));
  }

  seccion.append(
    el('p', { class: 'pista', texto: 'Toca un turno para pasar a la siguiente persona.' }),
    dias,
    // La leyenda se queda aunque aquí ya no haga falta: en la semana no cabe un
    // nombre y cada uno sale con sus dos primeras letras, así que este es el
    // único sitio donde se puede aprender cuál es cuál.
    el('p', { class: 'pista', texto: `En la semana: ${casa.map((p) => `${inicialesDe(p)} ${p.nombre}`).join(' · ')}` }),
  );
}

const mayusculaInicial = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

function turnoDelCuadro(cuadro, turno, dia, casa, vueltas) {
  const boton = el('button', { class: 'lio-dia-turno', type: 'button' });
  const nombre = el('span', { class: 'lio-dia-nombre' });
  boton.append(nombre);

  const pintar = () => {
    const persona = casa.find((p) => p.id === cuadro[turno.id][dia]) || null;
    nombre.textContent = persona ? persona.nombre : 'Nadie';
    boton.dataset.vacio = persona ? 'no' : 'si';
    boton.setAttribute(
      'aria-label',
      `${NOMBRES_DIA[dia]} ${nombreDeTurno(turno).toLowerCase()}: ${persona ? persona.nombre : 'nadie'}. Cambiar.`,
    );
  };

  boton.onclick = async () => {
    toque();
    const actual = vueltas.indexOf(cuadro[turno.id][dia]);
    cuadro[turno.id][dia] = vueltas[(actual + 1) % vueltas.length];
    pintar();
    await guardarCuadro(cuadro);
  };

  pintar();
  return boton;
}

/**
 * La configuración de la inteligencia artificial: la clave, el modelo y las
 * instrucciones de lo que la agenda le pide.
 *
 * La clave y el modelo son de la instalación entera y no de una función: hoy la
 * única que los usa es contar un día o un tramo antes de compartirlo, pero lo
 * que venga después tirará de los mismos. Por eso el apartado se llama por la
 * herramienta y no por el uso, y las instrucciones van dentro, una por función.
 *
 * Solo para administradores, y solo de escritura: la clave se guarda en el
 * servidor y de vuelta llegan sus cuatro últimos caracteres, lo justo para
 * reconocer cuál está puesta sin poder copiarla de esta pantalla.
 *
 * El botón de probar existe porque un fallo aquí es invisible desde la agenda
 * —el día se comparte igual, tal cual— y sin verlo no hay manera de saber si es
 * la clave, el modelo o la instrucción.
 */
function bloqueDeRedaccion(seccion) {
  seccion.append(el('p', { class: 'pista', texto: 'Cargando…' }));

  leerAjustesDeIa()
    .then((ajustes) => vaciar(seccion).append(...formularioDeRedaccion(ajustes)))
    .catch((error) => {
      vaciar(seccion).append(
        el('p', { class: 'pista', texto: `No he podido leer los ajustes: ${error.message}` }),
      );
    });
}

function formularioDeRedaccion(ajustes) {
  const clave = entrada({
    type: 'password', autocomplete: 'off', spellcheck: 'false',
    placeholder: ajustes.hay_clave ? `Guardada, termina en ${ajustes.cola}` : 'sk-ant-…',
  });

  // Los modelos los da Anthropic para esa cuenta; si no contesta, la lista de
  // reserva. El configurado se preselecciona aunque ya no esté en la lista.
  const lista = ajustes.modelos.some((m) => m.id === ajustes.modelo)
    ? ajustes.modelos
    : [{ id: ajustes.modelo, nombre: ajustes.modelo }, ...ajustes.modelos];
  const modelo = seleccion(lista.map((m) => ({ valor: m.id, texto: m.nombre })), ajustes.modelo);

  const instruccion = el('textarea', { rows: '5', spellcheck: 'false' });
  instruccion.value = ajustes.instruccion;

  const regalo = el('textarea', { rows: '5', spellcheck: 'false' });
  regalo.value = ajustes.regalo;

  const felicitacion = el('textarea', { rows: '5', spellcheck: 'false' });
  felicitacion.value = ajustes.felicitacion;

  const traza = el('pre', { class: 'traza', hidden: true });
  const contar = (texto, clase = 'traza') => {
    traza.className = clase;
    traza.textContent = texto;
    traza.hidden = false;
  };

  const guardar = el('button', { class: 'boton crecer', type: 'button' }, ['Guardar']);
  const probar = el('button', { class: 'boton', type: 'button' }, ['Probar']);

  const conBotonesQuietos = async (activo, trabajo) => {
    const antes = activo.textContent;
    guardar.disabled = true;
    probar.disabled = true;
    activo.textContent = 'Un momento…';
    try {
      await trabajo();
    } finally {
      activo.textContent = antes;
      guardar.disabled = false;
      probar.disabled = false;
    }
  };

  guardar.onclick = () => conBotonesQuietos(guardar, async () => {
    try {
      // La clave solo se manda si se ha escrito una: el campo en blanco no borra
      // la que hay, que es lo que esperaría cualquiera al cambiar solo el modelo.
      const guardado = await guardarAjustesDeIa({
        clave: clave.value.trim() || undefined,
        modelo: modelo.value,
        instruccion: instruccion.value.trim(),
        regalo: regalo.value.trim(),
        felicitacion: felicitacion.value.trim(),
      });
      clave.value = '';
      clave.placeholder = guardado.hay_clave ? `Guardada, termina en ${guardado.cola}` : 'sk-ant-…';
      avisar('Guardado');
      refrescar();
    } catch (error) {
      contar(`No he podido guardar: ${error.message}`, 'traza mal');
    }
  });

  probar.onclick = () => conBotonesQuietos(probar, async () => {
    try {
      const resultado = await probarRedaccion(iso(hoy()));
      contar(resumenDeLaPrueba(resultado), resultado.texto ? 'traza bien' : 'traza mal');
    } catch (error) {
      contar(`No he podido probar: ${error.message}`, 'traza mal');
    }
  });

  return [
    el('p', {
      class: 'pista',
      texto: 'La clave y el modelo valen para todo lo que la agenda haga con un modelo. Debajo va el encargo de cada cosa, que se puede reescribir: hoy son tres, contar los días antes de compartirlos, proponer un regalo y felicitar un cumpleaños.',
    }),
    campo('Clave de Anthropic', clave, ajustes.guardada_en ? `Guardada el ${ajustes.guardada_en.slice(0, 10)}. Deja el campo vacío para no cambiarla.` : null),
    campo('Modelo', modelo, ajustes.modelos_de === 'reserva'
      ? 'Lista de reserva: Anthropic no ha respondido con los modelos de la cuenta.'
      : 'Si falla, se prueba con los demás por orden.'),

    el('h4', { class: 'subtitulo-ajuste', texto: 'Contar los días para compartirlos' }),
    campo('Instrucción', instruccion, 'Lo que se le pide al modelo. Los eventos se los da la agenda aparte; aquí va solo el encargo.'),

    el('h4', { class: 'subtitulo-ajuste', texto: 'Proponer un regalo' }),
    campo('Instrucción', regalo, 'Se pide una tanda de cinco, y la agenda espera una por línea: si reescribes esto, conserva esa forma. Lo que se sabe de la persona —su edad, lo que ha pedido, lo que ya tiene apuntado y lo que recibió— se lo da aparte. Vacío, vuelve el encargo de origen.'),

    el('h4', { class: 'subtitulo-ajuste', texto: 'Felicitar un cumpleaños' }),
    campo('Instrucción', felicitacion, 'También en tandas de cinco, una por línea, y es el único encargo con emojis: el texto se copia y se pega en un WhatsApp. Se le dan el nombre, los años que cumple y lo que hay apuntado de esa persona; los regalos no, porque quien lo lea es quien cumple. Vacío, vuelve el encargo de origen.'),

    el('div', { class: 'acciones' }, [guardar, probar]),
    el('p', {
      class: 'pista',
      texto: 'Guardar los guarda los tres. Probar usa el de contar el día, que es lo que comprueba que la clave y el modelo responden.',
    }),
    traza,
  ];
}

/** El resultado de probar, con un renglón por intento: modelo, código, tiempo y
 *  el mensaje de error tal como lo devuelve la API. */
function resumenDeLaPrueba(resultado) {
  const renglones = (resultado.intentos || []).map((intento) => {
    const partes = [intento.modelo, intento.estado ? `HTTP ${intento.estado}` : 'sin respuesta'];
    if (intento.ms !== null && intento.ms !== undefined) partes.push(`${intento.ms} ms`);
    if (intento.tipo) partes.push(intento.tipo);
    if (intento.mensaje) partes.push(intento.mensaje);
    return `· ${partes.join(' · ')}`;
  });

  // Lo que el servidor no ha sabido resolver va primero, porque no es un fallo
  // del modelo y no se descubre leyendo el texto: es un evento que el
  // dispositivo compone y que aquí no se reconoce, y el mensaje sale corto sin
  // que nadie lo note.
  if (resultado.omitidos?.length) {
    renglones.unshift(`⚠ sin resolver: ${resultado.omitidos.join(', ')}`, '');
  }

  if (resultado.texto) {
    return [`Ha contestado ${resultado.modelo}:`, '', resultado.texto, '', ...renglones].join('\n');
  }
  return [resultado.motivo || 'no ha salido', '', ...renglones].join('\n');
}

/**
 * Enlaces a la política de privacidad y al soporte.
 *
 * Van al dominio público y en pestaña nueva a propósito. Dentro de la cáscara,
 * navegar a otra página se llevaría por delante la aplicación —no hay barra de
 * direcciones ni botón de volver—, mientras que un enlace externo lo abre el
 * sistema en Safari y la agenda se queda donde estaba.
 */
function bloqueLegal() {
  const sitio = (configuracion.redireccion || window.location.origin).replace(/\/$/, '');
  const enlace = (ruta, texto) => el('a', {
    class: 'enlace-discreto', href: `${sitio}${ruta}`, target: '_blank', rel: 'noopener',
  }, [texto]);

  return el('p', { class: 'pista' }, [
    enlace('/privacidad', 'Privacidad'),
    ' · ',
    enlace('/soporte', 'Ayuda y contacto'),
  ]);
}

/**
 * Eliminar la cuenta: qué se va, qué se queda y una confirmación.
 *
 * Tiene que poder hacerse desde aquí y sin escribir a nadie —es la directriz
 * 5.1.1(v) de la App Store—, pero también tiene que contar la verdad. En un
 * registro compartido, «mi cuenta» y «yo» no son lo mismo: se va el acceso, y
 * quien se queda es la persona, con su cumpleaños y sus regalos, porque eso lo
 * escribió el hogar y no es de uno solo.
 */
function confirmarBaja() {
  const persona = sesionActual?.persona;

  abrirHoja('Eliminar mi cuenta', (cuerpo) => {
    cuerpo.append(el('p', {
      texto: 'Se elimina tu acceso a la agenda: el vínculo con tu Apple ID, tus dispositivos, tus avisos y los permisos que tengas concedidos. Se avisa además a Apple para que deje de reconocer esta aplicación entre las tuyas.',
    }));
    cuerpo.append(el('p', {
      class: 'pista',
      texto: `Seguirás en la familia como ${persona?.nombre || 'miembro'} sin cuenta: tu cumpleaños, los regalos y lo que otras personas hayan escrito contigo se quedan, porque son del hogar y no solo tuyos. Para volver a entrar, alguien con permisos de administración tendrá que vincularte de nuevo.`,
    }));

    if (persona?.rol === 'administrador') {
      cuerpo.append(el('p', {
        class: 'pista', 'data-tono': 'aviso',
        texto: 'Tienes permisos de administración. Si eres la única persona que los tiene, después de esto no quedará nadie que pueda vincular cuentas desde la aplicación.',
      }));
    }

    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button', onclick: () => cerrarHoja(),
      }, ['Cancelar']),
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: (evento) => ejecutarBaja(evento.currentTarget),
      }, ['Eliminar mi cuenta']),
    ]));
  });
}

async function ejecutarBaja(boton) {
  boton.disabled = true;
  boton.textContent = 'Eliminando…';

  try {
    // El código de autorización es lo único con lo que el Worker puede pedirle
    // a Apple que revoque el vínculo. Si no se consigue —hoja cancelada, cáscara
    // antigua sin el complemento—, la baja sigue: lo que no puede pasar es que
    // alguien se quede sin poder darse de baja.
    const codigo = await codigoDeAutorizacion(configuracion);
    await eliminarLaCuenta(configuracion, sesionActual.token, codigo);
    await salir();
    avisar('Cuenta eliminada');
  } catch (error) {
    boton.disabled = false;
    boton.textContent = 'Eliminar mi cuenta';
    avisar(error.message || 'No se ha podido eliminar la cuenta.');
  }
}

/**
 * Cierra la sesión y devuelve a la pantalla de acceso.
 *
 * Se borra todo lo local, y no solo la credencial: la instantánea pertenece a
 * un titular concreto y no debe sobrevivir a un cambio de persona. `detener`
 * deja además el motor sin oyentes ni suscriptores, que es lo que permite
 * volver a la pantalla de acceso sin recargar la página.
 */
async function salir() {
  cerrarHoja();
  detener();
  await olvidarTodo();
  borrarSesion();
  sesionActual = null;
  pestana = 'hoy';
  reiniciarHoy(); reiniciarAgenda(); reiniciarRegalos(); reiniciarBusqueda(); reiniciarFamilia();
  document.getElementById('aplicacion').hidden = true;
  mostrarAcceso();
}

/**
 * Versión instalada y comprobación manual, solo dentro de la cáscara.
 *
 * La comprobación automática ya ocurre al arrancar; este botón existe para
 * poder forzarla cuando alguien pregunta si tiene lo último. La actualización
 * se aplica al volver a abrir la aplicación, nunca a media sesión.
 */
function bloqueDeVersion() {
  const linea = el('p', { class: 'pista' });
  const progreso = el('ul', { class: 'progreso' });

  const ponerVersion = () => {
    linea.textContent = 'Comprobando la versión…';
    versionInstalada().then((version) => {
      linea.textContent = version
        ? `Versión instalada: ${version}.`
        : 'Versión instalada: la de origen.';
    });
  };

  // En el navegador no hay bundle que actualizar: la versión es la que sirva
  // Pages en cada recarga, y ofrecer un botón que solo puede responder «aquí no
  // hay nada que actualizar» sería ruido.
  if (!esNativo()) {
    return el('div', { class: 'grupo' }, [
      el('p', { class: 'grupo-titulo', texto: 'Aplicación' }),
      el('p', { class: 'pista', texto: 'Estás en la versión web, que se actualiza sola al recargar.' }),
    ]);
  }
  ponerVersion();

  const paso = (texto, estado) => el('li', { 'data-estado': estado }, [
    el('span', {
      class: 'progreso-marca',
      texto: { hecho: '✓', curso: '·', fallo: '×' }[estado] || '·',
    }),
    texto,
  ]);

  // Cada fase cierra la anterior, de modo que la lista se lee de arriba abajo
  // como lo que ha ido pasando y no como una promesa de lo que pasará.
  const RELATO = {
    comprobando: () => [paso('Buscando si hay versión nueva…', 'curso')],
    'al-dia': ({ version }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Ya tienes lo último${version ? ` (${version})` : ''}`, 'hecho'),
    ],
    'hay-version': ({ version }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${version}`, 'hecho'),
    ],
    descargando: ({ version, porcentaje }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${version}`, 'hecho'),
      paso(
        porcentaje === undefined || porcentaje === null
          ? 'Descargando…'
          : `Descargando… ${Math.round(porcentaje)} %`,
        'curso',
      ),
    ],
    instalando: ({ version }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${version}`, 'hecho'),
      paso('Descargada', 'hecho'),
      paso('Instalando…', 'curso'),
    ],
    descargada: ({ version }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Versión ${version} instalada`, 'hecho'),
      paso('Se aplicará al volver a abrir la aplicación', 'hecho'),
    ],
    'sin-manifiesto': () => [paso('No he podido leer si hay versión nueva', 'fallo')],
    error: ({ detalle }) => [paso(`No he podido actualizar: ${detalle || 'error'}`, 'fallo')],
    'no-aplica': () => [paso('Aquí no hay nada que actualizar', 'hecho')],
  };

  const boton = el('button', {
    class: 'boton', 'data-tono': 'discreto', type: 'button',
    onclick: async () => {
      boton.disabled = true;
      boton.textContent = 'Actualizando…';

      const contar = (avance) => {
        const construir = RELATO[avance.fase];
        if (!construir) return;
        vaciar(progreso).append(...construir(avance));
      };

      const resultado = await comprobarActualizacion({ alAvanzar: contar });
      contar(resultado);

      boton.disabled = false;
      boton.textContent = 'Buscar actualización';
      if (resultado.estado === 'descargada') ponerVersion();
    },
  }, ['Buscar actualización']);

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Aplicación' }),
    linea,
    boton,
    progreso,
  ]);
}

function aplicarTema(valor) {
  localStorage.setItem('agenda.tema', valor);
  if (valor === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', valor);
}

aplicarTema(localStorage.getItem('agenda.tema') || 'auto');
