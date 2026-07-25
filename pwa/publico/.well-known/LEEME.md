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
curl -i https://agenda.galoopa.store/.well-known/apple-developer-domain-association.txt
```

Debe responder `200` con el contenido en texto plano y **sin redirección**. Si
responde `404`, es que el despliegue de Pages se ha saltado el directorio: los
nombres que empiezan por punto no siempre se suben. La salida documentada en ese
caso está en `docs/despliegue-cloudflare.md`, §5.3.
