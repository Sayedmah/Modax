# Single HTML file generation —0.6.1

Select Create HTML in the sidebar or the X workspace shortcut, describe the page,
select a genuinely configured model and submit. An explicit DEMO choice creates
a fixed labeled fixture, not an AI-authored personalized page. Real providers use
one bounded90s generation call; no paid provider tests are run automatically.

The result is one index.html with inline CSS/optional JavaScript. Download it
directly or as the existing project ZIP; completed task history retains the direct
download action across reload. Normal owner authentication/isolation, task count,
active-task limits, cancellation/restart handling, snapshots and account exports
apply. Production storage is still ephemeral until PostgreSQL is bound.

API: POST tasks with kind=html/mode=FAST; existing start/run endpoints select the
model. GET tasks/{id}/html requires a completed HTML task, returns UTF-8 bytes as
application/octet-stream with attachment filename index.html, nosniff, no-store
and sandbox/default-src-none CSP. It is not served as an inline MODAX webpage.
SMART/OMEGA modes and execute=true are explicitly rejected for this workflow.

The model must return exactly {"html":"..."}. Input output JSON is bounded to
100000UTF-8bytes; the HTML source is limited to64KiB. Likely secret patterns,
fragments, missing HTML doctype or missing/duplicate html/head/title/body opening
or closing tags are rejected before writing. No custom filenames/paths are accepted.
The workspace .html extension is now allowed for storage/export; existing Coder
project ZIP import remains its original source subset.

Validation is basic structure inspection using HTMLParser, not a full standards
validator, sanitizer, JavaScript/CSS test, browser rendering test or security
approval. Generated scripts are never executed on the server or inside the MODAX
client, and there is no inline preview. Review downloaded source before running it.
The prompt requests no remote resources; this is guidance rather than an enforced
offline-only sanitizer. Do not claim that arbitrary generated pages work or are safe
merely because their basic structure passed. Invalid provider output yields BLOCKED
with no downloadable HTML. Existing tasks remain visible with their actual state.
