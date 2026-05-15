# node

**node** — *haNds On technology Dashboard and Enrollment*

Vue 3 frontend for coaches: SSO login via Keycloak and enrollment of teams and classes. Enrolled entries are created in DRAHT (Dolibarr).

## Features

- **Public venues page** (`/`) – map and list of tournament locations (no login); data from `node_public_venues.php` on DRAHT
- **SSO login** via Keycloak
- **Dashboard** with quick actions to enroll a team or a class (after coach login)
- **Enroll team** – name, school/club, category, notes → created in DRAHT
- **Enroll class** – name, school, grade, teacher, notes → created in DRAHT
- **Admin: translations** – edit `en.js` / `de.js` strings and open a **GitHub pull request** via DRAHT (`HANDSON_GITHUB_*` in Dolibarr; see `deploy/README.md`)

## Project setup

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Compile and Minify for Production

```sh
npm run build
```

## Configuration

Copy `.env.example` to `.env` and set:

- **Keycloak**: `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID`
- **DRAHT API**: `VITE_DRAHT_API_URL` – base URL of your DRAHT/Dolibarr backend that exposes `POST /teams` and `POST /classes` (and optionally `GET /teams`, `GET /classes`).

Without a running Keycloak, the app still loads; the venues page works if `node_public_venues.php` is reachable. Accessing the dashboard triggers login (redirect to Keycloak). Without DRAHT, enrollment requests will fail until the backend is available.

### Public venues API (mod-handson)

Deploy `lib/handson_public_venues.lib.php` and update `api_proxy.php` on DRAHT. The SPA calls:

`GET {VITE_DRAHT_API_URL}/handson/node/public/venues`

Example: `…/custom/handson/api_proxy.php/handson/node/public/venues`

That route is answered by the proxy without Bearer/API key (read-only). Fallback script: `custom/handson/node_public_venues.php`.

### Keycloak client setup (node)

The app uses **Authorization Code flow with PKCE**. For the **node** client in your realm:

| Setting | Value | Notes |
|--------|--------|------|
| **Client authentication** | OFF | Public SPA; no client secret. |
| **Authorization** | OFF | Not needed unless you use Keycloak’s resource/scope authorization. |
| **Standard flow** (Authorization Code) | **ON** | Required for login. |
| **Implicit flow** | OFF | Deprecated; not used. |
| **Direct access grants** | OFF | For machine-to-machine; not for browser login. |

**Required:**

1. **Valid redirect URIs**: Add your app origins, e.g. `http://localhost:5173/*` (dev), `https://your-node-app.example.com/*` (prod). Use `/*` so Keycloak can redirect back to any path.
2. **Web origins**: Add the same origins without path (e.g. `http://localhost:5173`, `https://your-node-app.example.com`) for CORS.

Leave **Authentication** (the “Authentication flow” / “Browser flow” at realm level) as default; the client will use the realm’s standard browser flow for login.
