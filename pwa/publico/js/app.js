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

import { el, abrirHoja, cerrarHoja, avisar, campo, seleccion } from './ui.js';
import { borrarSesion, guardarSesion, leerSesion, olvidarTodo } from './almacen.js';
import { crearVista } from './modelo.js';
import { estado, iniciar, instantanea, sincronizar, suscribir } from './sincronizacion.js';
import { cargarConfiguracion, entrarConApple } from './sesion.js';
import { cargarRegistroDemo, componerDemo } from './demo.js';
import { comprobarActualizacion, esNativo, iniciarNativo, toque, versionInstalada } from './native.js';
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

  suscribir((datos, situacion) => {
    if (situacion.estado === 'sesion-caducada') {
      borrarSesion();
      mostrarAcceso('La sesión ha caducado. Vuelve a entrar.');
      return;
    }
    pintarIndicador(situacion);
    if (datos) refrescar();
  });

  refrescar();
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

    const tema = seleccion(
      [{ valor: 'auto', texto: 'Como el sistema' }, { valor: 'claro', texto: 'Claro' }, { valor: 'oscuro', texto: 'Oscuro' }],
      localStorage.getItem('agenda.tema') || 'auto',
    );
    tema.addEventListener('change', () => aplicarTema(tema.value));
    cuerpo.append(campo('Aspecto', tema));

    if (esNativo()) cuerpo.append(bloqueDeVersion());

    cuerpo.append(el('div', { class: 'acciones' }, [
      situacion.estado === 'demostracion' ? null : el('button', {
        class: 'boton crecer', type: 'button',
        onclick: async () => { await sincronizar(); avisar('Sincronizado'); },
      }, ['Sincronizar ahora']),
      el('button', {
        class: 'boton', 'data-tono': 'peligro', type: 'button',
        onclick: async () => {
          await olvidarTodo();
          borrarSesion();
          reiniciarAgenda(); reiniciarRegalos(); reiniciarBusqueda();
          cerrarHoja();
          location.reload();
        },
      }, [situacion.estado === 'demostracion' ? 'Salir de la demostración' : 'Cerrar sesión']),
    ]));
  });
}

/**
 * Versión instalada y comprobación manual, solo dentro de la cáscara.
 *
 * La comprobación automática ya ocurre al arrancar; este botón existe para
 * poder forzarla cuando alguien pregunta si tiene lo último. La actualización
 * se aplica al volver a abrir la aplicación, nunca a media sesión.
 */
function bloqueDeVersion() {
  const linea = el('p', { class: 'pista', texto: 'Comprobando la versión…' });
  versionInstalada().then((version) => {
    linea.textContent = version ? `Versión instalada: ${version}.` : 'Versión instalada: la de origen.';
  });

  const boton = el('button', {
    class: 'boton', 'data-tono': 'discreto', type: 'button',
    onclick: async () => {
      boton.disabled = true;
      const resultado = await comprobarActualizacion();
      boton.disabled = false;
      avisar({
        descargada: 'Actualización lista: se aplicará al volver a abrir.',
        'al-dia': 'Ya tienes la última versión.',
        'sin-manifiesto': 'No he podido leer si hay versión nueva.',
        error: 'No he podido comprobarlo.',
        'no-aplica': 'Aquí no hay nada que actualizar.',
      }[resultado.estado] || resultado.estado);
    },
  }, ['Buscar actualización']);

  return el('div', { class: 'grupo' }, [
    el('p', { class: 'grupo-titulo', texto: 'Aplicación' }),
    linea,
    boton,
  ]);
}

function aplicarTema(valor) {
  localStorage.setItem('agenda.tema', valor);
  if (valor === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', valor);
}

aplicarTema(localStorage.getItem('agenda.tema') || 'auto');
