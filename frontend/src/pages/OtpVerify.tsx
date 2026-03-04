import { useState, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { verifyEmail, verifyLoginOtp, resendVerification } from '@/services/api';
import ShaderBackground from '@/components/ui/shader-background';

interface OtpVerifyProps {
    email: string;
    purpose: 'email_verification' | 'login_2fa';
    onSuccess: (data: any) => void;
    onBack: () => void;
}

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

export function OtpVerifyScreen({ email, purpose, onSuccess, onBack }: OtpVerifyProps) {
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const { toast } = useToast();

    const handleComplete = async (code: string) => {
        setLoading(true);
        try {
            let res;
            if (purpose === 'login_2fa') {
                res = await verifyLoginOtp(email, code);
            } else {
                res = await verifyEmail(email, code);
            }
            onSuccess(res.data);
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
            await resendVerification(email);
            toast({ title: 'Code sent!', description: 'A new verification code has been sent to your email.' });
        } catch {
            toast({ title: 'Error', description: 'Could not resend the code. Try again.', variant: 'destructive' });
        } finally {
            setResending(false);
        }
    };

    const label = purpose === 'login_2fa' ? 'Two-Factor Verification' : 'Email Verification';
    const subtitle =
        purpose === 'login_2fa'
            ? `Enter the 6-digit code sent to`
            : `Enter the 6-digit code sent to verify your account`;

    return (
        <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4">
            {/* Plasma shader fills the background */}
            <ShaderBackground />

            {/* OTP Card */}
            <div
                className="relative z-10 w-full max-w-sm animate-slide-up text-center"
                style={{
                    background: 'rgba(0,0,0,0.72)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '1.25rem',
                    backdropFilter: 'blur(28px)',
                    padding: '2.5rem 2rem',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
                }}
            >
                {/* Icon */}
                <div
                    className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                    style={{
                        background: 'linear-gradient(135deg, oklch(0.637 0.128 66.29) 0%, oklch(0.78 0.14 55) 100%)',
                        boxShadow: '0 0 24px oklch(0.7 0.14 66 / 0.4)',
                    }}
                >
                    <KeyRound className="h-7 w-7 text-white" />
                </div>

                <h1 className="text-xl font-bold text-white mb-1">{label}</h1>
                <p className="text-sm text-white/45 mb-1">{subtitle}</p>
                {purpose === 'login_2fa' && (
                    <p className="text-sm font-medium text-orange-300 mb-6">{email}</p>
                )}
                {purpose !== 'login_2fa' && <div className="mb-6" />}

                {/* OTP boxes */}
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-white/60">
                        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
                        <span className="text-sm">Verifying…</span>
                    </div>
                ) : (
                    <OtpInput onComplete={handleComplete} />
                )}

                {/* Resend / Back */}
                <div className="mt-8 space-y-3">
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="flex items-center justify-center gap-2 w-full text-sm text-white/45 hover:text-white/70 transition-colors disabled:opacity-50"
                    >
                        <RotateCcw className={`h-3.5 w-3.5 ${resending ? 'animate-spin' : ''}`} />
                        {resending ? 'Sending…' : "Didn't receive the code? Try again"}
                    </button>
                    <button
                        type="button"
                        onClick={onBack}
                        className="text-sm text-white/30 hover:text-white/60 transition-colors"
                    >
                        ← Back
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ── Full standalone page wrapper (for routing if needed) ── */
export default function OtpVerifyPage() {
    const navigate = useNavigate();
    const { toast } = useToast();

    // Read state passed via sessionStorage
    const email = sessionStorage.getItem('otp_email') || '';
    const purpose = (sessionStorage.getItem('otp_purpose') || 'email_verification') as 'email_verification' | 'login_2fa';

    const handleSuccess = (data: any) => {
        sessionStorage.removeItem('otp_email');
        sessionStorage.removeItem('otp_purpose');
        if (purpose === 'login_2fa') {
            const { access_token, user } = data;
            localStorage.setItem('avenir_token', access_token);
            localStorage.setItem('avenir_user', JSON.stringify(user));
            toast({ title: 'Welcome back!', description: 'Logged in successfully.' });
            navigate(user.is_profile_completed ? '/dashboard' : '/profile-setup');
        } else {
            toast({ title: 'Email verified!', description: 'You can now sign in to your account.' });
            navigate('/login');
        }
    };

    if (!email) {
        navigate('/login');
        return null;
    }

    return (
        <OtpVerifyScreen
            email={email}
            purpose={purpose}
            onSuccess={handleSuccess}
            onBack={() => navigate('/login')}
        />
    );
}
