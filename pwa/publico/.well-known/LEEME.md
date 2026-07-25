# `.well-known`

Aquí va el fichero de verificación de dominio que entrega Apple al configurar
Sign in with Apple en el Services ID:

```
apple-developer-domain-association.txt
```

Se descarga desde <https://developer.apple.com/account> —Identifiers → el
Services ID → Sign in with Apple → Configure— y se deja en este directorio tal
cual, sin renombrarlo ni reformatearlo. Se publica con el siguiente despliegue
de Pages, que republica en cada empujón a `main`.

Antes de pulsar *Verify* en Apple, compruebe que se sirve de verdad:

```bash
curl -i https://garciadoral-ops.galoopa.store/.well-known/apple-developer-domain-association.txt
```

**No mire solo el código de estado.** Este sitio no tiene `404.html`, así que
cualquier ruta inexistente responde `200` con el `index.html` de la aplicación.
Lo que distingue un caso del otro es la cabecera `content-type`:

- `text/plain`, y el cuerpo es la cadena que entregó Apple → correcto.
- `text/html` → el fichero no está publicado; le están devolviendo la
  aplicación, y Apple fallará la verificación.

Si sale `text/html`, es que el despliegue de Pages se ha saltado el directorio:
los nombres que empiezan por punto no siempre se suben. La salida documentada en
ese caso está en `docs/despliegue-cloudflare.md`, §5.3.
