import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { loginUser, registerUser } from '@/services/api';
import { AuthUI } from '@/components/ui/auth-fuse';
import { OtpVerifyScreen } from '@/pages/OtpVerify';

const Login = () => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [otpStep, setOtpStep] = useState<{ email: string; purpose: 'email_verification' | 'login_2fa' } | null>(null);

  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (email: string, password: string) => {
    setSignInLoading(true);
    try {
      const res = await loginUser(email, password);
      const data = res.data;

      if (data.otp_required) {
        setOtpStep({ email, purpose: 'login_2fa' });
        toast({ title: '2FA Required', description: 'A 6-digit code has been sent to your email.' });
        return;
      }

      const { access_token, user } = data;
      localStorage.setItem('avenir_token', access_token);
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Welcome back!', description: 'Logged in successfully.' });
      navigate(user.is_profile_completed ? '/dashboard' : '/profile-setup');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid credentials.';
      toast({ title: 'Login failed', description: msg, variant: 'destructive' });
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (name: string, email: string, password: string) => {
    setSignUpLoading(true);
    try {
      await registerUser(name, email, password);
      setOtpStep({ email, purpose: 'email_verification' });
      toast({ title: 'Account created!', description: 'Check your email for the verification code.' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Registration failed.';
      toast({ title: 'Registration failed', description: msg, variant: 'destructive' });
    } finally {
      setSignUpLoading(false);
    }
  };

  const handleOtpSuccess = (data: any) => {
    if (otpStep?.purpose === 'login_2fa') {
      const { access_token, user } = data;
      localStorage.setItem('avenir_token', access_token);
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Welcome back!', description: 'Logged in successfully.' });
      navigate(user.is_profile_completed ? '/dashboard' : '/profile-setup');
    } else {
      toast({ title: 'Email verified!', description: 'You can now sign in.' });
      setOtpStep(null);
    }
  };

  if (otpStep) {
    return (
      <OtpVerifyScreen
        email={otpStep.email}
        purpose={otpStep.purpose}
        onSuccess={handleOtpSuccess}
        onBack={() => setOtpStep(null)}
      />
    );
  }

  return (
    <AuthUI
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      signInLoading={signInLoading}
      signUpLoading={signUpLoading}
      defaultTab="signin"
    />
  );
};

export default Login;


