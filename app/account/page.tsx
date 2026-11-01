'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from '@supabase/supabase-js';
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { getSupabaseBrowserClient, getSupabaseBrowserConfigIssue } from '../../lib/supabase-browser';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '14px 15px', border: '1px solid #ded8cc',
  borderRadius: 8, background: '#fff', color: '#171713', fontSize: 15, outlineOffset: 2,
};
const buttonStyle: React.CSSProperties = {
  width: '100%', padding: '15px 18px', border: 0, borderRadius: 8, background: '#b99a62',
  color: '#171713', fontSize: 12, fontWeight: 800, letterSpacing: '.1em', cursor: 'pointer',
};
const linkStyle: React.CSSProperties = { color: '#8d7040', background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 700 };

export default function AccountPage() {
  const supabase = getSupabaseBrowserClient();
  const configIssue = getSupabaseBrowserConfigIssue();
  const [mode, setMode] = useState<Mode>('login');
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) { setUser(data.session?.user ?? null); setReady(true); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') { setMode('reset'); setMessage('Choose a new password for your account.'); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  function switchMode(next: Mode) {
    setMode(next); setMessage(''); setError(''); setPassword(''); setConfirmPassword('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setMessage('');
    if (!supabase) { setError(configIssue || 'Customer accounts are not configured.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin + '/account' },
        });
        if (authError) throw authError;
        if (data.session) { setUser(data.user); setMessage('Your Durgamma account is ready.'); }
        else setMessage('Account created. Please check your email and confirm your address before signing in.');
      } else if (mode === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setUser(data.user); setMessage('Welcome back to Durgamma Menswear.');
      } else if (mode === 'forgot') {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + '/account',
        });
        if (authError) throw authError;
        setMessage('If an account exists for that email, a password reset link has been sent.');
      } else {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('Your passwords do not match.');
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        setMessage('Password updated successfully.');
        setMode('login'); setPassword(''); setConfirmPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: authError } = await supabase.auth.signOut();
    if (authError) setError(authError.message);
    else { setUser(null); setMessage('You have been signed out.'); }
  }

  const heading = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Set a new password' : 'Welcome back';
  const description = mode === 'signup' ? 'Join Durgamma for a smoother shopping experience.' : mode === 'forgot' ? 'We will email you a secure password reset link.' : mode === 'reset' ? 'Choose a strong password to secure your account.' : 'Sign in to access your Durgamma customer account.';

  return (
    <main style={{ minHeight: '100vh', background: '#f5f2eb', color: '#171713', padding: '22px 16px 48px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#514b40', textDecoration: 'none', fontSize: 12, letterSpacing: '.08em', fontWeight: 700 }}>
          <ArrowLeft size={16}/> BACK TO STORE
        </Link>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 430px)', gap: 36, alignItems: 'center', minHeight: '82vh' }}>
          <section style={{ padding: 'clamp(24px, 6vw, 76px) 0' }}>
            <p style={{ fontSize: 11, letterSpacing: '.2em', fontWeight: 800, color: '#92784c' }}>DURGAMMA MENSWEAR</p>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(42px, 7vw, 76px)', lineHeight: 1.02, fontWeight: 400, margin: '18px 0' }}>Your style.<br/><em>Your account.</em></h1>
            <p style={{ maxWidth: 440, color: '#6d675d', lineHeight: 1.8 }}>A simpler way to shop your favourites, keep your details close and enjoy every Durgamma order.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 34, color: '#514b40', fontSize: 12, letterSpacing: '.06em' }}>
              <span>✓ PERSONAL ACCOUNT</span><span>✓ SECURE SIGN IN</span><span>✓ EASY CHECKOUT</span>
            </div>
          </section>

          <section style={{ background: '#fff', border: '1px solid #e8e1d5', borderRadius: 14, padding: 'clamp(24px, 5vw, 38px)', boxShadow: '0 18px 55px rgba(36,31,22,.07)' }}>
            {user ? (
              <div>
                <div style={{ width: 48, height: 48, borderRadius: 50, background: '#f2eadb', display: 'grid', placeItems: 'center', color: '#8d7040' }}><UserRound size={22}/></div>
                <p style={{ fontSize: 11, letterSpacing: '.16em', color: '#92784c', fontWeight: 800, marginTop: 25 }}>CUSTOMER ACCOUNT</p>
                <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 32, fontWeight: 400, margin: '8px 0 12px' }}>Hello{user.user_metadata?.full_name ? ', ' + user.user_metadata.full_name : ''}.</h2>
                <p style={{ color: '#6d675d', lineHeight: 1.6, overflowWrap: 'anywhere' }}>{user.email}</p>
                <div style={{ borderTop: '1px solid #eee8de', marginTop: 24, paddingTop: 20, display: 'grid', gap: 12 }}>
                  <p style={{ color: '#6d675d', fontSize: 13, margin: 0 }}>You are signed in to your Durgamma customer account.</p>
                  <button style={buttonStyle} onClick={signOut}>SIGN OUT</button>
                  <Link href="/" style={{ textAlign: 'center', color: '#8d7040', fontWeight: 700, textDecoration: 'none', fontSize: 13, padding: 8 }}>CONTINUE SHOPPING</Link>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 10, letterSpacing: '.17em', color: '#92784c', fontWeight: 800, margin: '0 0 10px' }}>CUSTOMER ACCOUNT</p>
                <h2 style={{ fontFamily: 'Georgia,serif', fontSize: 34, fontWeight: 400, margin: '0 0 8px' }}>{heading}</h2>
                <p style={{ color: '#777166', fontSize: 13, lineHeight: 1.6, margin: '0 0 24px' }}>{description}</p>
                <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
                  {mode === 'signup' && <label style={{ display: 'grid', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>FULL NAME<input style={fieldStyle} autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required minLength={2} maxLength={80} placeholder="Your name"/></label>}
                  <label style={{ display: 'grid', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>EMAIL ADDRESS<input style={fieldStyle} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"/></label>
                  {mode !== 'forgot' && <label style={{ display: 'grid', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>PASSWORD<input style={fieldStyle} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters"/></label>}
                  {mode === 'reset' && <label style={{ display: 'grid', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.1em' }}>CONFIRM NEW PASSWORD<input style={fieldStyle} type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} placeholder="Enter password again"/></label>}
                  <button style={{ ...buttonStyle, opacity: busy ? .65 : 1 }} disabled={busy}>{busy ? 'PLEASE WAIT…' : mode === 'signup' ? 'CREATE ACCOUNT' : mode === 'forgot' ? 'SEND RESET LINK' : mode === 'reset' ? 'UPDATE PASSWORD' : 'SIGN IN'}</button>
                </form>
                {mode === 'login' && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}><button style={{ ...linkStyle, fontSize: 12 }} onClick={() => switchMode('forgot')}>Forgot password?</button></div>}
                {mode !== 'reset' && <div style={{ borderTop: '1px solid #eee8de', marginTop: 22, paddingTop: 20, textAlign: 'center', color: '#777166', fontSize: 13 }}>
                  {mode === 'signup' ? <>Already have an account? <button style={linkStyle} onClick={() => switchMode('login')}>Sign in</button></> : mode === 'forgot' ? <button style={linkStyle} onClick={() => switchMode('login')}>Back to sign in</button> : <>New to Durgamma? <button style={linkStyle} onClick={() => switchMode('signup')}>Create account</button></>}
                </div>}
              </>
            )}
            {message && <p role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#39734a', background: '#eef7ef', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginTop: 18 }}><CheckCircle2 size={16} style={{ flexShrink: 0 }}/>{message}</p>}
            {(error || (!supabase && configIssue)) && <p role="alert" style={{ color: '#9c3830', background: '#fff0ed', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginTop: 18 }}>{error || configIssue} {configIssue && 'Please check the Supabase URL and publishable key in your Vercel environment variables.'}</p>}
            {!ready && <p style={{ color: '#777166', fontSize: 12, marginTop: 14 }}>Checking your account…</p>}
            <p style={{ color: '#999286', fontSize: 10, lineHeight: 1.5, marginTop: 24, display: 'flex', alignItems: 'center', gap: 6 }}><LockKeyhole size={12}/> Your password is handled securely by Supabase Authentication.</p>
          </section>
        </div>
      </div>
      <style>{'@media(max-width:760px){main>div>div:nth-child(2){grid-template-columns:1fr!important;gap:8px!important;min-height:auto!important}main>div>div:nth-child(2)>section:first-child{padding:42px 0 12px!important}}'}</style>
    </main>
  );
}
