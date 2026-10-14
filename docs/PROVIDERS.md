# Gemini and OpenRouter

MODAX 0.3.4 supports named Gemini and OpenRouter text/streaming profiles. The existing chat, Coder and Arena select these through the same owner-scoped registry. No image/video or trained model capability is implied.

In Settings choose Google Gemini or OpenRouter, enter a model identifier available to your provider account and its API key, then save. The official endpoint is pinned automatically. Select the saved model in Chat/Coder/Arena. Keys are encrypted server-side, excluded from exports and never returned in profile responses. Do not paste keys into chat or GitHub. Models and price/access limits vary; MODAX does not assume a particular model is available or switch providers after failures.

Operators can instead configure server secrets:

| Provider | Secret | Model setting | Fixed endpoint |
| --- | --- | --- | --- |
| Gemini | GEMINI_API_KEY | MODAX_GEMINI_MODEL | https://generativelanguage.googleapis.com/v1beta/openai |
| OpenRouter | OPENROUTER_API_KEY | MODAX_OPENROUTER_MODEL | https://openrouter.ai/api/v1 |

Both a key and model are required before a server connection is exposed. AUTO prefers configured real providers over the demo fixture. Server-wide providers are shared by authorized users; per-user profiles preserve owner isolation. No keys are provisioned by this change and no paid test inference is performed. Usage counts are recorded only when the completed stream reports them; monetary costs remain unknown.

Protocol sources checked 2026-10-14:
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/gemini-api/docs/partner-integration
- https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request

Known hosting limitation: production SQLite is ephemeral until DATABASE_URL is securely bound. User provider profiles can be lost on a host restart; account exports intentionally exclude their credentials.
