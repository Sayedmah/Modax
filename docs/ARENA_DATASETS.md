# Custom objective Arena fixtures

Model Arena supports the existing core-v1 smoke checks and private immutable
datasets. Create a name and JSON array of cases in the UI, select the saved
dataset, choose configured models, and run. No tools or code from a dataset are
executed. Prompts contain the task/template, not expected answers or project memory.

Each case has `id` (1–40 ASCII letters/digits/_/-), `task` (1–2000 characters),
`expected` (1–1000 characters), and `match` (exact or json, default exact).
Blank fields, duplicate case IDs, unknown fields, invalid/nonfinite expected JSON
and likely secret patterns are rejected. Secret screening is heuristic: never
enter credentials. Limits:1–10 cases,32KiB UTF-8 validated input,20stored datasets
per owner; name1–80characters. JSON strings are data, not executable graders.

API:
- GET/POST `/api/v1/arena/datasets`: owner list/create.
- GET `/api/v1/arena/datasets/{id}`: owner detail/JSON export.
- DELETE that path: removes the source dataset only; prior run snapshots remain.
- POST `/api/v1/arena/runs`: optional dataset_id; omit/null for core-v1.
  The existing models/template/confirm_external_calls fields are preserved.

Creation generates a new ID. There is no mutation endpoint: edit the form and
create another dataset instead. The full SHA-256 version hashes normalized name
and validated cases including defaults. Export includes schema_version1 and the
case array. To recreate an exported dataset, use its name/cases; exported IDs,
timestamps and hashes are output metadata, not accepted creation fields.

Saved custom runs include dataset ID/name/full version/cases, template, configured
provider/model identifier, actual responses (capped at1000characters), per-case
latency and score. The version is a content fingerprint, not a trained-model
version. Provider aliases (e.g.free routers) do not identify resolved model weights.
Account ZIP export includes arena_datasets.ndjson and evaluation snapshots;
chat/note restoration ignores these collections.

Grading exact/json-canonical-v1 compares trimmed response text for exact cases.
JSON compares finite parsed values after sorted-key compact serialization, so
whitespace/key ordering is ignored while true and1 remain distinct.1 and1.0 also
remain distinct. No semantic/subjective grading, arbitrary Python, shell commands,
model-as-judge or hidden expected-answer prompt injection is involved.

Every non-demo model requires explicit external-call consent before any inference.
Up to3models×10cases means up to30calls; prices/tokens are not invented. There is
one active Arena run per API process,180seconds total budget and90seconds per case.
Budget-exhausted cases are explicitly unattempted/failed and remain in the score
denominator; provider errors are sanitized. There is a100stored-run quota per owner.
The gate is not distributed; production currently uses one worker. Runs remain
synchronous requests; disconnects/crashes can lose unfinished results and cannot
undo charges already incurred. No paid inference is used by automated QA.

Deleting a dataset deliberately retains its questions/expected answers in historical
run snapshots. Evaluation-history export/delete controls are the next increment,
not a shipped feature. Scores from user-authored tiny fixtures are not evidence of
general intelligence, model superiority, weight training or genuine code execution.
Current production storage remains ephemeral until PostgreSQL is securely bound.

Migration5 adds arena_datasets and its owner index; existing rows remain intact.
Rolling application code back can leave the additive table/data in place. Do not
drop user data as an automatic rollback. Local/CI checks cover migration/isolation;
genuine PostgreSQL integration checks persistence across restart and run retention.
