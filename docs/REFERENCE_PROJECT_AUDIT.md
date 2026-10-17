# Reference project audit

Inspected on 2026-10-13. Exact HEAD was obtained with git ls-remote; README and LICENSE were read from raw URLs at those commits. No reference code or weights are bundled. This is an initial integration audit, not a full security/legal/dependency review. No model equivalence benchmark has been performed.

## zijinz456/OpenTutor

Commit: `f0142f28e8ed1ab4047e16c9aee5c283a6ee98b7`.

Source license: MIT.

Local-first documents, adaptive tutoring, progress and knowledge organization. No source imported. Future learning subsystem will require ingestion/retrieval and isolation tests. CPU-compatible backend; model requirements depend on selected service.

Sources: [README](https://github.com/zijinz456/OpenTutor/blob/f0142f28e8ed1ab4047e16c9aee5c283a6ee98b7/README.md), [LICENSE](https://github.com/zijinz456/OpenTutor/blob/f0142f28e8ed1ab4047e16c9aee5c283a6ee98b7/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

## Comfy-Org/ComfyUI

Commit: `8010b48d2c1be986613f8e8c761527d205bd756f`.

Source license: GPL-3.0.

Node graphs, queue execution and external HTTP service. MODAX contains only an original HTTP adapter; no GPL implementation is embedded. CPU mode exists; practical GPU and RAM requirements depend on workflow/model. Custom nodes and paid partner nodes require explicit operator review.

Sources: [README](https://github.com/Comfy-Org/ComfyUI/blob/8010b48d2c1be986613f8e8c761527d205bd756f/README.md), [LICENSE](https://github.com/Comfy-Org/ComfyUI/blob/8010b48d2c1be986613f8e8c761527d205bd756f/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

## Tencent-Hunyuan/HunyuanVideo-1.5

Commit: `60783e704160023913bee78f0b47036d393d4dfa`.

Source license: Tencent Hunyuan Community License.

Official T2V/I2V pipelines and checkpoints. Pinned README lists NVIDIA CUDA and minimum 14 GB GPU memory with offloading. No weights downloaded or inference run. License begins by excluding EU/UK/South Korea; commercial/territorial terms require separate operator acceptance.

Sources: [README](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/60783e704160023913bee78f0b47036d393d4dfa/README.md), [LICENSE](https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5/blob/60783e704160023913bee78f0b47036d393d4dfa/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

## Lightricks/LTX-Video

Commit: `4b2d053057623ddd4d0a1d3e9cd28890e9ef487f`.

Source license: Apache-2.0 source; weights separately licensed.

Video inference and ComfyUI workflows. Source LICENSE is Apache-2.0; model-card/checkpoint licenses must be checked separately for each version. No weights or CUDA stack installed. Successor LTX-2 is a separate future audit, not an integrated backend.

Sources: [README](https://github.com/Lightricks/LTX-Video/blob/4b2d053057623ddd4d0a1d3e9cd28890e9ef487f/README.md), [LICENSE](https://github.com/Lightricks/LTX-Video/blob/4b2d053057623ddd4d0a1d3e9cd28890e9ef487f/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

## FlamxGames/godot-ai-assistant-hub

Commit: `90cdc127cd64baf08ab9c7b065797ad52fe86311`.

Source license: MIT.

Editor assistants, controlled code tools, project context, undo and API-agnostic providers. No plugin source imported. Future native editor plugin needs explicit change review and Godot undo/redo integration tests.

Sources: [README](https://github.com/FlamxGames/godot-ai-assistant-hub/blob/90cdc127cd64baf08ab9c7b065797ad52fe86311/README.md), [LICENSE](https://github.com/FlamxGames/godot-ai-assistant-hub/blob/90cdc127cd64baf08ab9c7b065797ad52fe86311/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

## Godot4-Addons/ai_assistant_for_godot

Commit: `e460f1f63a8e52d667630bb28bd0a480f28e7785`.

Source license: MIT.

Project context, file mentions, agent tools and Apply/Undo. MIT source reviewed. No code imported or plugin integration claimed. Credentials and model-service requirements remain external.

Sources: [README](https://github.com/Godot4-Addons/ai_assistant_for_godot/blob/e460f1f63a8e52d667630bb28bd0a480f28e7785/README.md), [LICENSE](https://github.com/Godot4-Addons/ai_assistant_for_godot/blob/e460f1f63a8e52d667630bb28bd0a480f28e7785/LICENSE).

Compatibility: not established by a live integration; independent deployment favored. Security: no trusted execution of fetched reference contents. Recheck exact dependencies, model cards, notices, credentials and hardware before integrating.

