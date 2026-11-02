/**
 * Los adjuntos de una idea o un regalo: hacer una foto, elegirla del carrete o
 * adjuntar un PDF, y verlos.
 *
 * Una foto se reduce aquí antes de subirla —1600 puntos de lado, JPEG— y lleva
 * su miniatura de 320 aparte, porque una foto del iPhone pesa varios megas y
 * la base no las guarda de ese tamaño (`api/src/adjuntos.js`). Subir necesita
 * red: los bytes no van por la cola de cambios. Quitar sí va por ella.
 */

import { abrirHoja, avisar, botonIcono, cerrarHoja, el, icono } from './ui.js';
import { quitarAdjunto, subirAdjunto, urlDeAdjunto } from './sincronizacion.js';
import { esNativo, fotoNativa, hayCamaraNativa, toque } from './native.js';

const LADO_FOTO = 1600;
const LADO_MINIATURA = 320;
const TOPE_PDF = 1_200_000;

/** Los adjuntos activos de un objeto, del más antiguo al más nuevo. */
export function adjuntosDe(datos, objetoTipo, objetoId) {
  return (datos.adjuntos || [])
    .filter((a) => a.objeto_tipo === objetoTipo && a.objeto_id === objetoId && a.activo !== false && a.activo !== 0)
    .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
}

const comoBase64 = (blob) => new Promise((resolver, fallar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(String(lector.result).split(',')[1] || '');
  lector.onerror = () => fallar(lector.error);
  lector.readAsDataURL(blob);
});

function cargarImagen(archivo) {
  return new Promise((resolver, fallar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => { URL.revokeObjectURL(url); resolver(imagen); };
    imagen.onerror = () => { URL.revokeObjectURL(url); fallar(new Error('no se puede leer la foto')); };
    imagen.src = url;
  });
}

