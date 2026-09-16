# MODY AI Backend 0.2

Secure server-side multi-provider gateway for MODY AI. Provider secrets are environment variables and are never shipped to the browser/mobile app.

## Built-in providers

- OpenAI
- Anthropic
- Google Gemini
- xAI
- Mistral
- Groq
- OpenRouter
- Any additional OpenAI-compatible provider via `MODY_GENERIC_PROVIDERS_JSON`

The server does not maintain a fake permanent list of model names. `GET /v1/models` discovers models from configured providers at runtime.

## API

- `GET /health`
- `GET /v1/providers`
- `GET /v1/models?provider=openai`
- `POST /v1/chat`
- `POST /v1/multi-ai`

### Chat request

```json
{
  "provider": "openai",
  "model": "<model-id-returned-by-/v1/models>",
  "messages": [{"role":"user","content":"Hello"}]
}
```

### Multi-AI request

```json
{
  "prompt": "Solve this independently",
  "targets": [
    {"provider":"openai","model":"<id>"},
    {"provider":"anthropic","model":"<id>"}
  ]
}
```

Initial answers are executed independently. Critic/synthesis should be a separate evaluated stage; this backend does not claim hidden chain-of-thought access.

## Run

```bash
cp .env.example .env
# Set provider keys in your host's secret/environment settings.
node server.mjs
```

Node 20+ is required. No npm runtime dependencies are required.
