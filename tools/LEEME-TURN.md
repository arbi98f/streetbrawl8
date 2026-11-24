# TURN propio con Cloudflare (opcional, recomendado)

PeerJS ya trae un TURN público compartido, pero está en Europa/EE. UU. y lo usa todo el mundo.
Con el tuyo conectan más redes (datos móviles, CGNAT) y con menos latencia.
Plan gratis de Cloudflare: **1.000 GB/mes** (el TURN solo se usa cuando la conexión directa falla).

1. En el panel de Cloudflare entra a **Realtime** (antes "Calls") → **TURN** y crea una **TURN key**.
   Copia el **Key ID** y el **API token** que te muestra.
2. **Workers & Pages → Create → Worker**. Pega el contenido de `cloudflare-turn-worker.js` y despliega.
3. En el Worker: **Settings → Variables and Secrets**
   - `TURN_KEY_ID` = tu Key ID (texto)
   - `TURN_KEY_API_TOKEN` = tu API token (**secreto**)
   - `ALLOWED_ORIGIN` = la dirección de tu juego, p. ej. `https://tuusuario.github.io` (opcional pero recomendado)
4. Copia la URL del Worker (termina en `.workers.dev`) y pégala en `js/red-calidad.js`:
   `const NET_TURN_URL = 'https://tu-worker.tuusuario.workers.dev';`
5. Sube el cambio. Si el Worker falla, el juego sigue con STUN + el TURN de PeerJS.

Importante: el API token solo debe estar en el Worker. No lo pegues nunca en el código del juego.
