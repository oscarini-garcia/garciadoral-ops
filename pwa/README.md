# Agenda Familiar — aplicación web

PWA instalable, sin proceso de compilación: módulos ES nativos, CSS propio y
service worker. Lo que se publica es literalmente el contenido de `publico/`.

La arquitectura es la **opción D** de `specs/ux.md`: la semana abre la
aplicación, los regalos viven en su propia pestaña y la ficha de persona de la
opción C hace de pantalla de detalle dentro de Familia.

## Probarla en local

```bash
python3 herramientas/preparar-pwa.py     # iconos y registro de demostración
npx http-server pwa/publico -p 8788 -c-1
```

Abra `http://127.0.0.1:8788` y pulse **Ver una demostración con datos de
ejemplo**. Se elige con los ojos de quién se mira: entrando como Ana el jueves
23 aparece «Ver el sitio para la fiesta», y entrando como Marta ese día está
vacío. Es la misma semana y son dos semanas distintas.

En la demostración el recorte lo hace el navegador porque no hay servidor con el
que hablar. **No es el modelo de seguridad**: en la aplicación real el filtrado
ocurre en el Worker, antes de transmitir, y el dispositivo nunca llega a recibir
lo que su titular no puede ver. La copia de la función de visibilidad de
`js/demo.js` existe solo para que la demostración enseñe lo que se verá.

## Cómo está organizada

```
publico/
  index.html            · armazón: acceso, cabecera, pantalla, pestañas
  config.json           · API y Services ID de Apple; se lee en caliente
  manifest.webmanifest  · instalación
  sw.js                 · caché del armazón; la API nunca se cachea
  _headers              · cabeceras de Cloudflare Pages
  css/estilos.css       · dos temas completos, no una inversión del claro
  js/
    app.js              · arranque, pestañas y botón de crear contextual
    sesion.js           · Sign in with Apple en la web
    almacen.js          · IndexedDB: instantánea y cola de cambios
    sincronizacion.js   · escritura optimista y subida diferida
    modelo.js           · consultas sobre la instantánea
    semana.js           · semana, recurrencias y eventos de varios días
    demo.js             · solo para la demostración
    vistas/             · semana · regalos · familia · buscar
  demo/, iconos/        · generados por herramientas/preparar-pwa.py
```

## Decisiones que conviene conocer

**La instantánea se sustituye entera.** El servidor devuelve todo lo que su
titular puede ver y el cliente reemplaza su almacén con ello. Es lo que hace que
la retirada retroactiva funcione sola: cuando alguien pasa a ser destinatario de
algo que ya tenía sincronizado, la siguiente respuesta no lo trae y desaparece
de su dispositivo. A escala de un hogar —unos cientos de filas— sale más barato
que un delta y no deja huecos por los que un elemento retirado sobreviva.

**El aviso «Por aquí no se mira» se genera en el dispositivo** a partir de una
condición estática: ¿va este evento de mí? Nunca de un recuento recibido del
servidor, que sería por sí mismo el dato que se pretende ocultar.

**El service worker no cachea la API.** Guardar respuestas de `/api/` sería
guardar una instantánea filtrada para un titular en un almacén que no distingue
titulares. Lo que se cachea es el armazón; los datos viven en IndexedDB.

**El botón de crear pertenece a la pantalla.** En la semana crea un evento, en
Regalos y en Familia apunta una idea, y en Buscar no aparece.

## Despliegue

Consulte `docs/despliegue-cloudflare.md`. En resumen: un proyecto de Cloudflare
Pages con directorio de salida `pwa/publico`, `config.json` apuntando al Worker
y al Services ID de Apple, y el dominio de la PWA declarado en
`ORIGENES_PERMITIDOS` del Worker.
