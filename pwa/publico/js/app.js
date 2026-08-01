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
  el, vaciar, abrirHoja, cerrarHoja, acordeon, avisar, botonIcono, campo, entrada, icono, seleccion,
} from './ui.js';
import { borrarSesion, guardarSesion, leerSesion, olvidarTodo } from './almacen.js';
import { crearVista, nuevoId } from './modelo.js';
import {
  darDeAltaLosAvisos, darDeBajaLosAvisos, detener, estado, guardar, guardarAjustesDeIa, iniciar,
  instantanea, leerAjustesDeIa, probarRedaccion, refrescarViajes, retirar, sincronizar, suscribir,
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
  activarAvisosRemotos,
  alTocarUnAviso,
  comprobarActualizacion,
  copiar,
  desactivarAvisosRemotos,
  esNativo,
  hayAvisosRemotos,
  iniciarNativo,
  permisoDeAvisos,
  ponerElGlobo,
  programarRecordatorios,
  toque,
  versionInstalada,
} from './native.js';
import { NOMBRES_DIA, formatearHace, hoy, instanciasEn, iso, sumarDias } from './semana.js';
import { VERSION_APP } from './version.js';
import {
  TURNOS, cuadroDe, genteDeCasa, guardarCuadro, hayLio, inicialesDe, inicioDeVentana,
  nombreDeTurno, resolverPropuesta, rotuloDeTurno, turnosDe,
} from './lio.js';
import { nuevoPieDeVersion, pintarHoy, reiniciarHoy, tituloDeHoy } from './vistas/hoy.js';
import {
  abrirDetalleEvento, abrirFormularioEvento, abrirTurnoDeLio, bloqueDePropuesta, pintarAgenda,
  reiniciarAgenda, tituloDeAgenda,
} from './vistas/semana.js';
import {
  abrirDetalleIdea, abrirDetalleRegalo, nuevoDesdeRegalos, pintarRegalos, reiniciarRegalos,
} from './vistas/regalos.js';
import { abrirBandeja as abrirBandejaDeSolicitudes, pintarFamilia, reiniciarFamilia } from './vistas/familia.js';
import {
  abrirApunte, nuevoDesdeSitios, pintarSitios, reiniciarSitios, tituloDeSitios,
} from './vistas/sitios.js';
import { hayAvisos, marcarVisto, novedades, porContestar } from './avisos.js';

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
  // Sitios ocupa el hueco que dejó Buscar, que se retiró: de las tres
  // colecciones que cubría solo el banco de ideas acumula volumen, y gastar uno
  // de los cinco huecos de la barra en una búsqueda global era el peor reparto
  // posible. Su título es una función porque la pestaña tiene dos alturas: la
  // lista de sitios y un sitio abierto, que escribe su nombre arriba.
  sitios: { titulo: tituloDeSitios, pintar: pintarSitios, fab: (ctx) => nuevoDesdeSitios(ctx) },
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
        return pintarEspera(respuesta.token_espera, respuesta, respuesta.nombre_apple);
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

