# Known limitations

- The master-prompt complete MVP is **not complete**. This is its first verified vertical slice.
- No authorized live model credentials were used. Real inference, measured model intelligence, costs and provider model discovery remain unverified. Demo chat/coder are explicitly deterministic test adapters.
- Native Flutter client, Windows installer, APK/AAB, iOS project/IPA are not implemented. No Flutter SDK or signing/export setup was available. Current client is an Arabic web operator console with layout direction toggle; no English translation layer or Markdown syntax highlighting yet.
- Docker daemon was unavailable. Isolation argv/staging/error contracts are tested with mocks; actual container runtime and Docker image build are unverified. Host never executes provider-generated Python/GDScript.
- Godot 4.6 headless gameplay works. Visual/mobile device, controller hardware, accessibility and performance testing are not complete. Export presets are provided; no export templates, Android SDK or iOS signing were installed. No executable export is claimed.
- Coder is a bounded generation/validation workflow, not a complete autonomous repair/repository-inspection/reviewer loop. No internal GitHub publishing integration, multi-agent OMEGA, measured AUTO routing or learned world model.
- Rule-based task plans and recorded modes do not confer foundation-model training. No fine-tuning, model weights, datasets, GPU inference, benchmark leaderboard or superiority results.
- ComfyUI transport only. No operational GPU worker, durable media queue, approved workflows/model cards, generated image/video files or public media routes.
- File attachments/PDF/DOCX/XLSX extraction, multimodal analysis, vector retrieval and learning engine are future milestones. Saved notes are not automatically used for chat context.
- Prototype deployment is single worker/local or dedicated environment. No production RBAC, encrypted SQLite, distributed jobs, MFA, full cost budgets or cross-user OS sandbox guarantees. See SECURITY.md.
- Snapshot retention is ten per workspace; older snapshot IDs can no longer be restored. SQLite recovery assumes a single active process.
