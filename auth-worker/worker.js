// "Sign in with GitHub" for LLM From Zero: the one step a static site cannot do itself.
// GitHub turns the sign-in code into a token only with the app's client secret, and a secret on a
// public page is not a secret. This Cloudflare Worker holds it and does exactly two things:
//   POST /exchange {code}  -> {access_token}   (after GitHub redirects back with ?code=...)
//   POST /revoke   {token} -> {ok}             (Sign out: the token stops working everywhere)
// Only the site's own origin may call it. Settings (Workers → your worker → Settings → Variables):
//   CLIENT_ID      the OAuth app's client ID            (plain text)
//   CLIENT_SECRET  the OAuth app's client secret        (Secret)
//   ALLOWED_ORIGIN https://manojhunasimarad.github.io   (plain text)

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), {status, headers: {...cors, 'Content-Type': 'application/json'}});
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
    if (!allowed.includes(origin)) return reply(403, {error: 'origin not allowed'});
    if (request.method !== 'POST') return reply(405, {error: 'POST only'});
    let body;
    try { body = await request.json(); } catch { return reply(400, {error: 'JSON body required'}); }
    const path = new URL(request.url).pathname;

    if (path === '/exchange') {
      if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(body.code)) return reply(400, {error: 'bad code'});
      const r = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        body: JSON.stringify({client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET, code: body.code}),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.access_token) return reply(400, {error: j.error_description || j.error || 'GitHub did not return a token'});
      return reply(200, {access_token: j.access_token, scope: j.scope});
    }

    if (path === '/revoke') {
      if (typeof body.token !== 'string' || body.token.length > 255) return reply(400, {error: 'bad token'});
      const r = await fetch(`https://api.github.com/applications/${env.CLIENT_ID}/token`, {
        method: 'DELETE',
        headers: {'Authorization': 'Basic ' + btoa(env.CLIENT_ID + ':' + env.CLIENT_SECRET),
                  'Accept': 'application/vnd.github+json', 'User-Agent': 'llm-from-zero-auth', 'Content-Type': 'application/json'},
        body: JSON.stringify({access_token: body.token}),
      });
      return reply(r.status === 204 || r.status === 404 ? 200 : 502, {ok: r.status === 204 || r.status === 404});
    }
    return reply(404, {error: 'unknown endpoint'});
  },
};
