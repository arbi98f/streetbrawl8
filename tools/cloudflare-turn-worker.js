// =====================================================================
// Cloudflare Worker: entrega credenciales TURN temporales a Street Brawl 8.
// La clave de Cloudflare vive aquí (como secreto), nunca en el juego.
//
// Variables del Worker (Settings → Variables and Secrets):
//   TURN_KEY_ID         (texto)   ID de tu TURN key
//   TURN_KEY_API_TOKEN  (secreto) API token de esa TURN key
//   ALLOWED_ORIGIN      (texto, opcional) p. ej. https://tuusuario.github.io  → solo tu web puede pedirlas
// =====================================================================
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const allowed = env.ALLOWED_ORIGIN || '*';
        const cors = {
            'Access-Control-Allow-Origin': allowed,
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Cache-Control': 'no-store'
        };
        if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
        if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN) {
            return new Response(JSON.stringify({ error: 'origin' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: 14400 })   // 4 h: más que cualquier partida
        });
        if (!r.ok) return new Response(JSON.stringify({ error: 'turn' }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        return new Response(await r.text(), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
};
