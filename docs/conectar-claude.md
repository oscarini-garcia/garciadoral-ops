# Conectar Claude a la agenda

La agenda se ofrece a Claude como un servidor MCP. Con él conectado, desde una
conversación se consulta la agenda, se apuntan cosas y se cambian, se borran, se
marcan y se comentan, como desde el teléfono:

- «El miércoles que viene, médico de Lío.»
- «Apunta para Ana una idea de regalo: un bolso.»
- «Apunta para Llivia llevar un ladrón blanco de dos enchufes.»
- «¿Qué tenemos esta semana? ¿A quién le toca sacar a Lío el sábado?»
- «El médico de Lío pásalo a las cinco.» «Esta semana no hay hípica el jueves.»
- «Ya he metido el ladrón en la maleta.» «He sacado a Lío esta mañana.»

Cada persona tiene **su propio enlace**, y Claude trabaja con la cuenta de quien
lo creó: ve lo que esa cuenta ve y escribe lo que esa cuenta puede escribir, ni
más ni menos. Una idea de regalo para Ana no sale nunca por el enlace de Ana.

---

## 1. Lo que hace falta desplegar

Nada a mano. Al mergear, el workflow `desplegar la API` aplica la migración
`0030_enlace_mcp.sql` y sube el Worker; la aplicación recibe el apartado nuevo de
Ajustes por la web y por OTA (versión **1.97.0**). No hay secretos nuevos: la
firma de los enlaces usa `SESION_SECRETO`, el mismo de las sesiones.

Cambiar, borrar, marcar y comentar llegaron después, en el Worker y sin
migración: basta con que se despliegue la API. La aplicación pasa a la **1.98.0**
solo por los textos de Ajustes y por la tarjeta de Novedades. Un conector ya
añadido no hay que volver a añadirlo: las herramientas nuevas aparecen al abrir
una conversación nueva.

---

## 2. Crear el enlace propio

En la aplicación: **Ajustes › Claude › Crear mi enlace**. Sale una dirección así:

```
https://agenda-familiar-api.oscarini.workers.dev/mcp/<credencial>
```

- **Copiar** la deja en el portapapeles; **Compartir** sirve para llevarla al
  ordenador —por AirDrop, por ejemplo—, que es donde se añade el conector.
- Debajo dice si Claude la ha usado ya, y cuándo por última vez.
- **Hacer otro** crea uno nuevo y anula el anterior en el acto; **Quitar** lo anula
  sin crear otro. Las dos preguntan antes.

Cada uno crea el suyo desde su teléfono. Un administrador no crea enlaces para
otros: el enlace es una credencial, y la tiene que tener solo su dueño.

---

## 3. Añadirlo en Claude

### En claude.ai y en Claude Desktop

1. **Configuración › Conectores** (en inglés, *Settings › Connectors*).
2. **Añadir conector personalizado** (*Add custom connector*).
3. Nombre: `Agenda`. URL: el enlace copiado. No hace falta rellenar nada en
   *Opciones avanzadas*: el enlace ya lleva la credencial.
4. **Añadir**. En una conversación, el conector se activa o desactiva desde el
   menú de herramientas del cuadro de texto.

Lo añadido en claude.ai está también en Claude Desktop y, una vez añadido desde
la web o el escritorio, en la aplicación del móvil.

En el plan gratuito de Claude cabe un solo conector personalizado. En los planes
de empresa (Team, Enterprise), quien administra la organización tiene que
permitirlos antes.

### En Claude Code

Lo que va entre comillas angulares es el enlace propio, copiado de Ajustes:

```bash
claude mcp add --transport http --scope user agenda <enlace>
```

`--scope user` lo deja disponible en todos los proyectos. `claude mcp list`
comprueba que conecta.

---

## 4. Lo que Claude puede hacer