/** La imagen dibujada a un lado máximo, como JPEG en base64. */
function reducir(imagen, lado, calidad) {
  const escala = Math.min(1, lado / Math.max(imagen.naturalWidth, imagen.naturalHeight));
  const ancho = Math.max(1, Math.round(imagen.naturalWidth * escala));
  const alto = Math.max(1, Math.round(imagen.naturalHeight * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d').drawImage(imagen, 0, 0, ancho, alto);
  return new Promise((resolver, fallar) => {
    lienzo.toBlob(async (blob) => {
      if (!blob) { fallar(new Error('no se puede preparar la foto')); return; }
      resolver({ datos: await comoBase64(blob), ancho, alto });
    }, 'image/jpeg', calidad);
  });
}

/** Lo que se sube de un archivo: una foto reducida con su miniatura, o un PDF tal cual. */
export async function prepararArchivo(archivo) {
  if (archivo.type === 'application/pdf') {
    if (archivo.size > TOPE_PDF) throw new Error('el PDF pasa de 1,2 MB');
    return { nombre: archivo.name, tipo_mime: 'application/pdf', datos: await comoBase64(archivo) };
  }
  if (!String(archivo.type).startsWith('image/')) throw new Error('se adjuntan fotos y PDF');
  const imagen = await cargarImagen(archivo);
  const foto = await reducir(imagen, LADO_FOTO, 0.82);
  const miniatura = await reducir(imagen, LADO_MINIATURA, 0.7);
  return {
    nombre: archivo.name || 'Foto', tipo_mime: 'image/jpeg', datos: foto.datos, miniatura: miniatura.datos,
    ancho: foto.ancho, alto: foto.alto,
  };
}

/** Una foto que llega del plugin nativo, en base64: se le hace la miniatura. */
async function prepararFotoNativa({ base64 }) {
  const imagen = await new Promise((resolver, fallar) => {
    const i = new Image();
    i.onload = () => resolver(i);
    i.onerror = () => fallar(new Error('no se puede leer la foto'));
    i.src = `data:image/jpeg;base64,${base64}`;
  });
  const foto = await reducir(imagen, LADO_FOTO, 0.82);
  const miniatura = await reducir(imagen, LADO_MINIATURA, 0.7);
  return { nombre: 'Foto', tipo_mime: 'image/jpeg', datos: foto.datos, miniatura: miniatura.datos, ancho: foto.ancho, alto: foto.alto };
}

/** Un `<input type="file">` escondido que se abre con un botón. `camara`
 *  pide la cámara trasera directamente. */
function selector({ camara, alElegir, soloPdf = false }) {
  const entrada = el('input', {
    type: 'file', hidden: true,
    accept: soloPdf ? 'application/pdf' : camara ? 'image/*' : 'image/*,application/pdf',
    ...(camara ? { capture: 'environment' } : { multiple: true }),
  });
  entrada.addEventListener('change', () => {
    const archivos = [...(entrada.files || [])];
    entrada.value = '';
    if (archivos.length) alElegir(archivos);
  });
  return entrada;
}

/**
 * La fila de adjuntos dentro de la hoja de una idea o un regalo: las
 * miniaturas y, detrás, «Hacer foto» y «Adjuntar». Sin rótulo, como los
 * comentarios: si no hay nada, son solo los dos botones.
 */
export function bloqueDeAdjuntos(objetoTipo, objetoId, ctx) {
  const nodo = el('div', { class: 'adjuntos' });
  const tira = el('div', { class: 'adjuntos-tira' });

  const pintarTira = () => {
    tira.replaceChildren(...adjuntosDe(ctx.vista.datos, objetoTipo, objetoId).map((a) => miniatura(a, ctx)));
  };

  // Cada cosa que se sube es una promesa de lo que hay que mandar: un archivo
  // del selector o una foto del plugin nativo.
  const subir = async (pendientes) => {
    for (const preparar of pendientes) {
      const marca = el('span', { class: 'adjunto adjunto-subiendo', 'aria-label': 'Subiendo' });
      tira.append(marca);
      try {
        const preparado = await preparar();
        await subirAdjunto({ objeto_tipo: objetoTipo, objeto_id: objetoId, ...preparado });
        toque();
      } catch (error) {
        avisar(`No se ha podido adjuntar: ${error.message || error}`);
      }
      marca.remove();
      pintarTira();
    }
  };

  const deArchivos = (archivos) => subir(archivos.map((a) => () => prepararArchivo(a)));
  const boton = (dibujo, texto, accion) => el('button', {
    class: 'boton-mini adjuntos-boton', type: 'button', onclick: accion,
  }, [icono(dibujo), el('span', { texto })]);

  // Tres casos. En el navegador, los selectores de archivo de siempre. En la
  // app de iPhone con el plugin de la cámara, la cámara y el carrete nativos,
  // y los PDF por el selector de archivos. Y en una app anterior, sin los
  // permisos declarados, **solo PDF**: el selector de fotos de iOS ofrece hacer
  // una, y sin el permiso eso cierra la aplicación.
  const verbos = el('div', { class: 'adjuntos-verbos' });
  if (!esNativo()) {
    const camara = selector({ camara: true, alElegir: deArchivos });
    const archivo = selector({ camara: false, alElegir: deArchivos });
    verbos.append(
      boton('camara', 'Hacer foto', () => camara.click()),
      boton('clip', 'Adjuntar', () => archivo.click()),
      camara, archivo,
    );
  } else {
    const pdf = selector({ camara: false, soloPdf: true, alElegir: deArchivos });
    const nativa = (origen) => async () => {
      const foto = await fotoNativa(origen);
      if (foto) subir([() => prepararFotoNativa(foto)]);
    };
    if (hayCamaraNativa()) {
      verbos.append(
        boton('camara', 'Hacer foto', nativa('camara')),
        boton('clip', 'Del carrete', nativa('carrete')),
      );
    }
    verbos.append(boton('clip', 'PDF', () => pdf.click()), pdf);
    if (!hayCamaraNativa()) {
      verbos.append(el('p', { class: 'pista', texto: 'Las fotos llegan con la próxima versión de la app de iPhone.' }));
    }
  }
  pintarTira();
  nodo.append(tira, verbos);
  return nodo;
}

function miniatura(adjunto, ctx) {
  const esPdf = adjunto.tipo_mime === 'application/pdf';
  const boton = el('button', {
    class: 'adjunto', type: 'button', 'aria-label': adjunto.nombre || (esPdf ? 'PDF' : 'Foto'),
    onclick: () => { toque(); abrirAdjunto(adjunto, ctx); },
  }, [esPdf ? el('span', { class: 'adjunto-pdf', texto: 'PDF' }) : null].filter(Boolean));
  if (!esPdf) {
    urlDeAdjunto(adjunto.id, { miniatura: true })
      .then((url) => { if (url) boton.style.backgroundImage = `url("${url}")`; })
      .catch(() => boton.classList.add('adjunto-fallido'));
  }
  return boton;
}

/** La foto a pantalla completa, o el PDF en otra ventana. Quitar, para quien
 *  la subió o un administrador. */
async function abrirAdjunto(adjunto, ctx) {
  const yo = ctx.vista.yo;
  const puedeQuitar = adjunto.autor_id === yo.id || yo.rol === 'administrador';
  if (adjunto.tipo_mime === 'application/pdf') {
    try {
      window.open(await urlDeAdjunto(adjunto.id), '_blank', 'noopener');
    } catch {
      avisar('No se ha podido abrir el PDF');
    }
    return;
  }
  const imagen = el('img', { class: 'adjunto-grande', alt: adjunto.nombre || 'Foto' });
  urlDeAdjunto(adjunto.id).then((url) => { imagen.src = url; }).catch(() => avisar('No se ha podido cargar la foto'));
  const autor = ctx.vista.persona(adjunto.autor_id);
  abrirHoja(adjunto.nombre && adjunto.nombre !== 'Foto' && !/^image\./i.test(adjunto.nombre) ? adjunto.nombre : 'Foto', (cuerpo) => {
    cuerpo.append(imagen);
    if (autor) cuerpo.append(el('p', { class: 'pista', texto: `La puso ${autor.apodo || autor.nombre}` }));
  }, [
    puedeQuitar ? botonIcono('borrar', {
      etiqueta: 'Quitar la foto', tono: 'peligro',
      onclick: () => abrirHoja('¿Quitar esta foto?', (cuerpo) => {
        cuerpo.append(
          el('p', { class: 'pista', texto: 'Deja de verse en la idea o el regalo para todos.' }),
          el('div', { class: 'acciones' }, [
            el('button', {
              class: 'boton crecer', 'data-tono': 'peligro', type: 'button',
              onclick: async () => { await quitarAdjunto(adjunto.id); toque('media'); cerrarHoja(); ctx.refrescar(); },
            }, ['Quitar']),
            el('button', { class: 'boton', 'data-tono': 'discreto', type: 'button', onclick: cerrarHoja }, ['Cancelar']),
          ]),
        );
      }),
    }) : null,
  ]);
}
