#!/usr/bin/env bash
# Send release deploy notification via Microsoft Graph (client credentials + Mail.Send).
set -euo pipefail

: "${MS_TENANT_ID:?MS_TENANT_ID required}"
: "${MS_CLIENT_ID:?MS_CLIENT_ID required}"
: "${MS_CLIENT_SECRET:?MS_CLIENT_SECRET required}"
: "${MAIL_FROM:?MAIL_FROM required (sender UPN)}"
: "${MAIL_TO:?MAIL_TO required (comma-separated)}"
: "${JOB_STATUS:?JOB_STATUS required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
: "${GITHUB_SHA:?GITHUB_SHA required}"
: "${RELEASE_TAG:?RELEASE_TAG required}"
: "${WORKFLOW_RUN_URL:?WORKFLOW_RUN_URL required}"

RELEASE_NAME="${RELEASE_NAME:-}"
ACTOR="${ACTOR:-}"
DEPLOY_TARGET="${DEPLOY_TARGET:-}"

if [ "$JOB_STATUS" = "success" ]; then
  SUBJECT="[node] Production release deployed: ${RELEASE_TAG}"
  STATUS_LABEL="succeeded"
else
  SUBJECT="[node] Production release deploy FAILED: ${RELEASE_TAG}"
  STATUS_LABEL="failed"
fi

TOKEN_RESPONSE="$(curl -fsS -X POST "https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "client_id=${MS_CLIENT_ID}" \
  --data-urlencode "client_secret=${MS_CLIENT_SECRET}" \
  --data-urlencode 'scope=https://graph.microsoft.com/.default' \
  --data-urlencode 'grant_type=client_credentials')"

ACCESS_TOKEN="$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty')"
if [ -z "$ACCESS_TOKEN" ]; then
  echo "Graph token request failed: $(echo "$TOKEN_RESPONSE" | jq -c '.error, .error_description')"
  exit 1
fi

TO_RECIPIENTS="$(printf '%s' "$MAIL_TO" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' | jq -R -s '
  split("\n")
  | map(select(length > 0))
  | map({ emailAddress: { address: . } })
')"

BODY_HTML="$(cat <<EOF
<p>Production deployment for <strong>${GITHUB_REPOSITORY}</strong> (release <strong>${RELEASE_TAG}</strong>) <strong>${STATUS_LABEL}</strong>.</p>
<ul>
  <li>Release: ${RELEASE_TAG}${RELEASE_NAME:+ — ${RELEASE_NAME}}</li>
  <li>Published by: ${ACTOR:-—}</li>
  <li>Commit: <code>${GITHUB_SHA}</code></li>
  ${DEPLOY_TARGET:+<li>Target: ${DEPLOY_TARGET}</li>}
</ul>
<p><a href="${WORKFLOW_RUN_URL}">Open workflow run</a></p>
EOF
)"

PAYLOAD="$(jq -n \
  --arg subject "$SUBJECT" \
  --arg body "$BODY_HTML" \
  --argjson toRecipients "$TO_RECIPIENTS" \
  '{
    message: {
      subject: $subject,
      body: { contentType: "HTML", content: $body },
      toRecipients: $toRecipients
    },
    saveToSentItems: false
  }')"

HTTP_CODE="$(curl -sS -o /tmp/graph-sendmail-response.json -w '%{http_code}' -X POST \
  "https://graph.microsoft.com/v1.0/users/$(jq -rn --arg u "$MAIL_FROM" '$u|@uri')/sendMail" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD")"

if [ "$HTTP_CODE" != '202' ] && [ "$HTTP_CODE" != '200' ]; then
  echo "Graph sendMail failed (HTTP ${HTTP_CODE}):"
  cat /tmp/graph-sendmail-response.json
  exit 1
fi

echo "Release deploy notification sent to ${MAIL_TO}"