| Herramienta | Para qué |
|---|---|
| `ver_agenda` | Lo que hay entre dos fechas (como mucho un mes): eventos, recurrentes con quién lleva y recoge, cumpleaños y santos, quién está fuera y, en casa, los turnos de Lío y la cena de cada noche. Empieza diciendo qué día es hoy en Madrid. |
| `ver_gente` | Las personas por círculos, con apodo, parentesco, edad, cumpleaños y santo. |
| `ver_regalos` | Ideas, deseos y regalos en marcha por persona; lo que se prepara para quien pregunta no sale nunca. |
| `ver_sitios` | Los sitios y sus apuntes: llevar, hacer, ir y saber. Solo para quien vive en casa. |
| `ver_mejoras` | Las mejoras apuntadas sobre la propia aplicación. |
| `apuntar_evento` | Un evento, con los mismos campos que «Nuevo evento». |
| `apuntar_idea` | Una idea de regalo para alguien, oculta para esa persona; o un deseo, si es para uno mismo. |
| `apuntar_en_sitio` | Un apunte en un sitio; si el sitio no existe, Claude pregunta antes de crearlo. |
| `apuntar_cena` | Lo que se cena una noche; no sustituye lo que ya hubiera sin preguntar. |
| `apuntar_mejora` | Una mejora para la aplicación, que se ve en Ajustes › Mejoras. |
| `ver_detalle` | Todo lo de una cosa: cuándo, de quién, notas, estado, quién la apuntó y sus comentarios. |
| `editar_evento` | Cambia un evento: título, día, hora, hasta cuándo, tipo, sitio, notas, de quién es y quién va. |
| `editar_idea` | Cambia una idea o un deseo; si cambia para quién es, la respuesta dice quién la ve ahora. |
| `editar_regalo` | El estado de un regalo (por comprar, listo, entregado), quién se encarga y cuánto costó. |
| `editar_apunte` | Corrige un apunte de un sitio: el texto, el detalle o la clase. |
| `editar_mejora` | Cambia el texto de una mejora. |
| `borrar` | Borra algo; de lo que se repite, con una fecha quita solo ese día. |
| `marcar_hecho` | Marca, o desmarca, lo de Llevar de un sitio y las mejoras. |
| `marcar_paseo_de_lio` | Que quien habla ha sacado a Lío en un turno, o que en su turno no salió. |
| `comentar` | Un comentario en un evento, una idea, un regalo o un apunte, firmado por quien habla. |

Lo apuntado desde Claude es igual que lo apuntado a mano y llega a los teléfonos
en la siguiente sincronización. Pedir dos veces lo mismo no lo duplica. Cada
respuesta devuelve la fecha en palabras —«miércoles 14 de Octubre de 2026»— para
que se vea si Claude entendió el día que se quería decir.

**Para cambiar algo, Claude lo nombra por su referencia**, que sale entre
corchetes al final de cada línea de las consultas —`[evento:…]`, `[idea:…]`—, y
la busca en lo que ve la cuenta del enlace: lo que esa cuenta no ve no se puede
tocar, aunque se sepa cómo se llama. Después de cambiar algo, la respuesta enseña
cómo ha quedado.

**Borrar es lo mismo que en la aplicación**: lo borrado deja de verse, pero la
fila no desaparece de la base. Claude pregunta antes de borrar, y hay dos casos
en que la herramienta exige que lo haya preguntado: **una serie entera** de algo
que se repite —para «no hay hípica el jueves» basta con quitar ese día— y **una
idea de la que ya cuelgan regalos**. Las reglas de quién puede borrar qué son las
de siempre: un apunte, quien lo escribió o quien administra; un comentario, solo
quien lo escribió; un sitio, solo vacío.

**Lo que sigue siendo de la aplicación:** el turno de Lío de otra persona que ya
pasó sin marcar, porque lo confirma quien lo tenía; el día, la hora y quién lleva
de una actividad recurrente; lo que viene de un calendario externo, como los
vuelos; devolver un día que se quitó («Sí hay»); y aceptar o pedir cambios de
turno.

---

## 5. Seguridad

- **El enlace es una contraseña.** Quien lo tenga consulta, apunta, cambia y
  borra como su dueño. Si se ha pegado donde no debía, **Hacer otro** lo anula en
  el acto.
- **Muere con la cuenta.** Se comprueba en cada petición que la persona siga
  teniendo cuenta; darse de baja, o que un administrador la retire, lo apaga, y
  no revive aunque la cuenta se vuelva a aprobar.
- **No está guardado en la base.** La base solo tiene la mitad pública; la otra
  mitad es una firma con `SESION_SECRETO` que se recalcula. Cambiar
  `SESION_SECRETO` anula a la vez todos los enlaces y todas las sesiones.
- **Dónde queda escrito.** Lo guarda Claude en la configuración del conector, y
  aparece en las trazas del Worker de Cloudflare, que solo ve la cuenta de
  Cloudflare de la casa.

---

## 6. Cuando algo no va

| Síntoma | Causa habitual |
|---|---|
| Claude no consigue conectar | El enlace ya no vale —se hizo otro o se quitó—, o se copió cortado. Cópielo otra vez desde Ajustes |
| Claude conecta pero no aparece ninguna herramienta | El conector está desactivado en esa conversación: actívelo en el menú de herramientas |
| «No hay nadie que se llame…» | El nombre no coincide con ninguna ficha. Claude puede consultar `ver_gente` y preguntar |
| «No encuentro evento:…» | Ya se borró, o la cuenta del enlace no lo ve. Claude puede volver a consultar para tener la referencia al día |
| Claude no ofrece cambiar ni borrar | La conversación empezó antes de que el Worker tuviera las herramientas nuevas: abra una nueva |
| Sitios o Cenas dicen que son de quien vive en casa | La cuenta del enlace no está en el círculo Familia |
| Ajustes no enseña el apartado Claude | La aplicación no tiene la 1.97.0 todavía, o se está en la demostración |
| Ajustes dice que no ha podido leer el enlace | El Worker no se ha desplegado, o la migración `0030` no se aplicó. Mire el workflow `desplegar la API` |
