# Current limitations after web milestone 0.2

- Website is deployed at https://modax-omega.onrender.com. Render free preview is not production hosting. Database modax-omega-data is available, but DATABASE_URL remains unbound because the browser dashboard sign-in was aborted. Until linked, local hosted database contents are ephemeral and must not be trusted for durable records. Free Render Postgres expires 2026-11-12; a later storage decision is required.
- Provider profiles can connect authorized real compatible/OpenAI and Anthropic services with encrypted keys. No live inference key was supplied or used by development tests; model intelligence, token pricing and GPU generation remain unverified. Default demo is labeled.
- File extraction supports bounded PDF/DOCX/XLSX/CSV/text; scanned PDF OCR and images/vision are not implemented. Retrieval uses explicit document IDs and substring chunk search, not vector search.
- Coder has observed-error syntax repair (up to two retries), durable workspace/snapshots, and optional Docker tests. Actual Docker runtime remains unverified; internal repository inspection/GitHub PR creation and multi-agent reviewer loops are not implemented.
- Arena measures only three fixed text/JSON smoke cases. It is not a comprehensive frontier leaderboard. Prompt-template experiments are inference comparisons, not weight training.
- Godot 4.6 gameplay is headless-tested locally and in CI. Managed official-engine acquisition is configured for hosting; live hosted game validation is checked separately. No native game export is claimed; templates/SDK/signing remain absent.
- ComfyUI transport remains mock-tested only. No real image/video worker, approved model weights or media output exists.
- Native Flutter client/Windows installer/APK/IPA, trained model weights, frontier superiority, real-time world models and full original master prompt completion are not claimed.
- Public preview signup is enabled so users can create their own accounts; no admin bootstrap password is distributed. Prototype uses one API worker and bearer auth, without MFA or full production RBAC. See SECURITY.md.
- Six daily scheduled continuation attempts are configured for Oct 14–19, 2026. Tool availability and actual execution govern progress; no uninterrupted six-day worker or guaranteed finish exists.
