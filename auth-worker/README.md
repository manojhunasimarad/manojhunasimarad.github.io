# Sign in with GitHub: one-time setup (about 10 minutes)

The learning site is static, so one step of a GitHub sign-in needs a tiny helper that holds the app's
secret: `worker.js`, run free on Cloudflare Workers. After this setup, the sync panel shows
**Sign in with GitHub** instead of asking for a token.

## 1. Register the app on GitHub

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `LLM From Zero` |
| Homepage URL | `https://manojhunasimarad.github.io/llm-from-zero/` |
| Authorization callback URL | `https://manojhunasimarad.github.io/llm-from-zero/auth.html` |
| Enable Device Flow | leave off |

Register, then copy the **Client ID**, press **Generate a new client secret** and copy the secret.
The secret is shown once; it goes only into Cloudflare, never into this repository or a chat.

## 2. Create the helper on Cloudflare

1. Sign up free at dash.cloudflare.com (email is enough).
2. **Workers & Pages → Create → Create Worker**, name it `lfz-auth`, **Deploy**.
3. **Edit code**: replace everything with the contents of `worker.js`, **Deploy**.
4. Worker → **Settings → Variables and Secrets → Add**:
   - `CLIENT_ID` (Text): the Client ID
   - `CLIENT_SECRET` (**Secret**): the client secret
   - `ALLOWED_ORIGIN` (Text): `https://manojhunasimarad.github.io`
5. Copy the worker's address, like `https://lfz-auth.<your-name>.workers.dev`.

## 3. Tell the site

In `llm-from-zero/auth.mjs`, fill the two public values and push:

```js
export const GITHUB_AUTH = {
  clientId: 'Ov23li...',
  helper: 'https://lfz-auth.<your-name>.workers.dev',
};
```

Both are public by design (they appear in every sign-in link). Only the secret must stay private.

## How it behaves

- Laptop and phone: sign in once; you stay signed in until you press **Sign out**.
- Work computer: tick **Work or shared computer** first; closing the browser signs you out there.
- **Sign out** also revokes the token at GitHub, so a copy left anywhere stops working.
- The app asks GitHub for the `gist` scope only: it can read and write your gists, nothing else.