function pintarEspera(token, situacion, nombreDeApple = null) {
  document.getElementById('aplicacion').hidden = true;
  document.getElementById('acceso').hidden = true;
  document.getElementById('espera').hidden = false;

  const marco = vaciar(document.getElementById('esperaMarco'));

  if (situacion.estado === 'sin_solicitud') {
    // Si Apple acaba de dar el nombre, no hay nada que preguntar: se pide el
    // acceso con él y esta persona ve directamente que su solicitud está hecha.
    // Volver a pedir un dato que Sign in with Apple ya ha entregado es lo que
    // rechaza la directriz 4 de la App Store, y además sobra.
    if (nombreDeApple) return pedirAccesoSinPreguntar(marco, token, situacion, nombreDeApple);
    return pintarFormulario(marco, token, situacion);
  }

  const texto = TEXTO_ESPERA[situacion.estado] || TEXTO_ESPERA.pendiente;
  marco.append(
    el('p', { class: 'eyebrow', texto: 'Agenda Familiar' }),
    el('h1', { texto: texto.titulo }),
    el('p', { class: 'acceso-texto', texto: texto.cuerpo }),
  );

  if (situacion.estado === 'pendiente') {
    if (situacion.nombre) marco.append(lineaDelNombre(token, situacion));

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

  // Quien espera no tiene barra de pestañas ni Ajustes: sin esto no habría
  // manera de traerse una versión nueva desde aquí, que es justo donde puede
  // hacer falta si lo que falla es el acceso.
  marco.append(nuevoPieDeVersion());
}

/**
 * Con qué nombre se está esperando, y cómo cambiarlo.
 *
 * Existe porque el nombre ya no lo teclea nadie: lo pone Apple y la solicitud
 * sale sin que quien la manda lo haya visto. Puede llegar a medias, o ser el de
 * la cuenta y no por el que le conocen en casa, y quien decide solo ve eso.
 *
 * Corregirlo es volver a mandar la solicitud: el servidor actualiza la que ya
 * existe en lugar de crear otra, así que no hace falta nada más.
 */
function lineaDelNombre(token, situacion) {
  const linea = el('p', { class: 'pista' });

  const mostrar = () => {
    vaciar(linea).append(
      `La has pedido como ${situacion.nombre}. `,
      el('button', { class: 'enlace-en-linea', type: 'button', onclick: editar }, ['Cambiar']),
    );
  };

  function editar() {
    const nombre = entrada({ value: situacion.nombre, placeholder: '<tu nombre>', autocomplete: 'name' });
    const guardarlo = el('button', {
      class: 'boton', type: 'button',
      onclick: async () => {
        const limpio = nombre.value.trim();
        if (!limpio) { avisar('Falta tu nombre'); return; }
        guardarlo.disabled = true;
        guardarlo.textContent = 'Guardando…';
        try {
          const resultado = await pedirEntrar(configuracion, token, limpio);
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
 * Pide el acceso con el nombre que Apple acaba de dar, sin preguntar nada.
 *
 * Es el camino normal de quien entra por primera vez. Si algo falla se cae al
 * formulario, para que un fallo de red no deje a nadie en una pantalla sin
 * salida.
 */
async function pedirAccesoSinPreguntar(marco, token, situacion, nombre) {
  marco.append(
    el('p', { class: 'eyebrow', texto: 'Agenda Familiar' }),
    el('h1', { texto: `Un momento, ${nombre.split(' ')[0]}.` }),
    el('p', { class: 'acceso-texto', texto: 'Estamos enviando tu solicitud.' }),
  );

  try {
    const resultado = await pedirEntrar(configuracion, token, nombre);
    pintarEspera(token, resultado);
  } catch {
    pintarFormulario(vaciar(marco), token, situacion, nombre);
  }
}

/**
 * El formulario de la sala de espera: un campo, el nombre.
 *
 * Es el camino de excepción. Apple solo entrega el nombre en la primerísima
 * autorización y nunca en el token, de modo que quien ya hubiera autorizado la
 * aplicación antes —o quien retiró su solicitud y vuelve— llega sin él, y hay
 * que preguntarlo: es lo único que identifica a esa persona ante quien decide
 * si entra, sobre todo si ha elegido ocultar su correo.
 */
function pintarFormulario(marco, token, situacion, sugerido = null) {
  const nombre = entrada({ placeholder: '<tu nombre>', autocomplete: 'name' });
  if (sugerido) nombre.value = sugerido;

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

  // Solo las que son pestaña: el sexto botón de la barra es Ajustes, que abre
  // una hoja y no cambia de sección, y sin este filtro el clic le pondría a
  // `pestana` un valor que no existe.
  for (const boton of document.querySelectorAll('.tab[data-pestana]')) {
    // Quien vuelve a entrar después de cerrar sesión lo hace por Hoy, y la
    // barra tiene que estar de acuerdo con eso: el marcado la deja en Hoy, pero
    // en memoria podía haber quedado otra de la sesión anterior.
    if (boton.dataset.pestana === pestana) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');

    boton.onclick = () => {
      pestana = boton.dataset.pestana;
      for (const otro of document.querySelectorAll('.tab[data-pestana]')) otro.removeAttribute('aria-current');
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

  document.getElementById('botonAvisos').onclick = abrirAvisos;
  document.getElementById('botonAjustes').onclick = abrirAjustes;

  // Los avisos remotos, en la demostración, no: allí no hay servidor al que dar
  // un token ni nadie que pueda pedir un turno.
  if (estado().estado !== 'demostracion') {
    alTocarUnAviso(atenderUnAviso);
    renovarAvisos();
  }

  let ultimaInstantanea = null;
  let ultimosRechazos = null;

  suscribir((datos, situacion) => {
    if (situacion.estado === 'sesion-caducada') {
      borrarSesion();
      mostrarAcceso('La sesión ha caducado. Vuelve a entrar.');
      return;
    }
    pintarCabecera();

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
      // El globo, con lo mismo que el grupo de arriba del sobre. El servidor ya
      // lo manda en cada aviso, pero contestar desde dentro no genera ninguno:
      // sin esta línea, el número se quedaría contando lo que acabas de resolver.
      ponerElGlobo(porContestar(ctx).length);
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
  //
  // Y pueden devolver un nodo en vez de una cadena, que es lo que le hace falta
  // a Sitios: dentro de un sitio el título son migas —«Sitios › Bolonia»— con la
  // primera tocable, y eso no cabe en un `textContent`.
  const escrito = typeof definicion.titulo === 'function' ? definicion.titulo(ctx) : definicion.titulo;
  vaciar(titulo).append(escrito instanceof Node ? escrito : document.createTextNode(escrito));
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
  pintarCabecera();
}

export const TEXTO_SINCRONIZACION = {
  'al-dia': 'al día',
  sincronizando: 'sincronizando',
  'sin-conexion': 'sin conexión',
  error: 'sin sincronizar',
  demostracion: 'demostración',
};

/**
 * Los dos mandos de la esquina, que casi siempre son uno.
 *
 * El sobre solo existe cuando hay algo que enseñar; la pastilla de la
 * demostración, solo en demostración. El punto de la sincronización se retiró:
 * su estado vive en Ajustes, que es donde se va a mirar cuando se sospecha de
 * él, y lo único que había que no perder —que algo lleve un rato sin subir— lo
 * dice Hoy con una línea, y solo cuando pasa.
 *
 * El sobre aparece también en la demostración, igual que la banda de Hoy: allí
 * hay peticiones y comentarios inventados, y esconder uno de los dos sitios
 * donde salen enseñaría una aplicación que no es la que se va a usar.
 */
function pintarCabecera() {
  const demostracion = estado().estado === 'demostracion';
  document.getElementById('pastillaDemo').hidden = !demostracion;
  document.getElementById('botonAvisos').hidden = !ctx.vista || !hayAvisos(ctx);
}

// ------------------------------------------------------ El sobre de avisos --

/**
 * Lo que espera, en dos grupos y con una diferencia que no es de forma: lo de
 * arriba se contesta y lo de abajo se descarta.
 *
 * Descartar una petición de turno dejaría a quien la hizo esperando una
 * respuesta que ya nadie va a dar, y sin rastro de que existió. Por eso «Por
 * contestar» no lleva aspa: se contesta o se queda.
 */
function abrirAvisos() {
  const pendientes = porContestar(ctx);
  const nuevos = novedades(ctx);

  abrirHoja('Avisos', (cuerpo) => {
    if (pendientes.length) {
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: 'Por contestar' }),
        ...pendientes.map((aviso) => (aviso.solicitudes
          ? filaDeSolicitudes(aviso)
          : bloqueDePropuesta(aviso.trato, ctx))),
      ]));
    }

    if (nuevos.length) {
      cuerpo.append(el('div', { class: 'grupo' }, [
        el('p', { class: 'grupo-titulo', texto: 'Nuevo' }),
        el('div', {}, nuevos.map((aviso) => filaDeAviso(aviso))),
        // El verbo de quien vuelve de una semana fuera. Sin él, la única salida
        // sería ir tocando el aspa siete veces.
        nuevos.length > 1 ? el('button', {
          class: 'enlace-discreto', type: 'button',
          onclick: async () => {
            for (const aviso of nuevos) await marcarVisto(ctx, aviso.tipo, aviso.objetoId);
            ctx.refrescar();
            abrirAvisos();
          },
        }, ['Vaciar']) : null,
      ]));
    }

    // Descartar el último con la hoja abierta haría desaparecer el icono debajo,
    // así que la hoja se queda puesta y lo dice. Cerrarse sola en la cara de
    // quien acaba de tocar es peor que una línea de más.
    if (!pendientes.length && !nuevos.length) {
      cuerpo.append(el('p', { class: 'vacio', texto: 'Nada más.' }));
    }
  });
}

/**
 * Quien espera a que le dejen entrar. Lleva a la bandeja, que es donde están
 * los nombres y los verbos; aquí no cabe decidir nada.
 */
function filaDeSolicitudes(aviso) {
  return el('div', { class: 'aviso-fila' }, [
    el('span', { class: 'aviso-emoji', 'aria-hidden': 'true', texto: aviso.emoji }),
    el('button', {
      class: 'aviso-cuerpo', type: 'button',
      onclick: () => { cerrarHoja(); abrirBandejaDeSolicitudes(ctx); },
    }, [
      el('span', {
        texto: aviso.solicitudes === 1
          ? 'Alguien quiere entrar en la agenda'
          : `${aviso.solicitudes} personas quieren entrar en la agenda`,
      }),
      el('span', { class: 'aviso-cuando', texto: 'Toca para verlo' }),
    ]),
  ]);
}

function filaDeAviso(aviso) {
  const ir = () => {
    cerrarHoja();
    abrirLoComentado(aviso);
  };

  return el('div', { class: 'aviso-fila' }, [
    el('span', { class: 'aviso-emoji', 'aria-hidden': 'true', texto: aviso.emoji }),
    el('button', { class: 'aviso-cuerpo', type: 'button', onclick: ir }, [
      el('span', { texto: `${listaDeNombres(aviso.quienes)}, en «${aviso.donde}»` }),
      el('span', { class: 'aviso-cuando', texto: formatearHace(aviso.cuando) }),
    ]),
    el('button', {
      class: 'aviso-descartar', type: 'button', 'aria-label': 'Descartar',
      onclick: async () => {
        await marcarVisto(ctx, aviso.tipo, aviso.objetoId);
        ctx.refrescar();
        abrirAvisos();
      },
    }, ['×']),
  ]);
}

const listaDeNombres = (nombres) => (nombres.length > 1
  ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
  : nombres[0] || 'Alguien');

/** Abrir el aviso lo descarta también, porque ir a leerlo es la manera larga de
 *  decir lo mismo. Lo escribe la hoja de destino al abrirse. */
function abrirLoComentado(aviso) {
  if (aviso.tipo === 'apunte') return abrirApunte(aviso.objetoId, ctx);
  if (aviso.tipo === 'idea') return abrirDetalleIdea(aviso.objetoId, ctx);
  if (aviso.tipo === 'regalo') return abrirDetalleRegalo(aviso.objetoId, ctx);
  if (aviso.tipo === 'evento') return abrirDetalleEvento(aviso.objetoId, ctx);
  return null;
}

// ------------------------------------------------------- Avisos remotos --

/**
 * Que suene el teléfono cuando alguien de casa hace algo que te toca.
 *
 * La marca de que están puestos vive aquí y no en el servidor porque contesta a
 * otra pregunta: el servidor sabe si este aparato tiene token, y esto sabe si
 * quien lo usa los quiere. Se separan porque el token caduca solo —al restaurar
 * una copia, al reinstalar— y hay que volver a darlo sin volver a preguntar.
 */
const CLAVE_AVISOS = 'agenda.avisos';

const losQuiere = () => localStorage.getItem(CLAVE_AVISOS) === 'si';

/**
 * Vuelve a dar el token en cada arranque, si se han pedido.
 *
 * En silencio y sin preguntar nada: el permiso ya está concedido, y lo único que
 * puede haber cambiado es el token, que es justo lo que nadie más sabe. Si el
 * permiso se retiró desde los Ajustes de iOS, se apaga también aquí para que el
 * interruptor no mienta.
 */
async function renovarAvisos() {
  if (!hayAvisosRemotos() || !losQuiere()) return;
  if (await permisoDeAvisos() !== 'concedido') {
    localStorage.removeItem(CLAVE_AVISOS);
    return;
  }
  const alta = await activarAvisosRemotos();
  if (alta.estado === 'registrado') await darDeAltaLosAvisos(alta.token, 'ios').catch(() => {});
}

function bloqueDeAvisos(dentro) {
  const linea = el('p', { class: 'pista' });

  // En el navegador no hay dónde entregar un aviso. Se dice, en lugar de
  // esconder el apartado: quien viene a buscarlo merece saber por qué no está,
  // y no que el sitio donde debería estar no exista.
  if (!hayAvisosRemotos()) {
    dentro.append(el('p', {
      class: 'pista',
      texto: 'Los avisos suenan en la aplicación del iPhone. En el navegador no hay dónde entregarlos.',
    }));
    return;
  }

  const casilla = el('input', { type: 'checkbox' });
  casilla.checked = losQuiere();

  const escribir = (texto) => { linea.textContent = texto; };

  escribir(casilla.checked
    ? 'Te avisamos de lo que te toca contestar.'
    : 'Hoy solo lo ves al abrir la aplicación.');

  casilla.addEventListener('change', async () => {
    casilla.disabled = true;
    if (casilla.checked) {
      escribir('Pidiendo permiso…');
      const alta = await activarAvisosRemotos();
      if (alta.estado === 'registrado') {
        try {
          await darDeAltaLosAvisos(alta.token, 'ios');
          localStorage.setItem(CLAVE_AVISOS, 'si');
          escribir('Listo: te avisamos en este teléfono.');
        } catch (error) {
          casilla.checked = false;
          escribir(`No he podido darlo de alta: ${error.message}`);
        }
      } else {
        casilla.checked = false;
        escribir({
          'sin-permiso': 'iOS los tiene denegados para esta aplicación. Se cambia en Ajustes de iOS → Agenda → Notificaciones.',
          'sin-token': 'No he conseguido el permiso de Apple. Inténtalo con red.',
          'no-aplica': 'Aquí no hay avisos que activar.',
        }[alta.estado] || `No he podido activarlos: ${alta.detalle || alta.estado}`);
      }
    } else {
      escribir('Apagando…');
      localStorage.removeItem(CLAVE_AVISOS);
      await darDeBajaLosAvisos().catch(() => {});
      await desactivarAvisosRemotos();
      escribir('Apagados. Lo verás al abrir la aplicación.');
    }
    casilla.disabled = false;
  });

  dentro.append(
    el('label', { class: 'conmutador' }, [casilla, 'Avisarme en este teléfono']),
    linea,
    // Lo que se avisa se dice, porque no es evidente y porque acota: nadie se
    // entera de lo que no vería abriendo la aplicación.
    el('p', {
      class: 'pista',
      texto: 'Suenan las peticiones de turno de Lío, sus respuestas y los comentarios '
        + 'en algo tuyo. Nunca algo que no puedas ver ya.',
    }),
  );
}

/**
 * Alguien ha tocado un aviso, o uno de sus dos botones.
 *
 * Contestar desde el botón hace las dos cosas: escribe la respuesta y abre el
 * turno, para que se vea qué ha quedado escrito. Es la diferencia entre una
 * aplicación que contesta por ti en la oscuridad y una que te lleva a donde
 * acabas de contestar.
 *
 * Lo que puede faltar es la propuesta: el aviso llega por APNs y la instantánea,
 * por la sincronización, y no tienen por qué haber llegado en ese orden. Si no
 * está, se pide una y se vuelve a mirar.
 */
async function atenderUnAviso({ accion, datos }) {
  if (!datos?.tipo) return;

  if (datos.tipo === 'comentario') {
    abrirLoComentado({ tipo: datos.objeto_tipo, objetoId: datos.objeto_id });
    return;
  }

  if (datos.tipo !== 'lio') return;

  if (accion === 'aceptar' || accion === 'rechazar') {
    let trato = tratoPorId(datos.trato);
    if (!trato) {
      await sincronizar().catch(() => {});
      trato = tratoPorId(datos.trato);
    }
    if (trato && trato.estado === 'pendiente') {
      await resolverPropuesta(trato, accion === 'aceptar');
      avisar(accion === 'aceptar' ? 'Contestado: ese turno es tuyo' : 'Contestado: se queda como estaba');
      refrescar();
    }
  }

  if (datos.fecha && datos.turno) abrirTurnoDeLio(datos.fecha, datos.turno, ctx);
}

const tratoPorId = (id) => (instantanea()?.tratos_paseo || []).find((t) => t.id === id) || null;

// -------------------------------------------------------------- Ajustes --

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

    // Aspecto va el primero por ser el más corto y el único que no habla de una
    // avería: tres opciones que se tocan y se ven en el acto. Deja debajo el
    // resto de la lista sin haberla empujado.
    //
    // Segmentado y no desplegable. Un `select` de tres opciones esconde dos
    // detrás de una rueda de iOS que tapa media pantalla, y el tema es lo único
    // de esta hoja cuyo efecto se ve en el sitio: con la rueda encima no se ve
    // nada hasta cerrarla. Es el mismo `.seg` de Gente, Regalos y la Agenda, y
    // la misma figura con la que macOS resuelve exactamente este ajuste.
    //
    // «Como el sistema» pasa a «Automático» porque no hay segmento que lo
    // sostenga: quince caracteres al cuerpo del control dejan los otros dos
    // fuera de la pantalla. El valor guardado sigue siendo `auto`.
    cuerpo.append(acordeon('Aspecto', (dentro) => {
      const TEMAS = [
        { valor: 'auto', texto: 'Automático' },
        { valor: 'claro', texto: 'Claro' },
        { valor: 'oscuro', texto: 'Oscuro' },
      ];
      let puesto = localStorage.getItem('agenda.tema') || 'auto';
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Tema de la aplicación' },
        TEMAS.map(({ valor, texto }) => el('button', {
          type: 'button',
          'aria-pressed': valor === puesto ? 'true' : 'false',
          onclick: (evento) => {
            puesto = valor;
            for (const otro of seg.children) otro.setAttribute('aria-pressed', 'false');
            evento.currentTarget.setAttribute('aria-pressed', 'true');
            aplicarTema(valor);
          },
        }, [texto])));
      dentro.append(campo('Tema', seg));
    }, { icono: 'aspecto' }));

    // Uno solo abierto, y es este. Eran tres apartados —«La aplicación» con
    // «Buscar actualización», «Sincronización» con su línea, y «✈️ Viajes» con
    // su botón—, y entre los tres obligaban a acertar cuál era tu problema antes
    // de dejarte mirar. Nadie llega aquí sabiendo eso: se llega porque algo no
    // está como se esperaba, y «¿han subido mis datos?» y «¿tengo la versión
    // buena?» son la misma pregunta hecha a capas distintas. Sigue siendo el
    // abierto de origen aunque ya no sea el primero: lo que decide eso es a qué
    // se viene, no el orden.
    if (!demostracion) cuerpo.append(acordeon('Sincronización', bloqueDeSincronizacion, { abierta: true, icono: 'sincronizar' }));

    // Los demás empiezan plegados. Ajustes es una lista de cosas que casi nunca
    // se tocan: enseñarlas todas abiertas obliga a leerlas enteras para
    // encontrar la única que se venía a buscar.
    //
    // El cuadro de Lío es el reparto de la casa, no una preferencia de quien
    // mira: cambiarlo por sorpresa reordena la semana de otras tres personas, y
    // por eso lo edita quien administra. Un cambio de un día suelto no pasa por
    // aquí, sino por el turno mismo, que se le pide al otro y él acepta.
    if (ctx.vista?.esAdministrador() && !demostracion) {
      cuerpo.append(acordeon('Lío', cuadroDeLio, { icono: 'huella' }));
    }

    if (ctx.vista?.esAdministrador() && !demostracion) {
      cuerpo.append(acordeon('Inteligencia artificial', bloqueDeRedaccion, { icono: 'destello' }));
    }

    // Los viajes vienen de un calendario de Google, y su única palanca desde
    // aquí es traerlos ahora sin esperar al ciclo diario. La descarga la hace el
    // servidor; esto solo la dispara, y por eso —como Lío y la IA— es de quien
    // administra (`specs/calendario-viajes.md` §9).
    if (ctx.vista?.esAdministrador() && !demostracion) {
      cuerpo.append(acordeon('Viajes', bloqueDeViajes, { icono: 'avion' }));
    }

    // Aquí y no al arrancar. Preguntar por los avisos nada más entrar es lo que
    // más permisos consigue y lo que peor sienta, y un «no» de esos no se
    // recupera desde la aplicación: hay que ir a los Ajustes de iOS. En este
    // apartado lo enciende quien ha venido a buscarlo.
    if (!demostracion) cuerpo.append(acordeon('Avisos', bloqueDeAvisos, { icono: 'campana' }));

    // Las ideas sobre la aplicación viven aquí y no en una pestaña porque son
    // sobre la herramienta y no sobre el trabajo, que es la misma razón por la
    // que están aquí la versión y la actualización.
    // Con su recuento en el rótulo, como Regalos y Ocasiones: lo que cuenta son
    // las que faltan, que es a lo que se entra, y no cuántas se han apuntado en
    // total. Sin él había que desplegar para saber si hay algo dentro.
    //
    // El nodo se crea aquí y lo escribe el bloque, en vez de pasar el número ya
    // hecho: una mejora se da por hecha sin cerrar la hoja, y con una cadena el
    // rótulo se quedaba diciendo el número de cuando se abrió Ajustes.
    if (!demostracion) {
      const cuenta = el('span', { class: 'acordeon-nota' });
      cuerpo.append(acordeon('Mejoras', (dentro) => bloqueDeMejoras(dentro, cuenta), {
        icono: 'bombilla', nota: cuenta,
      }));
    }

    // «La aplicación» se retiró: era un apartado entero —rótulo, moneda y
    // solapa— para dos enlaces de una línea, y desde que «Buscar actualización»
    // se fue a Sincronización no le quedaba nada más. Los dos enlaces bajan aquí,
    // al pie de «Tu cuenta», que es de lo que hablan: qué se hace con tus datos y
    // a quién se escribe. Hacen falta el día que se use la ficha de la App Store
    // (`docs/despliegue-cloudflare.md` §8.4), y no cuestan un apartado.
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

      dentro.append(bloqueLegal());
    }, { icono: 'persona' }));
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
    // Que el cambio vale de ahora en adelante hay que decirlo: es lo único que
    // esta pantalla hace y que no se ve al hacerlo. Lo que ya pasó se queda como
    // pasó (`specs/propuesta-cuadro-con-vigencia.html`).
    el('p', {
      class: 'pista',
      texto: 'Toca un turno para pasar a la siguiente persona. Lo que cambies vale de ahora en adelante;'
        + ' lo que ya pasó se queda como fue.',
    }),
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
/**
 * El calendario de viajes en Ajustes: cuándo se sincronizó por última vez, un
 * botón para traerlo ahora y un panel de diagnóstico. El contenido de los
 * viajes se corrige en Google (`specs/calendario-viajes.md`); esta pantalla no
 * edita nada, solo dispara la descarga que hace el servidor y muestra en qué
 * quedó, que es lo que hace falta cuando «no sale nada» para saber por qué:
 *
 * - **calendario ausente de la instantánea** → falta la migración 0014, o el
 *   Worker desplegado no lleva el cambio que lo transmite;
 * - **estado `sin-configurar`** → el secreto `VIAJES_ICAL_URL` no llegó al Worker;
 * - **estado `sin-calendario`** → la fila del calendario no está sembrada;
 * - **`ok` con 0 altas y 0 viajes cargados** → el feed no trajo eventos;
 * - **viajes cargados pero ninguno a la vista** → son de fechas ya pasadas.
 */
function bloqueDeViajes(seccion) {
  const calendario = () =>
    (instantanea().calendarios_externos || []).find((c) => c.id === 'cal-viajes');
  const importados = () =>
    (instantanea().eventos || []).filter((e) => e.origen === 'importado');

  const diagnostico = el('pre', { class: 'traza' });
  const pintar = (ultimoIntento) => {
    const cal = calendario();
    const viajes = importados();
    const fechas = viajes.map((e) => e.inicio).filter(Boolean).sort();
    const lineas = [
      `Calendario en la instantánea: ${cal ? 'sí' : 'NO — ¿migración 0014 aplicada y Worker desplegado?'}`,
      cal ? `  última sincronización: ${cal.ultima_sincronizacion || 'nunca'}` : null,
      `Viajes importados cargados: ${viajes.length}`,
      fechas.length ? `  fechas: de ${fechas[0]} a ${fechas[fechas.length - 1]}` : null,
      `Versión de la app: ${VERSION_APP}`,
      ultimoIntento ? `Último intento: ${ultimoIntento}` : null,
    ].filter((linea) => linea !== null);
    diagnostico.textContent = lineas.join('\n');
  };
  pintar();

  // Sin botón: traer los viajes ahora es una de las tres cosas que hace
  // «Comprobar ahora» en Sincronización, y tenerlo dos veces obligaba a elegir
  // cuál de los dos era el bueno. Lo que queda aquí es el diagnóstico, que es de
  // quien administra y no de quien se pregunta si está todo al día.
  seccion.append(diagnostico);
}

/**
 * Ideas sobre la propia aplicación, apuntadas desde el móvil.
 *
 * Llegan andando por la calle, que es donde se usa esto y donde no está el
 * ordenador. Sin un sitio donde dejarlas, lo único que se podía hacer con una
 * era acordarse hasta volver a sentarse, que es un filtro que conserva las que
 * se te ocurren dos veces y pierde las demás.
 *
 * **Y son una fila, no una nota en este teléfono.** La versión fácil habría sido
 * `localStorage` —sin tabla, sin migración y sin despliegue para un cuaderno—,
 * y es la que `meeting-ops-air` construyó primero y luego deshizo, con el
 * argumento que nos ahorra repetirlo: sobre una idea de la aplicación se actúa
 * en otra máquina, y una nota que esa máquina no puede leer es una nota sobre la
 * que se actúa cuando alguien se acuerda de copiarla. El transporte era una
 * persona. Aquí es peor todavía, porque quien lee este repositorio no ve el
 * teléfono de nadie.
 *
 * Viaja por el contrato que ya hay —`guardar('mejora', …)` y la cola de
 * siempre—, y no por una ruta propia: una ruta propia haría esperar a esta
 * pantalla, o pediría su propia cola, reintento e idempotencia, que es el motor
 * de sincronización escrito una segunda vez para un cuaderno.
 *
 * No pasa por la visibilidad: una mejora no tiene destinatario, así que no hay
 * de quién ocultarla. La ven los cuatro.
 */
/**
 * Lo que cabe en una mejora.
 *
 * El mismo número que comprueba el Worker (`TOPE_DE_MEJORA` en
 * `api/src/repositorio.js`). Aquí corta antes de guardar y allí rechaza, que es
 * lo que hace que siga siendo verdad cuando el que escribe no es esta pantalla.
 */
const TOPE_DE_MEJORA = 2000;

function bloqueDeMejoras(seccion, cuenta = null) {
  const lista = el('div', { class: 'grupo' });
  const alPie = el('p', { class: 'pista' });

  /**
   * Las de la casa, lo que falta arriba y lo hecho al final.
   *
   * Es el orden de «Llevar» en Sitios y por la misma razón: una lista que se
   * mira para saber qué queda no debe empezar por lo que ya no queda. Dentro de
   * cada mitad, las más nuevas primero, sobre cuándo se tuvo la idea y no sobre
   * cuándo se le arregló una errata.
   */
  const pintar = () => {
    const mejoras = (instantanea()?.mejoras || [])
      .filter((m) => m.activo !== 0 && m.activo !== false)
      .sort((a, b) => (hecha(a) === hecha(b)
        ? String(b.creado_en || '').localeCompare(String(a.creado_en || ''))
        : hecha(a) - hecha(b)));

    vaciar(lista);
    if (!mejoras.length) {
      lista.append(el('p', { class: 'pista', texto: 'Ideas sobre esta aplicación.' }));
      alPie.textContent = 'Las ve toda la casa.';
      if (cuenta) cuenta.textContent = '';
      return;
    }
    for (const mejora of mejoras) lista.append(filaDeMejora(mejora, pintar));

    // Lo que quedan por hacer, que es lo que se viene a mirar. Y quién las ve,
    // que es la pregunta que esta pantalla no contestaba en ningún sitio: una
    // mejora que apuntas se le aparece a los otros tres y nada lo insinuaba.
    const quedan = mejoras.filter((m) => !hecha(m)).length;
    alPie.textContent = quedan
      ? `${quedan} sin hacer. Las ve toda la casa.`
      : 'Todas hechas. Las ve toda la casa.';
    if (cuenta) cuenta.textContent = quedan ? String(quedan) : '';
  };

  const abrirFormulario = (mejora = null) => {
    const texto = el('textarea', { rows: '4', spellcheck: 'true', maxlength: String(TOPE_DE_MEJORA) });
    texto.value = mejora?.texto || '';

    abrirHoja(mejora ? 'Mejora' : 'Apuntar una idea', (cuerpo) => {
      cuerpo.append(campo('Qué se te ha ocurrido', texto));

      const verbos = [
        el('button', {
          class: 'boton crecer', type: 'button',
          onclick: async () => {
            // Cortado aquí y comprobado en el Worker por el mismo número. Sin
            // tope, un pegado largo entra en la instantánea de los cuatro y se
            // descarga en cada sincronización, para siempre.
            const dicho = texto.value.trim().slice(0, TOPE_DE_MEJORA);
            if (!dicho) { avisar('Escribe algo'); texto.focus(); return; }
            await guardar('mejora', mejora?.id || nuevoId(), {
              texto: dicho,
              autor_id: sesionActual?.persona?.id || null,
            });
            cerrarHoja();
            pintar();
          },
        }, [mejora ? 'Guardar' : 'Apuntar']),
      ];

      // Copiar se queda, y es de la mejora y no de la lista: una idea se pega en
      // la conversación que va sobre esa idea, y eso no es sincronizar.
      //
      // Y lo dice en su propio botón durante dos segundos, no en un aviso
      // flotante: la respuesta se quiere donde el dedo ya está. La hoja
      // sobrevive al repintado de la pantalla de detrás, así que el nodo sigue
      // ahí cuando vence el plazo.
      if (mejora) {
        const copia = el('button', {
          class: 'boton', 'data-tono': 'discreto', type: 'button',
          onclick: async () => {
            const hecho = await copiar(mejora.texto);
            copia.textContent = hecho ? 'Copiada' : 'No se ha podido';
            copia.disabled = true;
            setTimeout(() => { copia.textContent = 'Copiar'; copia.disabled = false; }, 2000);
          },
        }, ['Copiar']);
        verbos.push(copia);
      }

      cuerpo.append(el('div', { class: 'acciones' }, verbos));

      if (mejora) {
        cuerpo.append(el('button', {
          class: 'boton', 'data-tono': 'peligro', type: 'button',
          onclick: async () => {
            // La frase dice a quién afecta. Cualquiera puede quitar la de
            // cualquiera —es una lista de la casa y no un cuaderno personal, y
            // por eso no hay comprobación de autoría en ninguno de los dos
            // lados—, pero eso hay que decirlo antes y no descubrirlo después.
            if (!confirm('¿Quitar esta mejora? Se va de la lista de toda la casa.')) return;
            await retirar('mejora', mejora.id);
            cerrarHoja();
            pintar();
          },
        }, ['Quitar']));
      }
    });

    // Apuntar una idea es el gesto que más se repite de este apartado, y sin
    // esto cuesta un toque de más. El plazo es para que la hoja haya terminado
    // de subir: enfocar mientras se mueve deja el teclado peleando con ella.
    setTimeout(() => texto.focus(), 60);
  };

  pintar();
  seccion.append(
    lista,
    el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', type: 'button', onclick: () => abrirFormulario(),
      }, ['Apuntar una idea']),
    ]),
    alPie,
  );

  /**
   * Una mejora, con su visto delante.
   *
   * El visto es el de «Llevar» en Sitios: tacha, baja al final lo tachado y se
   * deshace tocando otra vez. No guarda quién ni cuándo a propósito —eso sería
   * un registro de trabajo, y esto es una lista de la compra—. Y va aparte del
   * cuerpo de la tarjeta porque tocar el texto abre la mejora: dos destinos en
   * una fila, como en la lista de la compra.
   */
  function filaDeMejora(mejora, alVolver) {
    const visto = el('button', {
      class: 'mejora-visto', type: 'button',
      'aria-pressed': hecha(mejora) ? 'true' : 'false',
      'aria-label': hecha(mejora) ? 'Deshacer' : 'Darla por hecha',
      onclick: async (evento) => {
        evento.stopPropagation();
        await guardar('mejora', mejora.id, { hecho: hecha(mejora) ? 0 : 1 });
        alVolver();
      },
    }, [icono('visto')]);

    const cuerpo = el('button', {
      class: 'mejora-cuerpo', type: 'button', onclick: () => abrirFormulario(mejora),
    }, [
      // El texto entero y sin recortar: es lo único que la fila tiene que decir.
      el('p', { class: 'mejora-texto', texto: mejora.texto }),
      el('p', { class: 'mejora-firma', texto: firmaDeMejora(mejora) }),
    ]);

    return el('div', { class: 'tarjeta mejora', 'data-hecha': hecha(mejora) ? 'si' : null },
      [visto, cuerpo]);
  }
}

