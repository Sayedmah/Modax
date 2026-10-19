# MODAX identity and model transparency — 0.6.2

The companion mark combines an angular M and a robot face. The generated transparent PNG is shipped locally at `apps/web/brand/modax-logo.png`, used in the sidebar, welcome state, boot state and favicon. Generated with the built-in image tool; prompt: original compact geometric M/robot companion, mint/cyan eyes and periwinkle accents, charcoal outline, transparent background, no text or watermark. It is a raster asset, not an SVG or a trademark clearance claim.

The workspace uses charcoal surfaces, restrained mint signals, readable text, visible focus, reduced-motion support and a skip link. Existing M/X navigation, owner boundaries and tools are retained. Three starters populate a prompt or open the actual HTML/Coder form without making inference calls. Ctrl/Cmd+Enter sends; Enter remains multiline. Replies have a copy control.

## Model identity contract

The SSE `start` event supplies the selected provider, configured model and demo flag. `done` adds a provider-reported model when the stream actually supplied one. Reported names are bounded to 100 printable characters, context-local to avoid concurrent request leakage. No model is inferred from response style. Failed streams do not become successful responses.

The assistant message stores the reported model, or the configured model when no reported name exists, in the existing `messages.model` field. Reopening history and ordinary exports preserve this name. Provider attribution is available in the live stream; the existing history field preserves the model name, not full provenance. Old rows containing only adapter IDs remain explicitly marked as historical names not saved. Router aliases show that their final model is unknown unless actually reported. Names are provider claims, not independently attested model weights.

## Requested skill review

Read the five user-added skill packages: reverse-engineer-anything, rea-tool-design, rea-analysis-optimization, rea-ci-tests-audit and rea-changelog-update. Their REA-specific commands, engines and release conventions do not apply to MODAX. In particular, REA explicitly directs ordinary complete source-repository work to normal repository tools. Applied the relevant principles: inspect the actual boundary, preserve evidence and unknowns, avoid speculative caching, test real regressions and document only verified changes. No REA engine or MCP installation is claimed. Frontend UI Engineering and image-generation guidance supplied the UI/asset workflow.

## Verification scope

Backend tests cover AUTO selection metadata, persisted names, reported router names, reset and concurrent isolation. Browser QA covers logo loading, actual starter handoffs, keyboard submission, demo and reported model labels, reopening history and 320/768/1024/1440px overflow. Demo and protocol fixtures do not establish real Gemini availability or stronger intelligence. No model training or automatic learning was introduced.

Server configuration carried forward: the existing Gemini key was copied during the previous authorized operation but inference failed with a generic provider error. `MODAX_GEMINI_MODEL` remains blank to keep AUTO on the existing OpenRouter setup; Gemini is not claimed functional. Production SQLite remains ephemeral pending durable PostgreSQL configuration.
