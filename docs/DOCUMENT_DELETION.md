# Document deletion and reference retention

Files already supported owner-scoped deletion. Release0.4.1 hardens that existing
path rather than introducing a new storage subsystem or pretending deletion was
previously absent.

The file list provides Delete document, followed by an explicit confirmation
containing the filename and retention warning. Cancel sends no DELETE request.
Deletion is blocked in this browser while a chat response is running; stop it
first. The button is disabled during the operation and failures remain visible.
After success, previews/search hits disappear and the attachment selector drops
the deleted ID. Refresh preserves another still-existing selection. Delayed
search/preview/list responses are guarded by a document-view epoch so stale data
cannot reappear after a mutation/session change. Upload now consumes its JSON
response, releasing the API request tracker and allowing response-body completion.

`DELETE /api/v1/files/{file_id}` still returns204 on success,404 for a missing or
foreign-owner file, and401 without a session. An owner-locked transaction deletes
the document and cascading chunks, then writes an audit entry containing only the
file ID. If that transaction fails, document/chunks/audit roll back together and
the client receives a sanitized503. Concurrent deletion has one success and one404.
No schema migration or uploaded-code execution is needed.

Future explicit attachment requests with the removed ID return404 before storing
messages or reserving inference. Search and future account exports no longer
contain the document. Existing chats/messages are deliberately unchanged: prior
answers, copied text, citations and already-running provider context may still
contain document information. This is NOT transcript redaction, provider-side
erasure or cancellation of already-sent data. Delete relevant chats separately
when needed. No original uploaded binary is retained by this document pipeline.

Deletion is permanent in the current workspace (there is no trash/undo for files).
An earlier external account export can still contain extracted text. Production
storage remains ephemeral until PostgreSQL is securely bound; don't confuse this
control with durable backup or whole-account privacy erasure.