/** Una mejora dada por hecha. El Worker manda booleano y `guardar` deja el 1. */
function hecha(mejora) {
  return mejora.hecho === true || mejora.hecho === 1;
}

/**
 * Quién la puso y, **solo si ya no es de hoy**, cuándo.
 *
 * Es la regla de `firmaDeApunte` en `sitios.js`, y lo que gana no es sitio: una
 * fecha escrita solo cuando dice algo se lee, y una columna de fechas iguales
 * no. Antes salía en ISO —`2026-08-01`—, que no es como escribe fechas ninguna
 * otra pantalla de esta aplicación.
 */
function firmaDeMejora(mejora) {
  const quien = (instantanea()?.personas || []).find((p) => p.id === mejora.autor_id)?.nombre || null;
  if (!quien) return '';
  const cuando = formatearHace(mejora.creado_en);
  const deHoy = !cuando || cuando.startsWith('hoy') || cuando.startsWith('hace') || cuando === 'ahora mismo';
  return deHoy ? quien : `${quien}, ${cuando}`;
}

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

  const apunte = el('textarea', { rows: '5', spellcheck: 'false' });
  apunte.value = ajustes.apunte || '';

  const chispa = el('textarea', { rows: '5', spellcheck: 'false' });
  chispa.value = ajustes.chispa || '';

  const lio = el('textarea', { rows: '5', spellcheck: 'false' });
  lio.value = ajustes.lio || '';

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
        apunte: apunte.value.trim(),
        chispa: chispa.value.trim(),
        lio: lio.value.trim(),
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
      texto: 'La clave y el modelo valen para todo lo que la agenda haga con un modelo. Debajo va el encargo de cada cosa, que se puede reescribir: hoy son seis, contar los días antes de compartirlos, proponer un regalo, felicitar un cumpleaños, apuntar cosas de un sitio, la frase con la que abre Hoy y lo que dice Lío en su bloque.',
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

    el('h4', { class: 'subtitulo-ajuste', texto: 'Apuntar cosas de un sitio' }),
    campo('Instrucción', apunte, 'También en tandas de cinco, con el porqué detrás de la raya: el porqué es lo que se guarda como detalle del apunte, y es lo que separa una lista de obviedades de algo que aporta. Se le dan el sitio, de qué clase se le pide, lo que ya hay apuntado ahí y quiénes son de casa. Vacío, vuelve el encargo de origen.'),

    el('h4', { class: 'subtitulo-ajuste', texto: 'La frase con la que abre Hoy' }),
    campo('Instrucción', chispa, 'El único encargo que nadie pide: sale solo al abrir, una vez al día, y se pasa a la siguiente tocándola. También en tandas de cinco, una por línea: se piden de golpe y el teléfono las va enseñando, así que si reescribes esto conserva esa forma. Se le dan el día, lo que hay apuntado hoy, lo que viene en la semana y un tema sacado al azar de lo que esta casa hace de verdad. Aquí es donde se sube o se baja el nivel de guasa, y donde conviene dejarle prohibidos los tacos y las exclamaciones —sin decírselo se suelta— y prohibido nombrar regalos, ideas y deseos, que es la pantalla que se lee con alguien al lado. Vacío, vuelve el encargo de origen.'),

    el('h4', { class: 'subtitulo-ajuste', texto: 'La voz de Lío' }),
    campo('Instrucción', lio, 'El único encargo que habla en primera persona: el que se queja es el perro. También en tandas de cinco, una por línea. Se le dan los dos turnos de hoy, de quién son, cuáles quedaron sin marcar y los días seguidos que lleva saliendo. Conviene dejarle claro que se queja pero no riñe de verdad —quien lo lee es quien no marcó, y lo lee desayunando— y que no invente quién lo sacó, que eso es un dato. Vacío, vuelve el encargo de origen.'),

    el('div', { class: 'acciones' }, [guardar, probar]),
    el('p', {
      class: 'pista',
      texto: 'Guardar los guarda los seis. Probar usa el de contar el día, que es lo que comprueba que la clave y el modelo responden.',
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
  reiniciarHoy(); reiniciarAgenda(); reiniciarRegalos(); reiniciarSitios(); reiniciarFamilia();
  document.getElementById('aplicacion').hidden = true;
  mostrarAcceso();
}

/**
 * El estado de la sincronización, que era un punto en la cabecera.
 *
 * El punto se retiró de arriba: llevaba el estado en su color y estaba «al día»
 * el 99 % del tiempo, ocupando la esquina que peor alcanza el pulgar para no
 * contar nada. Aquí abajo puede decirlo con todas sus palabras.
 *
 * **La línea es a la vez el dato y el verbo**, igual que la de la versión: se
 * lee cuándo fue la última buena y, al tocarla, sincroniza contando por dónde
 * va. Un botón aparte diciendo «Sincronizar ahora» pediría sitio para algo que
 * la aplicación ya hace sola cada vez que se abre.
 *
 * Y la fecha va escrita en palabras —«hoy a las 14:03»— y no en cifras: es un
 * dato que se lee para tranquilizarse, y «hoy» tranquiliza de un vistazo
 * mientras que una fecha completa hay que descifrarla para llegar a lo mismo.
 */
/** Lo que se lleva al portapapeles: el motivo y lo mínimo que lo sitúa. */
function informeDelFallo(situacion) {
  return [
    `Agenda ${VERSION_APP} · ${TEXTO_SINCRONIZACION[situacion.estado] || situacion.estado}`,
    situacion.motivo || '(sin motivo)',
    // El mensaje tal cual lo dio el navegador, cuando no es el mismo que se
    // enseña: eso es lo que se busca en un motor y lo que reconoce quien pueda
    // arreglarlo. En la pantalla estorba; en lo que se pega, no.
    situacion.detalle && situacion.detalle !== situacion.motivo ? situacion.detalle : null,
    `API: ${configuracion.api || '(sin configurar)'}`,
    situacion.ultima ? `Última correcta: ${formatearHace(situacion.ultima)}` : 'Nunca ha llegado a sincronizar',
  ].filter(Boolean).join('\n');
}

function bloqueDeSincronizacion(dentro) {
  const progreso = el('ul', { class: 'progreso' });
  const linea = el('p', { class: 'pista' });
  const version = el('p', { class: 'pista' });

  const paso = (texto, estadoPaso) => el('li', { 'data-estado': estadoPaso }, [
    el('span', {
      class: 'progreso-marca',
      texto: { hecho: '✓', curso: '·', fallo: '×' }[estadoPaso] || '·',
    }),
    texto,
  ]);

  /**
   * El renglón del fallo, tocable para llevárselo.
   *
   * Un mensaje de TLS o un número de la API no se transcriben a mano desde un
   * teléfono, y son justo lo que hay que enseñarle a quien pueda arreglarlo. Se
   * copia el motivo con lo que lo sitúa —qué versión, contra qué API y cuándo
   * fue la última correcta—, que es lo que evita la ronda de preguntas
   * siguiente. El token no entra: no hace falta para nada de esto.
   */
  const pasoQueSeCopia = (texto, informe) => {
    const renglon = paso(texto, 'fallo');
    renglon.dataset.copiable = 'si';
    renglon.title = 'Tócalo para copiarlo';
    renglon.onclick = async () => {
      avisar(await copiar(informe) ? 'Copiado' : 'No se ha podido copiar');
    };
    return renglon;
  };

  const escribirLinea = () => {
    const situacion = estado();
    linea.textContent = situacion.ultima
      ? `Última actualización: ${formatearHace(situacion.ultima)}.`
      : 'Todavía no se ha podido actualizar.';
  };

  /**
   * Qué versión hay puesta.
   *
   * En el navegador no hay bundle que actualizar —la versión es la que sirva
   * Pages en cada recarga—, así que se dice y ya: prometer una comprobación que
   * solo puede contestar «aquí no hay nada que actualizar» sería ruido.
   */
  const escribirVersion = () => {
    if (!esNativo()) {
      version.textContent = 'Estás en la versión web, que se actualiza sola al recargar.';
      return;
    }
    version.textContent = 'Comprobando la versión…';
    versionInstalada().then((cual) => {
      version.textContent = cual ? `Versión instalada: ${cual}.` : 'Versión instalada: la de origen.';
    });
  };

  // Cada fase cierra la anterior, de modo que la lista se lee de arriba abajo
  // como lo que ha ido pasando y no como una promesa de lo que pasará.
  const RELATO = {
    comprobando: () => [paso('Buscando si hay versión nueva…', 'curso')],
    'al-dia': ({ version: cual }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Ya tienes lo último${cual ? ` (${cual})` : ''}`, 'hecho'),
    ],
    'hay-version': ({ version: cual }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${cual}`, 'hecho'),
    ],
    descargando: ({ version: cual, porcentaje }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${cual}`, 'hecho'),
      paso(
        porcentaje === undefined || porcentaje === null
          ? 'Descargando…'
          : `Descargando… ${Math.round(porcentaje)} %`,
        'curso',
      ),
    ],
    instalando: ({ version: cual }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Hay una versión nueva: ${cual}`, 'hecho'),
      paso('Descargada', 'hecho'),
      paso('Instalando…', 'curso'),
    ],
    descargada: ({ version: cual }) => [
      paso('Buscada la última versión', 'hecho'),
      paso(`Versión ${cual} instalada`, 'hecho'),
      paso('Se aplicará al volver a abrir la aplicación', 'hecho'),
    ],
    'sin-manifiesto': () => [paso('No he podido leer si hay versión nueva', 'fallo')],
    error: ({ detalle }) => [paso(`No he podido actualizar: ${detalle || 'error'}`, 'fallo')],
    'no-aplica': () => [],
  };

  /**
   * Un botón, y hace las tres en el orden que importa.
   *
   * Los datos primero, porque es lo que se suele querer decir y es de lo que se
   * pinta el punto; los viajes en medio, porque son datos también y llegan de
   * fuera; el bundle al final, porque es lo único que no se aplica hasta volver
   * a abrir. Todo en una sola lista, que se lee de arriba abajo como lo que ha
   * ido pasando.
   *
   * Lo que ya está escrito se conserva y lo nuevo se añade detrás: sin eso, cada
   * fase borraría el relato de la anterior y el botón contaría solo su último
   * tercio.
   */
  const boton = el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button' }, ['Comprobar ahora']);
  let ocupado = false;

  boton.onclick = async () => {
    if (ocupado) return;
    ocupado = true;
    boton.disabled = true;
    boton.textContent = 'Comprobando…';

    const contado = [];
    const contar = (...renglones) => {
      contado.push(...renglones);
      vaciar(progreso).append(...contado);
    };

    contar(paso('Subiendo lo pendiente y trayendo lo nuevo…', 'curso'));
    try {
      await sincronizar();
    } catch {
      /* el estado lo cuenta abajo, con su motivo */
    }
    const situacion = estado();
    contado.pop();
    if (situacion.estado === 'al-dia') {
      contar(paso('Subido lo que había pendiente', 'hecho'), paso('Traída y guardada la última copia', 'hecho'));
    } else {
      const dicho = situacion.motivo || TEXTO_SINCRONIZACION[situacion.estado] || situacion.estado;
      contar(pasoQueSeCopia(`No se ha podido: ${dicho}`, informeDelFallo(situacion)));
    }
    escribirLinea();

    // Los viajes solo los puede traer quien administra, porque la descarga la
    // hace el servidor y esta ruta es suya (`specs/calendario-viajes.md` §9).
    // A quien no lo sea no se le cuenta un renglón que no puede tener: no es un
    // error, sencillamente no está.
    if (puedeRefrescarViajes()) {
      contar(paso('Trayendo el calendario de viajes…', 'curso'));
      try {
        const resultado = await refrescarViajes();
        contado.pop();
        contar(paso(resumenDeViajes(resultado), 'hecho'));
      } catch (error) {
        contado.pop();
        contar(paso(`No se ha podido traer el calendario: ${error.message || 'error'}`, 'fallo'));
      }
    }

    // Y el bundle. En el navegador `comprobarActualizacion` contesta
    // `no-aplica` y su relato queda vacío, de modo que la última palabra la
    // tiene la sincronización.
    if (esNativo()) {
      const yaContado = contado.length;
      const pintar = (avance) => {
        const construir = RELATO[avance.fase];
        if (!construir) return;
        contado.length = yaContado;
        contar(...construir(avance));
      };
      const resultado = await comprobarActualizacion({ alAvanzar: pintar });
      pintar(resultado);
      if (resultado.estado === 'descargada') escribirVersion();
    }

    ocupado = false;
    boton.disabled = false;
    boton.textContent = 'Comprobar ahora';
  };

  escribirLinea();
  escribirVersion();
  dentro.append(linea, version, boton, progreso);
}

/** Lo que trajo la descarga, en un renglón. Sin cambios se dice, que es lo más
 *  frecuente y es una respuesta tan buena como cualquier otra. */
function resumenDeViajes(resultado) {
  if (resultado?.estado !== 'ok') return `Calendario de viajes: ${resultado?.estado || 'sin respuesta'}`;
  const cambios = (resultado.altas || 0) + (resultado.cambios || 0) + (resultado.bajas || 0);
  return cambios
    ? `Calendario de viajes: ${resultado.altas || 0} nuevos, ${resultado.cambios || 0} cambios, ${resultado.bajas || 0} retirados`
    : 'Calendario de viajes: sin cambios';
}

/** Si esta persona puede disparar la descarga del calendario de viajes. */
function puedeRefrescarViajes() {
  return sesionActual?.persona?.rol === 'administrador' && estado().estado !== 'demostracion';
}

function aplicarTema(valor) {
  localStorage.setItem('agenda.tema', valor);
  if (valor === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', valor);
}

aplicarTema(localStorage.getItem('agenda.tema') || 'auto');
