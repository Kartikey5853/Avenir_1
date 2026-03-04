import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
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

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw new Error(error.message);
      setSent(true);
      toast({ title: 'Link sent!', description: 'Check your email for the reset link.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Could not send reset link.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4" style={{ background: '#000000' }}>
      <ShaderBackground />

      {!sent ? (
        <Card>
          <div className="text-center mb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)', boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)' }}>
              <Mail className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Reset Password</h1>
            <p className="text-sm text-white/45">We'll send a reset link to your email</p>
          </div>

          <form onSubmit={handleSend} className="space-y-4">
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
              Send Reset Link
            </button>
            <p className="text-center text-sm text-white/45">
              <Link to="/login" className="text-orange-300 hover:text-orange-200 hover:underline transition-colors">
                ← Back to login
              </Link>
            </p>
          </form>
        </Card>
      ) : (
        <Card>
          <div className="text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-orange-400 mx-auto" />
            <h2 className="text-xl font-bold text-white">Check your email</h2>
            <p className="text-sm text-white/50">
              We've sent a password reset link to<br />
              <span className="text-orange-300 font-medium">{email}</span>
            </p>
            <p className="text-xs text-white/35">
              Click the link in the email to set a new password. The link expires in 1 hour.
            </p>
            <Link to="/login"
              className="block w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white text-center flex items-center justify-center hover:bg-white/10 hover:border-orange-400/40 transition-all">
              Back to Login
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ForgotPassword;

// ─── (legacy OTP code removed — Supabase reset link flow used instead) ───
