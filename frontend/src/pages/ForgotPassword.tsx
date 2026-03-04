import { Link } from 'react-router-dom';
import { WrenchIcon } from 'lucide-react';
import ShaderBackground from '@/components/ui/shader-background';

const ForgotPassword = () => {
  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4"
      style={{ background: '#000000' }}
    >
      <ShaderBackground />

      <div
        className="relative z-10 w-full max-w-sm text-center animate-slide-up"
        style={{
          background: 'rgba(0,0,0,0.72)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '1.25rem',
          backdropFilter: 'blur(28px)',
          padding: '2.5rem 2rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
        }}
      >
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)',
            boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)',
          }}
        >
          <WrenchIcon className="h-7 w-7 text-white" />
        </div>

        <h1 className="text-xl font-bold text-white mb-2">Page Unavailable</h1>

        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          Password reset is currently unavailable as OTP email delivery is not yet set up.
          This page will be enabled in a future update.
        </p>

        <Link
          to="/login"
          className="block w-full h-10 rounded-lg border border-white/15 bg-white/5 text-sm font-semibold text-white flex items-center justify-center hover:bg-white/10 hover:border-orange-400/40 transition-all"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
