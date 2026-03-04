import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useGoogleLogin } from '@react-oauth/google';
import { googleLogin as googleLoginApi, triggerSupabase2FA, verifySupabase2FA } from '@/services/api';
import { AuthUI } from '@/components/ui/auth-fuse';
import { supabase } from '@/lib/supabase';
import { Loader2, KeyRound, RotateCcw } from 'lucide-react';
import ShaderBackground from '@/components/ui/shader-background';

// ── Inline 6-digit OTP input ──────────────────────────────────────────────────
function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const update = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits]; next[i] = v; setDigits(next);
    if (v && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d !== '')) onComplete(next.join(''));
  };
  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };
  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!p) return;
    const next = [...digits]; p.split('').forEach((c, j) => { next[j] = c; });
    setDigits(next);
    refs.current[Math.min(p.length, 5)]?.focus();
    if (p.length === 6) onComplete(p);
  };
  return (
    <div className="flex gap-3 justify-center">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }}
          type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)} onPaste={handlePaste}
          className="w-11 h-12 rounded-xl border text-center text-lg font-bold text-white outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            borderColor: d ? 'oklch(0.837 0.128 66.29)' : 'rgba(255,255,255,0.12)',
            boxShadow: d ? '0 0 0 2px oklch(0.837 0.128 66.29 / 0.25)' : 'none',
          }} />
      ))}
    </div>
  );
}

// ── 2FA screen shown after Supabase login ─────────────────────────────────────
function TwoFAScreen({
  email, supabaseToken, onSuccess, onBack,
}: { email: string; supabaseToken: string; onSuccess: (user: any) => void; onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { toast } = useToast();

  const handleComplete = async (code: string) => {
    setLoading(true);
    try {
      const res = await verifySupabase2FA(supabaseToken, code);
      onSuccess(res.data.user);
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid or expired code.';
      toast({ title: 'Verification failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await triggerSupabase2FA(supabaseToken);
      toast({ title: 'Code resent', description: 'Check your email.' });
    } catch {
      toast({ title: 'Could not resend', variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4" style={{ background: '#000' }}>
      <ShaderBackground />
      <div className="relative z-10 w-full max-w-sm animate-slide-up"
        style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1.25rem', backdropFilter: 'blur(28px)', padding: '2.5rem 2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.65)' }}>
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)', boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)' }}>
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white mb-1">Two-Factor Auth</h1>
          <p className="text-sm text-white/45">Enter the 6-digit code sent to</p>
          <p className="text-sm font-medium text-orange-300">{email}</p>
        </div>
        <div className="space-y-5">
          <OtpInput onComplete={handleComplete} />
          {loading && <div className="flex items-center justify-center gap-2 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</div>}
          <div className="flex flex-col items-center gap-2 pt-1">
            <button onClick={handleResend} disabled={resending}
              className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors disabled:opacity-50">
              <RotateCcw className="h-3.5 w-3.5" /> {resending ? 'Resending…' : 'Resend code'}
            </button>
            <button onClick={onBack} className="text-sm text-white/30 hover:text-white/60 transition-colors">← Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Login page ───────────────────────────────────────────────────────────
const Login = () => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [twoFAStep, setTwoFAStep] = useState<{ email: string; token: string } | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Sign in via Supabase ──
  const handleSignIn = async (email: string, password: string) => {
    setSignInLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);

      const token = data.session!.access_token;

      // Check 2FA
      const r2fa = await triggerSupabase2FA(token);
      if (r2fa.data.otp_required) {
        setTwoFAStep({ email, token });
        toast({ title: '2FA Required', description: 'A 6-digit code has been sent to your email.' });
        return;
      }

      // No 2FA → store token and navigate
      localStorage.setItem('avenir_token', token);
      localStorage.setItem('avenir_user', JSON.stringify({ email, name: email.split('@')[0] }));
      toast({ title: 'Welcome back!', description: 'Logged in successfully.' });
      navigate('/dashboard');
    } catch (err: any) {
      toast({ title: 'Login failed', description: err.message || 'Invalid credentials.', variant: 'destructive' });
    } finally {
      setSignInLoading(false);
    }
  };

  // ── Register via Supabase ──
  const handleSignUp = async (name: string, email: string, password: string) => {
    setSignUpLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw new Error(error.message);
      toast({
        title: 'Account created!',
        description: 'Check your email for a verification link, then sign in.',
      });
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSignUpLoading(false);
    }
  };

  // ── 2FA success ──
  const handle2FASuccess = (user: any) => {
    localStorage.setItem('avenir_token', twoFAStep!.token);
    localStorage.setItem('avenir_user', JSON.stringify(user));
    toast({ title: 'Welcome back!', description: 'Logged in successfully.' });
    navigate(user.is_profile_completed ? '/dashboard' : '/profile-setup');
  };

  // ── Google OAuth (existing backend flow) ──
  const triggerGoogleLogin = useGoogleLogin({
    onSuccess: async (resp) => {
      setGoogleLoading(true);
      try {
        const res = await googleLoginApi(resp.access_token);
        const { access_token, user } = res.data;
        localStorage.setItem('avenir_token', access_token);
        localStorage.setItem('avenir_user', JSON.stringify(user));
        toast({ title: 'Welcome!', description: `Signed in as ${user.email}` });
        navigate(user.is_profile_completed ? '/dashboard' : '/profile-setup');
      } catch (err: any) {
        toast({ title: 'Google login failed', description: err.response?.data?.detail || 'Try again.', variant: 'destructive' });
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: () => toast({ title: 'Google login cancelled', variant: 'destructive' }),
    flow: 'implicit',
  });

  if (twoFAStep) {
    return (
      <TwoFAScreen
        email={twoFAStep.email}
        supabaseToken={twoFAStep.token}
        onSuccess={handle2FASuccess}
        onBack={() => setTwoFAStep(null)}
      />
    );
  }

  return (
    <AuthUI
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      signInLoading={signInLoading}
      signUpLoading={signUpLoading}
      onGoogleLogin={triggerGoogleLogin}
      googleLoading={googleLoading}
      defaultTab="signin"
    />
  );
};

export default Login;



