# Direct guest entry

MODAX0.3.5 supports MODAX_GUEST_MODE=true. The website creates a random isolated guest identity and session automatically, without asking for a username/password. Existing accounts and data are preserved; the API still enforces owner/session checks for every private resource. MODAX_ALLOW_SIGNUP=false disables public registration on the hosted guest deployment.

Guest tokens are stored in sessionStorage and reused on reload. Closing/clearing the browser session or token expiry can end access to guest history. The New Session button revokes the current session and starts a separate empty workspace. Export important chats/data before starting a new session. Guest sessions are not recovery accounts or permanent storage. Hosted SQLite remains ephemeral until PostgreSQL is connected.

Guest creation is limited to10per minute per direct client address and10000guest identities in the database, in addition to API rate limits and per-owner workflow quotas. A reverse proxy can aggregate clients under one address. Shared server provider secrets remain server-side; free OpenRouter capacity is provider-controlled and paid fallback is not configured.

Validation: backend tests cover disabled access, ownership isolation, token revocation and creation limits. Chromium checks direct entry, streamed demo chat, session reuse on reload, separate-browser isolation and New Session. Tests clear provider secrets and do not spend inference credits.
