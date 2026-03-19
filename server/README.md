# Backend for “documents for download”

Configuration is stored in **DRAHT** (not in this repo):

- **GET** `…/handson/node/documents-config` — config. **`…/documents-folder-files`** — Graph file list for configured folder.
- **PUT** same path — update (Keycloak client role `node-admin` on client `node`, or realm `admin`; Dolibarr admin API user; or `HANDSON_NODE_DOCUMENTS_ADMIN_CONTACT_IDS`).

File on server: `DOL_DATA_ROOT/handson/node_documents_config.json`.

See `deploy/README.md` in the project root.
