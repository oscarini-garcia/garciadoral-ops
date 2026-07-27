/**
 * La versión de la aplicación, escrita donde la web puede leerla.
 *
 * La cifra de verdad vive en `pwa/package.json`: es la que `ota.yml` mira para
 * decidir si corta un bundle nuevo, y por tanto la que identifica lo que hay
 * instalado. Pero aquí no hay empaquetador que la inyecte —son módulos ES
 * servidos tal cual—, así que la pantalla de Hoy no tendría manera de nombrarla.
 *
 * Se copia a mano y la copia la vigila `tests/test_version.py`, que falla si las
 * dos dejan de coincidir. Es lo mismo que se hace con `VERSION` en `sw.js`: dos
 * sitios que hay que subir a la vez y un guardián que no deja olvidarlo.
 *
 * Dentro de la cáscara esta es la versión **de origen**, la que venía en el
 * binario. Si hay un bundle OTA aplicado encima, quien manda es el suyo y lo
 * dice `versionInstalada()` en `native.js`.
 */

export const VERSION_APP = '1.24.0';
