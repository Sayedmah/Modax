# Modax Identity & Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated private Modax accounts and a server-enforced Owner/Admin foundation without changing the working AI answer engine.

**Architecture:** Supabase Auth issues user JWTs. The static frontend keeps only the public Supabase URL/publishable key and sends `Authorization: Bearer <token>` to the existing Render backend. The backend validates JWTs against Supabase JWKS, looks up application roles, and protects AI/admin routes. Postgres RLS isolates user data and prevents clients from modifying roles.

**Tech Stack:** Supabase Auth/Postgres/RLS, Node.js >=20, `jose`, existing static HTML/JS frontend, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-17-modax-commercial-core-design.md`

## Global Constraints

- Product name is `Modax AI`.
- English tagline is `All AI. One Place.`.
- Arabic tagline is `كل الذكاء الاصطناعي في مكان واحد`.
- Supabase development project is `ctjklckrcredhjtflddn`.
- Provider API keys and Supabase server secrets never appear in frontend code.
- Existing Gemini `generateContent` answer path is not rewritten in this phase.
- Role changes cannot be performed by normal authenticated users.
- Owner/admin authorization must be enforced server-side, not only by hiding UI.
- RLS must be enabled before user data is exposed to the browser.

---

### Task 1: Create identity and RBAC schema with RLS

**Files:**
- Create: `supabase/migrations/202609170001_identity_admin_foundation.sql`
- Test: database assertions executed against `ctjklckrcredhjtflddn`

**Interfaces:**
- Produces: `public.profiles`, `public.user_roles`, `public.admin_audit_log`
- Produces: `public.app_role` enum with `owner|admin|support|user`
- Produces: `public.current_app_role()` returning the caller's highest application role
- Produces: trigger creating a profile + `user` role for every new `auth.users` row

- [ ] **Step 1: Write the migration with default-deny RBAC**

```sql
create type public.app_role as enum ('owner','admin','support','user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  locale text not null default 'ar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  primary key (user_id, role)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_type text not null,
  target_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  ) on conflict (id) do nothing;

  insert into public.user_roles(user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.user_roles
     where user_id = auth.uid()
     order by case role
       when 'owner' then 1
       when 'admin' then 2
       when 'support' then 3
       else 4
     end
     limit 1),
    'user'::public.app_role
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "roles_read_own"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create policy "roles_admin_read"
on public.user_roles for select to authenticated
using (public.current_app_role() in ('owner','admin'));

create policy "audit_admin_read"
on public.admin_audit_log for select to authenticated
using (public.current_app_role() in ('owner','admin'));
```

- [ ] **Step 2: Apply the migration to the development project**

Use Supabase `apply_migration` with project `ctjklckrcredhjtflddn` and migration name `identity_admin_foundation`.

- [ ] **Step 3: Verify schema and RLS are present**

Run:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in ('profiles','user_roles','admin_audit_log')
order by tablename;
```

Expected: all three rows have `rowsecurity = true`.

- [ ] **Step 4: Run Supabase security advisors**

Expected: no missing-RLS advisory for these tables. Any advisory must be resolved before moving on.

- [ ] **Step 5: Commit the migration**

```bash
git add supabase/migrations/202609170001_identity_admin_foundation.sql
git commit -m "feat: add Modax identity and RBAC schema"
```

---

### Task 2: Add backend JWT verification without touching provider logic

**Files:**
- Create: `backend/auth.mjs`
- Create: `tests/auth.test.mjs`
- Modify: `backend/package.json`
- Modify: `backend/.env.example`
- Modify: `backend/server.mjs`

**Interfaces:**
- Produces: `createAuthVerifier({ issuer, audience, jwksUrl })`
- Produces: `requireUser(req)` -> `{ id, email, claims }`
- Produces: `requireRole(user, allowedRoles)`
- Consumes env: `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE=authenticated`

- [ ] **Step 1: Write failing auth tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBearerToken, requireRole } from '../backend/auth.mjs';

test('extracts bearer token',()=>{
  assert.equal(getBearerToken({authorization:'Bearer abc123'}),'abc123');
});

test('rejects missing bearer token',()=>{
  assert.throws(()=>getBearerToken({}),/Authentication required/);
});

test('owner satisfies owner-only check',()=>{
  assert.doesNotThrow(()=>requireRole({role:'owner'},['owner']));
});

