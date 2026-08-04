/**
 * Los dos «no» que el portero sabe decir, como clases y no como texto.
 *
 * `index.js` convierte cada clase en su código HTTP. Antes esa conversión era
 * una expresión regular sobre el mensaje —`/sesión|token|firma/`— y clasificó
 * como avería un fallo de credencial y al revés más de una vez: un error que no
 * llevaba la palabra justa salía como 500. Una clase no depende de cómo esté
 * redactada la frase.
 */

/** Una credencial que no vale: mal formada, caducada, de otro tipo o de nadie.
 *  Responde 401, que es «vuelve a identificarte». */
export class SinCredencial extends Error {}

/**
 * Un «no» previsible que no es una avería: la sala de espera llena, una
 * solicitud que el otro administrador acaba de resolver, una persona que ya
 * tiene cuenta. Responde 409, y quien llama puede enseñar el mensaje tal cual.
 *
 * Es la única clase de error que comparten el portero y la aplicación: también
 * el repositorio del hogar dice «no» con ella, para que un solo `instanceof`
 * en `index.js` los reconozca a todos.
 */
export class Rechazo extends Error {}
