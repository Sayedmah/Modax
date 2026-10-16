# Explicit saved-note restoration

In Settings, check the separate note-copy consent box, click Restore notes from ZIP,
and choose a MODAX account export. This creates new note copies in the current
authenticated or guest workspace. Consent is cleared after every attempt and on
session changes. Review/delete the imported notes in Memory before enabling context.

`POST /api/v1/account/import-notes` accepts multipart `file` and `confirm=true`.
Missing/false confirmation returns 422. A bearer session is required. The existing
chat restore endpoint never restores notes; note restore never copies chats.

Limits: 4 MiB upload, 16 MiB declared expanded archive, 1 MiB memory.ndjson,
100 notes per batch and per stored owner, 2000 characters per note, and 512 KiB
total UTF-8 note text. Manifest format/version and memory count must match. IDs
are bounded strings and unique. Empty/blank notes and likely API/private secrets
are rejected using the same detector as manual note creation. Secret detection
is heuristic, not a guarantee: never upload credentials as ordinary memory.

The shared archive checks reject duplicate/unknown paths, links and encryption.
Only manifest.json and memory.ndjson are decompressed in this operation. Unselected
collections and foreign owner IDs/settings are ignored. No file extraction,
uploaded code execution, model call or billing action occurs.

All selected notes are validated before an owner-locked transaction. IDs and
timestamps are regenerated; existing notes are never overwritten. Quota, parsing
or database failures leave no partial copies. A shared nonblocking import gate
limits archive restoration per worker; count-only audit records omit note text.
Repeated successful import deliberately creates additional copies until quota.

Restoration never changes use_memory (false stays false; true stays true). No
provider credentials, account settings, tasks or projects are restored. Raw notes
are displayed as text, not HTML. This is not whole-account recovery or permanent
storage: the free host is still ephemeral until PostgreSQL is securely bound.
