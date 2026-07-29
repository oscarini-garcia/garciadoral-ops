/**
 * Almacén local. Toda lectura y escritura de la aplicación pasa por aquí.
 *
 * El modelo es local-first: la interfaz no espera nunca a la red, porque una
 * aplicación que hace esperar sin red se percibe como averiada (specs/ux.md §1).
 * Lo que llega del servidor es una instantánea **ya filtrada** para el titular
 * del dispositivo; aquí no se guarda jamás nada que no venga en ella, de modo
 * que un elemento que deja de corresponderle desaparece del almacén en la
 * siguiente sincronización.
 */

const BASE = 'agenda-familiar';
const VERSION = 1;

let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((resolver, rechazar) => {
    const peticion = indexedDB.open(BASE, VERSION);
    peticion.onupgradeneeded = () => {
      const bd = peticion.result;
      if (!bd.objectStoreNames.contains('documentos')) bd.createObjectStore('documentos');
      if (!bd.objectStoreNames.contains('cola')) {
        bd.createObjectStore('cola', { keyPath: 'orden', autoIncrement: true });
      }
    };
    peticion.onsuccess = () => resolver(peticion.result);
    peticion.onerror = () => rechazar(peticion.error);
  });
  return conexion;
}

function transaccion(almacenes, modo, trabajo) {
  return abrir().then(
    (bd) =>
      new Promise((resolver, rechazar) => {
        const tx = bd.transaction(almacenes, modo);
        let resultado;
        try {
          resultado = trabajo(tx);
        } catch (error) {
          rechazar(error);
          return;
        }
        tx.oncomplete = () => resolver(resultado?.result ?? resultado);
        tx.onerror = () => rechazar(tx.error);
        tx.onabort = () => rechazar(tx.error);
      }),
  );
}

// -------------------------------------------------------------- Documentos --

export function guardarDocumento(clave, valor) {
  return transaccion(['documentos'], 'readwrite', (tx) =>
    tx.objectStore('documentos').put(valor, clave),
  );
}

export function leerDocumento(clave) {
  return transaccion(['documentos'], 'readonly', (tx) => tx.objectStore('documentos').get(clave));
}

export const guardarInstantanea = (instantanea) => guardarDocumento('instantanea', instantanea);
export const leerInstantanea = () => leerDocumento('instantanea');

// -------------------------------------------------------------------- Cola --

/**
 * Cola de cambios pendientes de subir. Sobrevive al cierre de la aplicación y
 * a los cortes de red: es la mitad local del flujo de sincronización.
 */
export function encolarCambio(cambio) {
  return transaccion(['cola'], 'readwrite', (tx) => tx.objectStore('cola').add(cambio));
}

export function leerCola() {
  return transaccion(['cola'], 'readonly', (tx) => tx.objectStore('cola').getAll());
}

export function vaciarCola(hastaOrden) {
  return transaccion(['cola'], 'readwrite', (tx) => {
    const almacen = tx.objectStore('cola');
    const cursor = almacen.openCursor();
    cursor.onsuccess = () => {
      const actual = cursor.result;
      if (!actual) return;
      if (actual.value.orden <= hastaOrden) actual.delete();
      actual.continue();
    };
  });
}

export function olvidarTodo() {
  // Los últimos elegidos son de quien tiene la sesión, igual que la
  // instantánea: cambiar de persona en este dispositivo no puede dejarlos. Y las
  // frases del día, por lo mismo: están escritas para quien se va.
  olvidarUltimos();
  try {
    localStorage.removeItem(CLAVE_CHISPA);
  } catch {
    /* nada que hacer */
  }
  return transaccion(['documentos', 'cola'], 'readwrite', (tx) => {
    tx.objectStore('documentos').clear();
    tx.objectStore('cola').clear();
  });
}

// ------------------------------------------------------------- Preferencias --

const CLAVE_SESION = 'agenda.sesion';

export function guardarSesion(sesion) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
}

export function leerSesion() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_SESION) || 'null');
  } catch {
    return null;
  }
}

export function borrarSesion() {
  localStorage.removeItem(CLAVE_SESION);
}

// ------------------------------------------------ Últimos elegidos, por uso --

const PREFIJO_ULTIMOS = 'agenda.ultimos.';
const CUANTOS_ULTIMOS = 12;

/**
 * A quiénes se ha elegido últimamente en este teléfono, para cada cosa.
 *
 * Se guardan aquí y no en el registro porque son de quien usa el aparato y no
 * del hogar: si esta semana andas con el regalo de un sobrino, es tu semana y
 * no la de los demás. Y van separados por uso —los regalos por un lado, los
 * eventos por otro— porque a quien se le apuntan regalos y quien va a los
 * planes no son la misma gente, y mezclarlos daría sugerencias peores en los
 * dos sitios.
 *
 * Se conservan más de los que se enseñan, para que quitar a alguien de la lista
 * no deje un hueco.
 */
export function ultimosElegidos(clave) {
  try {
    const guardados = JSON.parse(localStorage.getItem(PREFIJO_ULTIMOS + clave) || '[]');
    return Array.isArray(guardados) ? guardados.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Los recién usados pasan al principio, sin repetirse. */
export function recordarElegidos(clave, ids = []) {
  const utiles = ids.filter(Boolean);
  if (!utiles.length) return;
  const lista = [...new Set([...utiles, ...ultimosElegidos(clave)])].slice(0, CUANTOS_ULTIMOS);
  try {
    localStorage.setItem(PREFIJO_ULTIMOS + clave, JSON.stringify(lista));
  } catch {
    /* sin sitio en el almacén local, la lista se queda como estaba */
  }
}

function olvidarUltimos() {
  for (const clave of Object.keys(localStorage)) {
    if (clave.startsWith(PREFIJO_ULTIMOS)) localStorage.removeItem(clave);
  }
}

// ----------------------------------------------------- Las frases de este día --

const CLAVE_CHISPA = 'agenda.chispa';

/**
 * Las frases del día, con el día al que pertenecen y por cuál se va.
 *
 * Aquí y no en el registro porque no son del hogar: cada uno recibe las suyas,
 * compuestas de lo que ese uno puede ver. Y con la fecha dentro en lugar de una
 * clave por día, que es lo que hace que no haya nada que barrer: las de ayer no
 * se borran, se dejan de reconocer.
 *
 * Vienen de cinco en cinco y se enseñan de una en una, así que hay que guardar
 * también por dónde va: sin el índice, cerrar la aplicación volvería a la
 * primera y las cuatro restantes no se verían nunca.
 *
 * Es un capricho, así que no se defiende de nada: sin sitio en el almacén se
 * pierden y al día siguiente se vuelven a pedir.
 */
export function chispaGuardada(fecha) {
  try {
    const guardada = JSON.parse(localStorage.getItem(CLAVE_CHISPA) || 'null');
    if (!guardada || guardada.fecha !== fecha) return null;
    const frases = (guardada.frases || []).filter((f) => typeof f === 'string' && f);
    if (!frases.length) return null;
    const cual = Number.isInteger(guardada.cual) ? guardada.cual : 0;
    return { frases, cual: Math.min(Math.max(cual, 0), frases.length - 1) };
  } catch {
    return null;
  }
}

export function guardarChispa(fecha, frases, cual = 0) {
  try {
    localStorage.setItem(CLAVE_CHISPA, JSON.stringify({ fecha, frases, cual }));
  } catch {
    /* sin sitio, mañana se vuelven a pedir */
  }
}
