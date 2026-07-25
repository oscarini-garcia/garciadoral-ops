/**
 * Arranque y navegación.
 *
 * La arquitectura es la opción D de `specs/ux.md`: la semana abre la
 * aplicación, la coordinación de regalos vive en su propia pestaña —se visita
 * con intención, no de paso— y la ficha de persona de la opción C hace de
 * pantalla de detalle dentro de Familia.
 *
 * El botón de crear pertenece a la pantalla y no a la aplicación: su acción
 * depende de dónde esté quien lo pulsa. Un botón genérico obligaría a elegir el
 * tipo antes de escribir, que es justo la fricción que la captura rápida trata
 * de evitar.
 */

import { el, vaciar, abrirHoja, cerrarHoja, avisar, campo, seleccion } from './ui.js';
import { borrarSesion, guardarSesion, leerSesion, olvidarTodo } from './almacen.js';
import { crearVista } from './modelo.js';
import { detener, estado, iniciar, instantanea, sincronizar, suscribir } from './sincronizacion.js';
import {
  cargarConfiguracion,
  codigoDeAutorizacion,
  eliminarLaCuenta,
  entrarConApple,
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
import { hoy, instanciasEn, sumarDias } from './semana.js';
import { abrirFormularioEvento, pintarAgenda, reiniciarAgenda } from './vistas/semana.js';
import { abrirCapturaDeIdea, pintarRegalos, reiniciarRegalos } from './vistas/regalos.js';
import { pintarFamilia } from './vistas/familia.js';
import { pintarBuscar, reiniciarBusqueda } from './vistas/buscar.js';

const PESTANAS = {
  semana: { titulo: 'Semana', pintar: pintarAgenda, fab: (ctx) => abrirFormularioEvento(ctx) },
  regalos: { titulo: 'Regalos', pintar: pintarRegalos, fab: (ctx) => abrirCapturaDeIdea(ctx) },
  familia: { titulo: 'Familia', pintar: pintarFamilia, fab: (ctx) => abrirCapturaDeIdea(ctx) },
  // En las pantallas sin acción de creación el botón no aparece.
  buscar: { titulo: 'Buscar', pintar: pintarBuscar, fab: null },
};

let pestana = 'semana';
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
  const acceso = document.getElementById('acceso');
  acceso.hidden = false;

  const aviso = document.getElementById('accesoAviso');
  aviso.hidden = !mensaje;
  if (mensaje) aviso.textContent = mensaje;

  const boton = document.getElementById('botonApple');
  boton.onclick = async () => {
    try {
      const { token, persona } = await entrarConApple(configuracion);
      // Se descarta cualquier instantánea anterior: el almacén local pertenece
      // a un titular concreto y no debe sobrevivir a un cambio de persona.
      await olvidarTodo();
      guardarSesion({ token, persona });
      acceso.hidden = true;
      await arrancarAplicacion({ token, persona });
    } catch (error) {
      mostrarAcceso(
        error.identificador
          ? `${error.message} El identificador que hay que vincular es ${error.identificador}.`
          : error.message,
      );
    }
  };
  boton.onkeydown = (evento) => { if (evento.key === 'Enter' || evento.key === ' ') boton.click(); };

  document.getElementById('botonDemo').onclick = () => elegirObservadorDemo();
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
          guardarSesion({ demostracion: true, observador: persona.id });
          document.getElementById('acceso').hidden = true;
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

  suscribir((datos, situacion) => {
    if (situacion.estado === 'sesion-caducada') {
      borrarSesion();
      mostrarAcceso('La sesión ha caducado. Vuelve a entrar.');
      return;
    }
    pintarIndicador(situacion);
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
  programarRecordatorios(instancias);
}

// -------------------------------------------------------------- Pintado --

function refrescar() {
  const datos = instantanea();
  if (!datos) return;

  ctx.vista = crearVista(datos);
  const definicion = PESTANAS[pestana];

  document.getElementById('tituloPantalla').textContent = definicion.titulo;
  document.getElementById('fab').hidden = !definicion.fab;

  definicion.pintar(
    document.getElementById('pantalla'),
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

function pintarIndicador(situacion) {
  const indicador = document.getElementById('indicadorSync');
  indicador.dataset.estado = situacion.estado;
  document.getElementById('syncTexto').textContent = TEXTO_SINCRONIZACION[situacion.estado] || situacion.estado;
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
  abrirHoja('Ajustes', (cuerpo) => {
    if (sesionActual?.persona?.nombre) {
      cuerpo.append(el('p', {
        class: 'pista',
        texto: `Sesión iniciada como ${sesionActual.persona.nombre}.`,
      }));
    }

    const tema = seleccion(
      [{ valor: 'auto', texto: 'Como el sistema' }, { valor: 'claro', texto: 'Claro' }, { valor: 'oscuro', texto: 'Oscuro' }],
      localStorage.getItem('agenda.tema') || 'auto',
    );
    tema.addEventListener('change', () => aplicarTema(tema.value));
    cuerpo.append(campo('Aspecto', tema));

    cuerpo.append(bloqueDeVersion());
    cuerpo.append(bloqueLegal());

    const demostracion = estado().estado === 'demostracion';
    cuerpo.append(el('div', { class: 'acciones' }, [
      el('button', {
        class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
        onclick: () => salir(),
      }, [demostracion ? 'Salir de la demostración' : 'Cerrar sesión']),
    ]));

    // La baja no está en la demostración porque allí no hay cuenta que dar de
    // baja: nada de lo que se ve ha salido nunca de este navegador.
    if (!demostracion) {
      cuerpo.append(el('button', {
        class: 'enlace-discreto', type: 'button',
        onclick: () => confirmarBaja(),
      }, ['Eliminar mi cuenta']));
    }
  });
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
    enlace('/privacidad.html', 'Privacidad'),
    ' · ',
    enlace('/soporte.html', 'Ayuda y contacto'),
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
  reiniciarAgenda(); reiniciarRegalos(); reiniciarBusqueda();
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
