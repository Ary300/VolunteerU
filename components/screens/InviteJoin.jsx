'use client';

/* ==========================================================================
   InviteJoin.jsx, the page a lead's invite link opens (/invite/<token>)
   Signed out: says who added the student to which project, with Create
   account and Sign in. Both come back here through ?next= (lib/safePath.js).
   Signed in: joins the project right away (claim_roster_invite) and goes to
   the project's page, where the student is a member. A used, canceled or
   unknown link says so in plain words and offers a way on.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { S } from '../../lib/style.js';
import { C, F } from '../../lib/tokens.js';
import { Button } from '../ui.jsx';
import { MarketingHeader, MarketingFooter } from '../Marketing.jsx';
import { toast } from '../../lib/overlays.js';
import { myId } from '../../lib/listings.js';
import { previewInvite, claimInvite, TOKEN_RX } from '../../lib/invites.js';

const H1 = `margin:0;font:650 clamp(28px, 6vw, 40px)/1.1 ${F.display};letter-spacing:-0.025em;color:${C.ink};text-wrap:balance`;
const BODY = `margin:14px 0 0;font:400 17px/1.55 ${F.body};color:${C.ink2};max-width:520px`;

/* What went wrong, by the reason lib/invites.js claimInvite returns. */
const PROBLEMS = {
  invalid: {
    title: "This invite link doesn't work",
    body: 'Check that the whole link was copied. If it still won’t open, ask the person who sent it for a new one.',
  },
  revoked: {
    title: 'This invite was canceled',
    body: 'The lead took it back. Ask them for a new link if you should still be on the team.',
  },
  used: {
    title: 'This invite was already used',
    body: 'Someone joined with this link already. If that was you on another account, sign in with that one. If not, ask the lead for a new link.',
  },
  closed: {
    title: "This project isn't taking new members",
    body: 'It was paused or closed after you got the link. Other opportunities are open on Discover.',
  },
  own: {
    title: 'This invite is for your own project',
    body: 'Send the link to the student you added. It puts them on your roster when they make an account.',
  },
  failed: {
    title: "We couldn't open your invite",
    body: 'Check your connection and try again.',
  },
};

function Page({ children }) {
  return (
    <div style={S(`min-height:100vh;background:${C.white};display:flex;flex-direction:column`)}>
      <MarketingHeader />
      <main id="vu-main" tabIndex={-1} className="mk-wrap" style={S('flex:1;width:100%;box-sizing:border-box;padding-top:56px;padding-bottom:96px;outline:none')}>
        <div style={S('max-width:600px')}>{children}</div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Actions({ children }) {
  return <div style={S('margin-top:28px;display:flex;gap:12px;flex-wrap:wrap;align-items:center')}>{children}</div>;
}

/** @param {{ token: string }} props */
export default function InviteJoin({ token }) {
  const router = useRouter();
  const valid = TOKEN_RX.test(String(token || ''));
  const back = `/invite/${valid ? token : ''}`;
  const nextQ = `?next=${encodeURIComponent(back)}`;
  // loading | signed-out | joining | problem
  const [phase, setPhase] = useState('loading');
  const [preview, setPreview] = useState(null);
  const [problem, setProblem] = useState(null);
  const [nonce, setNonce] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!valid) { setProblem('invalid'); setPhase('problem'); return; }
      const [me, pv] = await Promise.all([myId().catch(() => null), previewInvite(token)]);
      if (!alive) return;
      setPreview(pv.preview);
      if (!me) {
        if (pv.failed) { setProblem('failed'); setPhase('problem'); return; }
        if (!pv.preview) { setProblem('invalid'); setPhase('problem'); return; }
        setPhase('signed-out');
        return;
      }
      if (started.current) return;
      started.current = true;
      setPhase('joining');
      const res = await claimInvite(token);
      if (!alive) return;
      started.current = false;
      if (res.ok) {
        const name = pv.preview ? pv.preview.listingName : 'the project';
        toast({ title: `Joined ${name}`, message: 'You’re on the team. Sign up for the shifts you can make.', tone: 'ok' });
        router.replace(`/join/${res.listingId}`);
        return;
      }
      if (res.reason === 'signed_out') { setPhase(pv.preview ? 'signed-out' : 'problem'); if (!pv.preview) setProblem('invalid'); return; }
      setProblem(res.reason in PROBLEMS ? res.reason : 'failed');
      setPhase('problem');
    })();
    return () => { alive = false; };
  }, [token, valid, nonce, router]);

  if (phase === 'loading' || phase === 'joining') {
    return (
      <Page>
        <div role="status" aria-live="polite">
          <h1 style={S(H1)}>{phase === 'joining' && preview ? `Joining ${preview.listingName}` : 'Opening your invite'}</h1>
          <p style={S(BODY)}>{phase === 'joining' ? 'Adding you to the team.' : 'Checking the link.'}</p>
        </div>
      </Page>
    );
  }

  if (phase === 'signed-out' && preview) {
    const who = preview.inviterFirstName;
    const first = String(preview.invitedName || '').trim().split(/\s+/)[0];
    return (
      <Page>
        <h1 style={S(H1)}>
          {who ? `${who} added you to ${preview.listingName} on VolunteerU` : `You're invited to ${preview.listingName} on VolunteerU`}
        </h1>
        {preview.orgName ? <p style={S(`margin:10px 0 0;font:600 15px/1.4 ${F.body};color:${C.ink}`)}>{preview.orgName}</p> : null}
        <p style={S(BODY)}>
          {first ? `Hi ${first}. ` : ''}Make a free account to join the team. You'll see the shifts, get messages from {who || 'the lead'} and have your hours tracked on your profile.
        </p>
        <Actions>
          <Button href={`/signup${nextQ}`} variant="primary" size="lg">Create account</Button>
          <Button href={`/signin${nextQ}`} variant="outline" size="lg">Sign in</Button>
        </Actions>
        <p style={S(`margin:20px 0 0;font:400 14px/1.5 ${F.body};color:${C.ink2}`)}>
          Already have an account? Sign in and you'll join with it.
        </p>
      </Page>
    );
  }

  const p = PROBLEMS[problem] || PROBLEMS.failed;
  return (
    <Page>
      <h1 style={S(H1)}>{p.title}</h1>
      <p style={S(BODY)}>{p.body}</p>
      <Actions>
        {problem === 'failed' ? (
          <Button variant="primary" size="lg" onClick={() => { setPhase('loading'); setNonce((n) => n + 1); }}>Try again</Button>
        ) : problem === 'own' ? (
          <Button href="/lead" variant="primary" size="lg">Open your project</Button>
        ) : (
          <Button href="/discover" variant="primary" size="lg">Find opportunities</Button>
        )}
        <Button href="/" variant="outline" size="lg">Go to VolunteerU</Button>
      </Actions>
    </Page>
  );
}
