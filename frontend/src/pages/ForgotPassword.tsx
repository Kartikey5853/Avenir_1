import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2, KeyRound, RotateCcw, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { forgotPassword, resetPasswordOtp } from '@/services/api';
import ShaderBackground from '@/components/ui/shader-background';

// ─── OTP 6-box input ───
function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    if (value && index < 5) refs.current[index + 1]?.focus();
    if (next.every((d) => d !== '')) onComplete(next.join(''));
  };

  const handleKey = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = [...digits];
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    refs.current[Math.min(pasted.length, 5)]?.focus();
    if (pasted.length === 6) onComplete(pasted);
  };

  return (
    <div className="flex gap-3 justify-center">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          className="w-11 h-12 rounded-xl border text-center text-lg font-bold text-white outline-none transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.06)',
            borderColor: digit ? 'oklch(0.837 0.128 66.29)' : 'rgba(255,255,255,0.12)',
            boxShadow: digit ? '0 0 0 2px oklch(0.837 0.128 66.29 / 0.25)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Password field with show/hide ───
function PasswordField({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-white">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 pr-10 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20 transition-all"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-3 flex items-center text-white/40 hover:text-white/80 transition-colors"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Shared card wrapper ───
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative z-10 w-full max-w-sm animate-slide-up"
      style={{
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '1.25rem',
        backdropFilter: 'blur(28px)',
        padding: '2.5rem 2rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
      }}
    >
      {children}
    </div>
  );
}

const ForgotPassword = () => {
  const [step, setStep] = useState<'email' | 'otp' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Step 1 — send OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      setStep('otp');
      toast({ title: 'Code sent!', description: 'Check your email for the reset code.' });
    } catch {
      toast({ title: 'Error', description: 'Could not send reset code. Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — verify OTP + set new password
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('Password must be at least 6 characters.');
      return;
    }
    setPwError('');
    setLoading(true);
    try {
      await resetPasswordOtp(email, otp, newPassword);
      setStep('done');
      toast({ title: 'Password reset!', description: 'You can now sign in with your new password.' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid or expired code.';
      toast({ title: 'Reset failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4" style={{ background: '#000000' }}>
      <ShaderBackground />

      {/* ── Step 1: Enter email ── */}
      {step === 'email' && (
        <Card>
          <div className="text-center mb-6">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)',
                boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)',
              }}
            >
              <Mail className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Reset Password</h1>
            <p className="text-sm text-white/45">We'll send a 6-digit code to your email</p>
          </div>

          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-white">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-orange-400/60 focus:ring-1 focus:ring-orange-400/20 transition-all"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Reset Code
            </button>
            <p className="text-center text-sm text-white/45">
              <Link to="/login" className="text-orange-300 hover:text-orange-200 hover:underline transition-colors">
                ← Back to login
              </Link>
            </p>
          </form>
        </Card>
      )}

      {/* ── Step 2: Enter OTP + new password ── */}
      {step === 'otp' && (
        <Card>
          <div className="text-center mb-6">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)',
                boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)',
              }}
            >
              <KeyRound className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Verify & Reset</h1>
            <p className="text-sm text-white/45">Code sent to</p>
            <p className="text-sm font-medium text-orange-300">{email}</p>
          </div>

          <form onSubmit={handleReset} className="space-y-5">
            {/* OTP boxes */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-white text-center">Verification Code</label>
              <OtpInput onComplete={(code) => setOtp(code)} />
            </div>

            <PasswordField
              label="New Password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPwError(''); }}
              required
            />

            <div>
              <PasswordField
                label="Confirm New Password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPwError(''); }}
                required
              />
              {pwError && <p className="text-xs text-red-400 mt-1">{pwError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Reset Password
            </button>

            <div className="flex flex-col items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); }}
                className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Resend code
              </button>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-sm text-white/30 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="inline h-3.5 w-3.5 mr-1" />Back
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Step 3: Done ── */}
      {step === 'done' && (
        <Card>
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-orange-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Password Reset!</h2>
            <p className="text-sm text-white/50">
              Your password has been updated successfully.
            </p>
            <button
              onClick={() => navigate('/login')}
              className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all"
            >
              Sign In
            </button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ForgotPassword;
