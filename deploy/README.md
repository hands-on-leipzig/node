# Deploy / SPA reload

So that reload and direct URLs (e.g. `/dashboard`) work:

- **Apache**: The built `dist/` folder includes `.htaccess` (from `public/.htaccess`). Ensure `mod_rewrite` is enabled; no extra config needed.
- **Nginx**: Add the rule from `nginx.snippet.conf` to your server block so non-file requests serve `index.html` (e.g. `try_files $uri $uri/ /index.html;`).

## Documents for download (SharePoint URL)

Handled entirely by **DRAHT** — no separate Node API.

- **GET** `node/documents-config` — static config (`folderUrl`, `title`, manual `files`, flags). Optional **`?mergeGraph=1`** still merges Graph server-side (legacy).
- **GET** `node/documents-folder-files` — JSON `{ files, folderUrl, graphOk, graphCode }` (coach dashboard).
- **GET** `node/documents-graph-status` — admin: token + `GET /sites/root` (MS_CLIENT_* sanity check). Response includes **Graph identity**: client-credentials / Entra app id (`appid`, `tid`, roles)—SharePoint is **not** accessed as the Keycloak user in the browser.
- **POST** `node/documents-probe-folder` — admin, body `{ "url": "…" }` — same folder probe as after save.
- After **PUT** `node/documents-config`, response includes **`folderGraphProbe`** (readable, HTTP codes, `summaryKey`) when Graph is enabled.
- **PUT** `node/documents-config` — updates JSON on disk (`DOL_DATA_ROOT/handson/node_documents_config.json`). Body may include **`files`**: array of `{ name, url }` (https only, max 150). Allowed if:
  - Keycloak access token includes client role **`node-admin`** on client **`node`** (or realm role **`admin`**), or
  - Dolibarr API user is **admin**, or
  - Coach contact ID is listed in Dolibarr const **`HANDSON_NODE_DOCUMENTS_ADMIN_CONTACT_IDS`** (comma-separated socpeople rowids).

Deploy **DRAHT** with the `getNodeDocumentsConfig` / `putNodeDocumentsConfig` methods in `api_handson.class.php`. The Vue admin screen (`/dashboard/admin/documents`) calls these endpoints via the existing `handson/node` API client.

Optional fallback: edit `public/documents-config.json` before build if the API is empty.

### Microsoft Graph still returns **403** after adding Files.Read.All

DRAHT uses **client credentials** (app-only). Check these in order:

1. **Application vs delegated**  
   In Entra ID → App registration → **API permissions**, `Files.Read.All` must be under **Application permissions** (not only “Delegated”). **Files.Read.All** for applications = “Read files in all site collections”.

2. **Admin consent**  
   Click **Grant admin consent for &lt;your tenant&gt;** for that app. Adding a permission without consent does **not** put it on the token.

3. **Add Sites.Read.All (application)**  
   Resolving `/:f:/s/…` links calls **`/sites/...`** and **`/shares/...`**. Many tenants need **both** `Files.Read.All` and **`Sites.Read.All`** (application) with admin consent. If probe shows **403** on **Site-API** or **driveItem**, add Sites.Read.All and consent again.

4. **New token**  
   Dolibarr may cache the bearer token for several minutes. After changing permissions, wait ~5–10 minutes or clear the cache / restart PHP if you implemented caching.

5. **Correct tenant**  
   Constants **`MS_TENANT_ID`**, **`MS_CLIENT_ID`**, **`MS_CLIENT_SECRET`** must belong to the **same Entra tenant** as the SharePoint site (`*.sharepoint.com`).

6. **SharePoint tenant restrictions**  
   In Microsoft 365 admin / SharePoint admin, policies can block app-only access to content. If everything above is correct and 403 persists, check **SharePoint** and **Microsoft Graph** service health and any “allow only selected apps” policies.

Use **GET** `node/documents-graph-status` and the admin **Ordner testieren** probe: note which line shows **403** (Sharing-API, **Freigabe driveItem**, Site-API, Ordner-Liste) to see which call fails.

**DRAHT back office:** on **Handson → handsonindex** (`custom/handson/handsonindex.php`), admins get a **SharePoint folder link** form that runs the same Graph probe (no Node required).

## Translations admin → GitHub PR

Handled by **DRAHT** — **POST** `node/translations-pr` (same admin rules as documents: Keycloak `node-admin` / realm `admin`, Dolibarr admin, or **`HANDSON_NODE_DOCUMENTS_ADMIN_CONTACT_IDS`**).

Set in Dolibarr (constants / setup):

- **`HANDSON_GITHUB_TOKEN`** — fine-grained or classic PAT with `contents: write` and `pull_requests: write` on the repo
- **`HANDSON_GITHUB_REPO`** — `owner/repo` (e.g. `myorg/node`)
- Optional **`HANDSON_GITHUB_LOCALE_PATH_PREFIX`** — path inside repo to locale files (default **`src/locales`**)

The SPA only needs **`VITE_DRAHT_API_URL`**; no separate i18n API.

**Request body** (JSON):

- **Combined (used by the admin UI):** `{ "locales": { "en": { …nested… }, "de": { …nested… } }, "prTitle": "optional", "editorUsername": "…" }` — DRAHT should create **one branch**, update **`en.js` and `de.js`**, and open **one pull request**.
- **Legacy (single file):** `{ "locale": "en", "messages": { … }, "prTitle": "…", "editorUsername": "…" }` — optional if you still need backward compatibility.

See **`deploy/draht-translations-pr-combined.md`** for PHP implementation notes for DRAHT.

### Optional: merge locale PRs without manual review

GitHub Actions workflow **`.github/workflows/i18n-locale-pr-auto-merge.yml`** can **approve and squash-merge** PRs that only touch `src/locales/**`, target `main`, and use a head branch named `i18n/*` (same pattern DRAHT uses). Branch protection still applies—see **`deploy/github-i18n-auto-merge.md`**.
