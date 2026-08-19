# VolunteerU — launch checklist

Everything the code does is real and wired to Supabase (`hnfsexiveybupmrlcrac`).
This file lists the few things that live **outside** the code — dashboard
settings and one-time data steps — that need attention before real users arrive.

## 1. Transactional email

### Signup — works today, no SMTP needed
New accounts are confirmed immediately by the `handle_new_user` trigger
(`email_confirmed_at = now()`), so a student can sign up and sign in in one
step. This is deliberate: it means signup never depends on email delivery.
No confirmation email is sent, and none is required.

### Password reset — code is complete, delivery needs SMTP
The reset flow is fully built in the app:

1. `/forgot` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset })`
2. The emailed link opens `/reset`, where `detectSessionInUrl` establishes the
   recovery session.
3. `/reset` collects a new password and calls `supabase.auth.updateUser({ password })`,
   then signs the user into `/app`.

What is **not** in the code, because it is a dashboard setting that needs your
own provider credentials (a secret an assistant should never enter for you):

**Configure custom SMTP — ~5 minutes:**
1. Create a sending account with an email provider and get an API key / SMTP
   credentials. Resend (resend.com) is the simplest; Postmark and Amazon SES also
   work. Verify your sending domain there (add their DNS records) so mail isn't
   marked spam.
2. In Supabase → **Project → Authentication → Emails → SMTP Settings**, toggle
   **Enable Custom SMTP** and fill in:
   - Host (e.g. `smtp.resend.com`), Port (`465` or `587`)
   - Username (for Resend: `resend`) and Password (your API key)
   - Sender email + sender name (e.g. `no-reply@yourdomain.org`, `VolunteerU`)
3. In Supabase → **Authentication → URL Configuration**, set the **Site URL** to
   your production origin and add `<origin>/reset` (and `<origin>/**`) to
   **Redirect URLs**, or the reset link will refuse to redirect.
4. Test: use `/forgot` with a real inbox and confirm the reset email arrives and
   the link lands on `/reset`.

Why it's required: Supabase's built-in email sender is rate-limited to a handful
of messages per hour and is meant only for testing — it will not deliver reset
links reliably to real users. Until SMTP is set, the reset UI still behaves
correctly and never leaks whether an account exists — the link simply may not
arrive. (Signup is unaffected: it needs no email at all, see above.)

Also keep Supabase → Authentication → **"Confirm email" OFF**. The auto-confirm
trigger makes signup work without email; turning confirmation on would send a
confirm mail the app has no callback route for.

## 2. Organization verification — manual review (decided: the product owner)

The product does **not** auto-match or auto-verify. The flow is real and secured:

- A leader runs under a self-reported organization (badge: `SELF-REPORTED`).
- They submit **Request verification** from the project workspace. This stamps
  `listings.verification_requested_at` + `verification_note` (org name + staff
  contact) on the public listing (badge: `VERIFICATION REQUESTED`).
- Volunteers only ever see `✓ Verified` on a listing whose `verified = true`.

**Reviewer: the product owner** (keshavkrishnanbusiness@gmail.com) for now,
working from the Supabase SQL editor / MCP. The DB enforces this — the
`listings_guard_columns` trigger makes it **impossible for a founder to set
`verified` themselves** (verified against the live DB: an owner's self-verify
attempt is silently forced back to `false`; only a no-JWT service-role
connection can flip it). So the review cannot be bypassed from the app.

Pending queue — what to review:
```sql
select id, name, org_class, verification_note, verification_requested_at, owner_id
from public.listings
where verification_requested_at is not null and verified = false
order by verification_requested_at;
```

Approve (confirm the org + a named staff contact first, then):
```sql
update public.listings set verified = true where id = '<listing-id>';
```
The founder's own workspace reflects this on next load (`syncMyListingsVerification`).

Deny / revoke:
```sql
update public.listings
  set verified = false, verification_requested_at = null, verification_note = null
  where id = '<listing-id>';
```

There is intentionally no in-app admin UI yet. When volume warrants it, replace
this manual step with a reviewer role + admin screen (or notify the reviewer on
each new request). Until then, decide a turnaround you can meet before promising
one to users.

## 3. Pristine data before launch

The database currently holds **test accounts and their data** used during
development:
- `vu.founder.ana.2026@gmail.com`, `vu.searcher.ben.2026@gmail.com`,
  `vu.volunteer.sam.2026@gmail.com`
- listings, applications, messages and directory rows they created

These will appear in real users' Discover/search. Before launch, wipe them
(auth users + `profiles`, `user_state`, `listings`, `applications`, `messages`,
`volunteer_directory`) so the first real user sees an empty, honest product.
This is irreversible — run it deliberately.

## 4. Environment

- `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (publishable anon key; RLS is the real guard). Set the same vars in the host
  (Vercel, etc.). Do not commit `.env.local`.
