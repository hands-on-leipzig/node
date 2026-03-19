# DRAHT: `translations-pr` with combined locales (one PR)

**Implementation:** `draht-dev` → `htdocs/custom/handson/class/api_handson.class.php` — `postNodeTranslationsPr()` accepts `locales` and calls `handsonPostNodeTranslationsPrGithub()` with branch `i18n/all-{timestamp}`. Legacy `locale` + `messages` is unchanged.

The Node admin UI sends **one** `POST …/handson/node/translations-pr` with:

```json
{
  "locales": {
    "en": { "admin": { "backToDashboard": "…" }, … },
    "de": { "admin": { … }, … }
  },
  "prTitle": "optional title",
  "editorUsername": "keycloak-username"
}
```

DRAHT should:

1. **Auth** — same as today (Keycloak `node-admin` / realm `admin`, Dolibarr admin, or `HANDSON_NODE_DOCUMENTS_ADMIN_CONTACT_IDS`).
2. **Validate** — `locales` is an object; require at least one of `en`, `de` with a non-empty array/object; only allow known locale keys (`en`, `de`).
3. **Branch** — create one branch from the default branch (e.g. `i18n/all-20250304-123456`), not per-locale branches.
4. **Files** — for each locale in `locales`, serialize the nested object to the same JS format you use today (e.g. `export default { … }` or your existing helper), then **GitHub Contents API** `PUT` to `{prefix}/{locale}.js` (prefix = `HANDSON_GITHUB_LOCALE_PATH_PREFIX` or `src/locales`). Use the file SHA from the **new branch** after the first commit (or GET each path on that branch before PUT).
5. **Pull request** — open **one** PR from that branch into the default branch. Title: `prTitle` if non-empty, else e.g. `i18n: update en.js, de.js` (list whichever files changed).

**Backward compatibility:** If the body has **`locale`** + **`messages`** but no **`locales`**, keep the existing single-file behaviour (one branch, one file, one PR).

**PHP sketch** (adapt to your `api_handson.class.php` style, error handling, and GitHub helpers):

```php
$input = json_decode(file_get_contents('php://input'), true);
if (!is_array($input)) {
    throw new RestException(400, 'Invalid JSON');
}

$editorUsername = isset($input['editorUsername']) ? (string) $input['editorUsername'] : '';
$prTitle = isset($input['prTitle']) ? trim((string) $input['prTitle']) : '';
$baseBranch = isset($input['baseBranch']) ? trim((string) $input['baseBranch']) : '';

if (isset($input['locales']) && is_array($input['locales'])) {
    $locales = [];
    foreach (['en', 'de'] as $loc) {
        if (!empty($input['locales'][$loc]) && is_array($input['locales'][$loc])) {
            $locales[$loc] = $input['locales'][$loc];
        }
    }
    if (count($locales) === 0) {
        throw new RestException(400, 'locales must contain at least en and/or de with message objects');
    }
    // $this->postNodeTranslationsPrCombined($locales, $prTitle, $editorUsername, $baseBranch);
    // → resolve default branch, create branch i18n/all-{gmdate}, loop PUTs, POST PR once
} elseif (!empty($input['locale']) && isset($input['messages']) && is_array($input['messages'])) {
    // existing single-locale path: locale + messages
} else {
    throw new RestException(400, 'Provide either locales{en,de} or locale+messages');
}
```

Reuse your existing GitHub token (`HANDSON_GITHUB_TOKEN`), repo (`HANDSON_GITHUB_REPO`), and serialization function from the current `translations-pr` handler so `en.js` / `de.js` match repo conventions.