test('normal user cannot enter admin route',()=>{
  assert.throws(()=>requireRole({role:'user'},['owner','admin']),/Forbidden/);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test tests/auth.test.mjs
```

Expected: FAIL because `backend/auth.mjs` does not exist.

- [ ] **Step 3: Add `jose` and implement JWT verification**

`backend/package.json` must add:

```json
"dependencies": {
  "jose": "^6.1.0"
}
```

`backend/auth.mjs` must use `createRemoteJWKSet` + `jwtVerify`, validate issuer `${SUPABASE_URL}/auth/v1`, audience `authenticated`, and return the JWT subject as user ID. No service key is needed to validate a user JWT.

- [ ] **Step 4: Add a server-side role lookup**

Use the authenticated user's JWT to call Supabase REST endpoint:

```text
GET {SUPABASE_URL}/rest/v1/user_roles?select=role&user_id=eq.{userId}
Authorization: Bearer {userAccessToken}
apikey: {SUPABASE_PUBLISHABLE_KEY}
```

Choose the highest role using `owner > admin > support > user`. Never trust a role value sent in the request body.

- [ ] **Step 5: Protect AI routes while keeping health public**

`GET /health` stays public.

Require auth for:

```text
POST /v1/chat
POST /v1/chat/stream
POST /v1/multi-ai
POST /v1/game-studio/*
```

Do not change the internal `chat()` / `generateContent` provider code; only gate entry to protected routes.

- [ ] **Step 6: Run tests and syntax check**

Run:

```bash
node --test tests/auth.test.mjs tests/stable-answer-stream.test.mjs
node --check backend/server.mjs
```

Expected: all tests pass; syntax check exits 0.

- [ ] **Step 7: Commit**

```bash
git add backend/auth.mjs backend/package.json backend/.env.example backend/server.mjs tests/auth.test.mjs
git commit -m "feat: require Supabase authentication for Modax APIs"
```

---

### Task 3: Add Modax sign-in and session shell to the current frontend

**Files:**
- Create: `auth.js`
- Create: `login.html`
- Modify: `index.html`
- Modify: `manifest.webmanifest`
- Test: `tests/frontend-auth.test.mjs`

**Interfaces:**
- Produces: `window.modaxAuth.getSession()`
- Produces: `window.modaxAuth.getAccessToken()`
- Produces: `window.modaxAuth.signOut()`
- Consumes public config: Supabase URL + publishable key only

- [ ] **Step 1: Write static contract tests**

The test reads the frontend files and asserts:

```js
assert.match(loginHtml,/Modax AI/);
assert.match(loginHtml,/Google/);
assert.match(loginHtml,/Apple/);
assert.match(loginHtml,/البريد الإلكتروني/);
assert.doesNotMatch(authJs,/service_role|sb_secret_/i);
assert.match(indexHtml,/All AI\. One Place\./);
```

- [ ] **Step 2: Verify tests fail before implementation**

Run:

```bash
node --test tests/frontend-auth.test.mjs
```

Expected: FAIL because `login.html` and `auth.js` do not yet exist.

- [ ] **Step 3: Implement login screen**

`login.html` must show:

- Modax AI logo/mascot slot.
- `Modax AI — All AI. One Place.`
- `كل الذكاء الاصطناعي في مكان واحد`
- Google button using `signInWithOAuth({ provider: 'google' })`.
- Apple button using `signInWithOAuth({ provider: 'apple' })`.
- Email/password sign-up and sign-in.
- Password recovery entry point.

Use Supabase JS v2 and only the publishable project key.

- [ ] **Step 4: Gate the current workspace**

At `index.html` boot:

```js
const session = await window.modaxAuth.getSession();
if (!session) location.replace('./login.html');
```

On every backend request:

```js
headers: {
  'Content-Type':'application/json',
  'Authorization': `Bearer ${await window.modaxAuth.getAccessToken()}`
}
```

Existing chat rendering and answer engine behavior must remain unchanged.

- [ ] **Step 5: Add account menu and sign-out**

Show the authenticated email/avatar in the sidebar and provide `تسجيل الخروج`. Signing out clears only the Supabase session; user cloud data remains untouched.

- [ ] **Step 6: Run frontend contract tests**

Run:

```bash
node --test tests/frontend-auth.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add auth.js login.html index.html manifest.webmanifest tests/frontend-auth.test.mjs
git commit -m "feat: add Modax account sign-in experience"
```

---

### Task 4: Add the first protected Admin surface

**Files:**
- Create: `admin.html`
- Create: `admin.js`
- Create: `tests/admin-access.test.mjs`
- Modify: `backend/server.mjs`

**Interfaces:**
- Produces: `GET /v1/me` -> `{ id, email, role }`
- Produces: `GET /v1/admin/overview` -> admin-only summary
- Requires role: `owner|admin`

- [ ] **Step 1: Write failing role-route tests**

Test the authorization helper independently:

```js
test('admin route accepts owner',()=>{
  assert.equal(canAccessAdmin('owner'),true);
});

test('admin route rejects user',()=>{
  assert.equal(canAccessAdmin('user'),false);
});
```

- [ ] **Step 2: Add `/v1/me` and `/v1/admin/overview`**

`/v1/me` requires any authenticated user.

`/v1/admin/overview` requires `owner` or `admin` and initially returns only safe aggregate data:

```json
{
  "ok": true,
  "role": "owner",
  "sections": ["users","models","plans","usage","audit"]
}
```

Do not expose other users' conversation contents.

- [ ] **Step 3: Build `admin.html`**

The page must:

1. require a valid Supabase session;
2. call `/v1/me`;
3. immediately redirect non-admin users to the main app;
4. display the five initial admin sections as disabled/placeholder navigation except the Overview card.

No role decision may rely solely on client JavaScript.

- [ ] **Step 4: Run tests**

Run:

```bash
node --test tests/admin-access.test.mjs tests/auth.test.mjs
node --check backend/server.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin.html admin.js backend/server.mjs tests/admin-access.test.mjs
git commit -m "feat: add protected Modax admin foundation"
```

---

### Task 5: Configure providers and bootstrap the first Owner account

**Files:**
- Modify only environment/configuration and database rows; no hard-coded owner email.

**Interfaces:**
- Consumes: actual first Modax signup UUID
- Produces: one `owner` role assignment

- [ ] **Step 1: Configure development Auth URLs**

Set Supabase Auth Site URL to the development Modax frontend and allow the exact OAuth callback/redirect URLs used by GitHub Pages development.

- [ ] **Step 2: Configure Google OAuth**

Create Google OAuth credentials for the Modax development callback and enable the Google provider in Supabase Auth.

- [ ] **Step 3: Configure Apple OAuth**

Create Apple Sign in with Apple credentials and enable Apple provider in Supabase Auth. If Apple developer credentials are not yet available, leave the button visibly disabled with `قريبًا` rather than faking a working sign-in.

- [ ] **Step 4: Create the owner's real account through the normal login screen**

Do not create a special hidden authentication path.

- [ ] **Step 5: Promote that UUID explicitly**

After identifying the signed-in owner's UUID:

```sql
insert into public.user_roles(user_id, role, created_by)
values ('<OWNER_UUID>', 'owner', '<OWNER_UUID>')
on conflict do nothing;

insert into public.admin_audit_log(actor_user_id, action, target_type, target_id, after_data)
values ('<OWNER_UUID>', 'bootstrap.owner_granted', 'user', '<OWNER_UUID>', '{"role":"owner"}'::jsonb);
```

The literal UUID is supplied only at execution time after signup; it is never committed to source control.

- [ ] **Step 6: Verify owner and normal-user boundaries**

Using two test accounts:

```text
Normal user -> /v1/me = 200 role user
Normal user -> /v1/admin/overview = 403
Owner       -> /v1/admin/overview = 200
Unauthenticated -> /v1/chat = 401
Owner/user authenticated -> /v1/chat returns normal Modax AI answer
```

- [ ] **Step 7: Run Supabase security advisors again**

Resolve any high/critical security advisory introduced by the schema before considering Phase 1 complete.

---

### Task 6: Phase-1 release verification

**Files:**
- Modify: `backend/README.md`
- Modify: root `README.md`

**Interfaces:**
- Produces deployment/config checklist for `modax-development`

- [ ] **Step 1: Run full backend tests**

```bash
node --test tests/*.test.mjs
node --check backend/server.mjs
```

Expected: zero test failures and syntax exit 0.

- [ ] **Step 2: Verify live development paths**

Check:

```text
/health                  public
/login.html              public
/                         redirects unauthenticated visitor to login
/v1/chat                 returns 401 without Bearer token
/v1/chat                 answers with valid user token
/admin.html              redirects normal user
/admin.html              loads for Owner
```

- [ ] **Step 3: Confirm secrets boundary**

Search repository and browser-delivered files for:

```text
service_role
sb_secret_
OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
```

Expected: no secret values are present in frontend/static assets or committed files.

- [ ] **Step 4: Document the next phase**

README should state that Phase 2 will move conversations/messages/files from local-only storage to Supabase-owned user rows and Storage with RLS; subscriptions/model entitlements remain Phase 3.

- [ ] **Step 5: Commit verification docs**

```bash
git add README.md backend/README.md
git commit -m "docs: document Modax authenticated development setup"
```
