# How the node frontend addresses DRAHT (draht-dev)

Summary from inspecting the **draht-dev** repo at `PhpstormProjects/draht-dev`.

## Base URL

- **Dev:** `https://dev.draht.hands-on-technology.org` (from `htdocs/conf/conf.php`).
- The Dolibarr REST API is served under **`/api/index.php`** (see `htdocs/api/index.php`).
- So the **node** app should call:

  **`VITE_DRAHT_API_URL=https://dev.draht.hands-on-technology.org/api/index.php`**

  Requests from the FE will then be:

  - `GET  https://dev.draht.hands-on-technology.org/api/index.php/addresses`
  - `GET  https://dev.draht.hands-on-technology.org/api/index.php/teams`
  - `POST https://dev.draht.hands-on-technology.org/api/index.php/teams`
  - `GET  https://dev.draht.hands-on-technology.org/api/index.php/classes`
  - `POST https://dev.draht.hands-on-technology.org/api/index.php/classes`

  The node service already uses relative paths (`/addresses`, `/teams`, `/classes`), so setting the base URL to the value above is enough.

## Authentication (Keycloak Bearer → DOLAPIKEY middleware)

- **Node** sends only **`Authorization: Bearer <keycloak-access-token>`**. No DOLAPIKEY is stored or sent from the frontend.
- **DRAHT** uses a **custom middleware** in front of the Dolibarr API:
  - **`htdocs/custom/api_keycloak_bearer_middleware.php`** runs when a Bearer token is present.
  - It validates the JWT with Keycloak (JWKS), maps the token identity (e.g. `preferred_username` or `email`) to a Dolibarr user, and sets **`DOLAPIKEY`** internally so the existing API access layer works unchanged.
- **DRAHT config** (Setup → Other or `conf.php`):
  - **API_KEYCLOAK_JWKS_URL** (required): e.g. `https://sso.hands-on-technology.org/realms/master/protocol/openid-connect/certs`
  - **API_KEYCLOAK_ISSUER** (optional): e.g. `https://sso.hands-on-technology.org/realms/master`
  - **API_KEYCLOAK_LOGIN_CLAIM** (optional): `preferred_username` (default) or `email`
- **Two modes:** (1) **Technical user:** set `API_KEYCLOAK_MIDDLEWARE_USER` to a single Dolibarr user (e.g. `middlewareuser`) so all coaches use that user’s API key (no Dolibarr account per coach). Optionally set `API_KEYCLOAK_REQUIRED_ROLE` (e.g. `coach`). (2) **Per-user:** leave that empty; each coach must have a matching Dolibarr user with an API key.
- **Coach identity:** Each coach has a Dolibarr contact ID in Keycloak (user attribute) and in the access token (protocol mapper). The DRAHT middleware reads it and sets **`$_SERVER['DOLIBARR_COACH_CONTACT_ID']`** so your logic (identify coach, find their teams) can use it. Optional config: **API_KEYCLOAK_DOLIBARR_CONTACT_CLAIM** (default `dolibarr_contact_id`).
- See **`htdocs/custom/API_KEYCLOAK_BEARER.md`** in draht-dev for full setup.

## Teams / Classes / Addresses endpoints

- In **draht-dev** there are **no** API classes for **teams**, **classes**, or **addresses** in the standard or custom modules (no `api_teams.class.php`, `api_classes.class.php`, or equivalent for “addresses” as the node app expects).
- Dolibarr’s API is built from `htdocs/<module>/class/api_<module>.class.php`; the routing uses the first path segment after `/api/index.php/` (e.g. `teams` → `api_teams.class.php` in a module named/linked for “teams”).
- So to support the node app, **DRAHT** needs either:
  - A **custom module** (e.g. under `htdocs/custom/`) that provides API classes for **teams**, **classes**, and **addresses** with the paths and payloads the node app uses, or
  - Existing Dolibarr modules exposed under those path names with the same request/response shape.

Until those endpoints exist and are enabled, **GET/POST /teams**, **GET/POST /classes**, and **GET /addresses** will return **501** (API not found) or similar.

## CORS

- `htdocs/api/index.php` already sends CORS headers for `/api/index.php` and for OPTIONS (preflight): `Access-Control-Allow-Origin: *`, methods GET/POST/PUT/DELETE, headers `Content-Type, Authorization, api_key, DOLAPIKEY`.
- So the node app (e.g. `http://localhost:5173`) can call the dev DRAHT API from the browser without extra CORS config on the FE.

## Checklist for node

1. Set **`VITE_DRAHT_API_URL=https://dev.draht.hands-on-technology.org/api/index.php`** in `.env` for dev.
2. Ensure DRAHT implements (or has) **teams**, **classes**, and **addresses** APIs and that they are enabled.
3. Align auth: either DRAHT accepts **Bearer** (Keycloak JWT) or node uses **DOLAPIKEY** (or another agreed scheme).
