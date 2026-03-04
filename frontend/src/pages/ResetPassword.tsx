import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import ShaderBackground from '@/components/ui/shader-background';

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

function PasswordField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
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

const ResetPassword = () => {
  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase redirects back with token in URL hash for PASSWORD_RECOVERY event
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });

    // Also handle the case where the session is already set (page refresh after redirect)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true);
      } else {
        // Give Supabase 2 seconds to process the URL fragment
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: d2 }) => {
            if (!d2.session) setInvalid(true);
          });
        }, 2000);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      setDone(true);
      toast({ title: 'Password updated!', description: 'You can now sign in with your new password.' });
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Could not update password.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4"
      style={{ background: '#000000' }}
    >
      <ShaderBackground />

      {/* Invalid / expired link */}
      {invalid && !ready && (
        <Card>
          <div className="text-center space-y-4">
            <AlertCircle className="h-14 w-14 text-red-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Link Expired</h2>
            <p className="text-sm text-white/50">
              This reset link is invalid or has expired.
              Please request a new one.
            </p>
            <button
              onClick={() => navigate('/forgot-password')}
              className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all"
            >
              Request New Link
            </button>
          </div>
        </Card>
      )}

      {/* Loading — waiting for Supabase to process URL fragment */}
      {!ready && !invalid && (
        <Card>
          <div className="text-center space-y-4">
            <Loader2 className="h-10 w-10 text-orange-400 mx-auto animate-spin" />
            <p className="text-sm text-white/50">Validating reset link…</p>
          </div>
        </Card>
      )}

      {/* Success screen */}
      {done && (
        <Card>
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-orange-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Password Updated!</h2>
            <p className="text-sm text-white/50">Redirecting you to login…</p>
          </div>
        </Card>
      )}

      {/* Reset form */}
      {ready && !done && (
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
            <h1 className="text-xl font-bold text-white mb-1">Set New Password</h1>
            <p className="text-sm text-white/45">Choose a strong password</p>
          </div>

          <form onSubmit={handleReset} className="space-y-4">
            <PasswordField
              label="New Password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword((e.target as HTMLInputElement).value);
                setPwError('');
              }}
              required
            />

            <div>
              <PasswordField
                label="Confirm Password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword((e.target as HTMLInputElement).value);
                  setPwError('');
                }}
                required
              />
              {pwError && <p className="text-xs text-red-400 mt-1">{pwError}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center gap-2 hover:bg-white/10 hover:border-orange-400/40 transition-all disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Update Password
            </button>
          </form>
        </Card>
      )}
    </div>
  );
};

export default ResetPassword;
