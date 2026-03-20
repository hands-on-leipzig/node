# Auto-merge translation PRs (GitHub Actions)

Workflow: [`.github/workflows/i18n-locale-pr-auto-merge.yml`](../.github/workflows/i18n-locale-pr-auto-merge.yml)

## What it does

When a **pull request** is opened or updated against **`main`** and the diff touches only paths under **`src/locales/**`**, the workflow:

1. **Skips** draft PRs, **fork** PRs, and branches that do **not** start with **`i18n/`** (your DRAHT branches look like `i18n/all-…` / `i18n/en-…`).
2. **Double-checks** that every changed file path starts with `src/locales/` (so a mixed PR is not merged by mistake).
3. **Approves** the PR as `github-actions[bot]`.
4. **Merges** with **`squash`** (change `mergeMethod` in the workflow if you prefer merge commits or rebase).

## How this interacts with branch protection

GitHub applies **branch protection / rulesets** **after** the workflow runs. The merge API call succeeds only when:

- There are **no conflicts** with `main`.
- All **required status checks** (if any) have passed.
- **Required reviews** are satisfied **or** bypassed.

The default **`GITHUB_TOKEN`** is **not** an admin: it cannot ignore protection. So:

| Your rule | What you need |
|-----------|----------------|
| No required reviews, optional checks | Auto-merge usually works immediately after approve. |
| **1+ required approvals** | Either lower the count to **0** for this repo, or add a **ruleset bypass** for `github-actions[bot]`, or use a **PAT** from a user who counts as reviewer (not ideal). |
| **Required checks** on PRs | Let checks finish; the workflow **polls** until the PR is mergeable (up to ~3 minutes). If checks take longer, increase `maxAttempts` in the script or trigger merge from `workflow_run` after your CI workflow. |
| **CODEOWNERS** required | Ensure owners are not blocking: often you must exclude `src/locales/**` from CODEOWNERS or add a bypass for the bot. |

## Optional: PAT instead of `GITHUB_TOKEN`

If your org restricts what `GITHUB_TOKEN` can do, create a fine-grained PAT (or GitHub App) with `contents: write` and `pull-requests: write` on this repo, store it as a secret (e.g. `I18N_AUTO_MERGE_TOKEN`), and pass it to `actions/github-script` as `github-token: ${{ secrets.I18N_AUTO_MERGE_TOKEN }}`. The same branch-protection rules still apply unless that identity has an explicit **bypass** in rulesets.

## Merge method

In the workflow file, set:

```js
const mergeMethod = 'squash'; // or 'merge' | 'rebase'
```

## Testing

1. Open a test PR: branch name `i18n/test-123`, change only `src/locales/en.js` (or `de.js`), base `main`.
2. Watch **Actions** → **Auto-merge locale PRs**.
3. If it fails, read the job log; common causes are missing review permission, pending checks, or conflicts.

## Security note

The **`paths` filter** and **`i18n/`** prefix reduce risk but are not a substitute for **never merging untrusted fork PRs**—the workflow already requires `head.repo.full_name == github.repository`.
