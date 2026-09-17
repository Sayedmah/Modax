# Modax AI Commercial Core Design

**Product:** Modax AI — All AI. One Place.  
**Arabic tagline:** كل الذكاء الاصطناعي في مكان واحد

## Goal

Turn the existing Modax AI prototype into a commercial multi-user SaaS while preserving the currently working AI answer engine. Every end user gets a private workspace, while Modax administrators control providers, models, plans, quotas, billing, and support from a separate administration surface.

## Approved identity

- Product name: **Modax AI**
- English tagline: **All AI. One Place.**
- Arabic tagline: **كل الذكاء الاصطناعي في مكان واحد**
- App icon: simplified robot head.
- Main logo: robot + `Modax AI`.
- Mascot illustration: full Modax robot with microphone.

## Environment

- Supabase organization: `Modax Ai`
- Development project: `modax-development`
- Supabase project ref: `ctjklckrcredhjtflddn`
- Region: `eu-central-1` (Frankfurt)
- Current application repository: `Sayedmah/Modax`
- Backend deploy branch: `mody-game-studio`
- Current public frontend branch: `gh-pages`

Production will later use isolated staging and production projects rather than reusing development data.

## Architecture

```text
Browser / Modax App
       |
       | Supabase Auth session (JWT)
       v
Modax Backend / AI Gateway
       |
       +---- Supabase Postgres + Storage
       |
       +---- OpenAI / Anthropic / Google / xAI / other providers

Admin UI
       |
       +---- same Auth, but server + RLS require admin role
       +---- changes plans/models/quotas through protected admin APIs
```

The browser never receives provider API secrets or Supabase service-role credentials. AI provider keys stay server-side. The browser may receive only the Supabase project URL and publishable key, which are intended for client use when RLS is correctly enforced.

## Authentication

Initial supported sign-in methods:

1. Email/password
2. Google
3. Apple

Supabase Auth is the identity source. Each account gets one stable UUID (`auth.users.id`). Application data references that UUID as `user_id`.

The existing chat engine must not be rewritten as part of authentication. Authentication is wrapped around the working API instead.

## Roles

Phase 1 defines four roles, even though only `owner` and `user` need UI initially:

- `owner` — full platform control; intended for the platform owner.
- `admin` — manages users, plans, models, quotas and billing operations.
- `support` — limited support access, no default access to private conversation contents.
- `user` — normal customer.

Role assignments live in `public.user_roles`; users cannot change their own role. Roles may later be projected into JWT custom claims through a Supabase Custom Access Token Hook. Server-side authorization remains mandatory even if the UI hides admin features.

The first Owner account is not hard-coded by email. After the owner signs up, its UUID will be explicitly promoted in the database.

## Admin security

- Admin UI is separate from the normal user experience; target production host is `admin.modax.ai`.
- Admin endpoints require a valid Supabase JWT and a server-side role check.
- Owner/admin accounts should later require MFA (`aal2`).
- Supabase service-role/secret keys are server-only.
- All sensitive administrative writes are recorded in `admin_audit_log`.
- Support staff cannot read private conversation contents by default.

## Data model roadmap

### Phase 1 — Identity and access

- `profiles`
- `user_roles`
- `admin_audit_log`

### Phase 2 — Private workspace

- `conversations`
- `messages`
- `files`
- `projects`
- Storage paths scoped to `user_id/...`

### Phase 3 — Commercial controls

- `plans`
- `subscriptions`
- `model_catalog`
- `plan_models`
- `usage_events`
- `usage_monthly`
- `credit_ledger`
- `payments`

Every user-owned table has `user_id uuid` and Row Level Security. User-facing policies always scope rows with `auth.uid() = user_id` unless a narrowly defined role permission explicitly allows more.

## AI model gateway

End users never add provider keys. Modax operators manage a central model catalog with fields for provider, provider model ID, display name, enabled state, plan requirement, credit multiplier, capability flags, and AUTO-router priority.

The backend chooses allowed models according to the user's plan and remaining quota. Provider costs and model availability can change without requiring the user to reconfigure anything.

## Usage and subscriptions

Billing is not based only on message count. Modax will use an internal credit ledger so models, images, files, builder executions and other tools can have different cost weights.

A request is authorized in this order:

1. Verify user session.
2. Load active subscription/plan.
3. Verify requested capability/model is allowed.
4. Verify quota/credits/storage limits.
5. Execute provider request.
6. Record measured usage and estimated internal cost.

Payment provider integration is a later phase and must be webhook-driven. Payment providers do not become the source of authorization truth; Modax's database does.

## Builder roadmap

`Modax Builder` will be a separate product surface for no-code website/web-app creation. AI-generated code must run in isolated sandboxes, never inside the main Render backend. Builder will eventually provide planning, project files, package installation, preview, error repair, tests, and deployment.

## Non-negotiable security constraints

- No AI provider API key in frontend code, GitHub, localStorage or URLs.
- No Supabase service-role key in frontend code.
- RLS enabled on all user-owned tables before client access.
- Backend validates JWT signature, issuer, audience and expiration.
- Admin authorization is enforced server-side and in database policies.
- Admin changes are auditable.
- Existing working Gemini `generateContent` answer path stays stable while auth is introduced.

## First implementation slice

The first independently testable slice is **Identity & Admin Foundation**:

1. Create `profiles`, `user_roles`, and `admin_audit_log` with RLS.
2. Add frontend sign-in/session shell for email, Google and Apple.
3. Add backend JWT verification middleware without changing the working answer engine.
4. Require authentication for AI calls.
5. Add an initial admin page that is inaccessible to normal users.
6. Promote the owner's first real account explicitly after signup.

Cloud conversations, storage, subscriptions and paid model entitlements follow in separate implementation plans after this slice is verified.