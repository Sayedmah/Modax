# Restore chats from an account export

In Settings, download account data as ZIP. Keep this private plaintext archive securely. In the current or a new guest session, select **Restore chats from ZIP** and choose that file. Chat copies appear in history with new IDs; existing conversations are not overwritten. Repeating an import creates additional copies.

Only titles, message roles/text and completion states are restored. Account IDs, provider keys/profiles, usage/costs, tasks, source projects, files, documents and notes are not restored. Original model metadata is replaced with imported. Running responses become interrupted records and are never resumed. No inference request or uploaded code execution is triggered by import.

Limits:4MiB compressed upload;16MiB total declared expanded archive;50chats;5000messages;2MiB UTF-8 message text;100messages/100000characters per chat. The manifest is limited to16KiB, chat metadata64KiB and serialized messages8MiB. Import refuses archives that would exceed1000stored chats for the current owner. Unsupported versions, unknown paths/members, duplicate archive names/record IDs, links, encrypted members, orphan messages and manifest count mismatches are rejected. Other known export collections are ignored without decompression. Files are never extracted to disk.

All records are validated before a single owner-locked transaction inserts regenerated chat/message IDs and a count-only audit entry. Validation or database failures leave no partial copies. One import at a time per API process bounds worker use. ZIP processing runs in the synchronous request worker, with byte/record bounds; it is not a durable background job.

This is manual chat portability, not complete account recovery or permanent hosting storage. Guest access still depends on the browser session token; hosted SQLite remains ephemeral until PostgreSQL is connected. Large archives can be rejected explicitly; there is no silent truncation or subset selection yet.
