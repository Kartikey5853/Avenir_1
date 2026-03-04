import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { AuthUI } from '@/components/ui/auth-fuse';
import { loginUser, registerUser } from '@/services/api';

const Register = () => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (email: string, password: string) => {
    setSignInLoading(true);
    try {
      const res = await loginUser(email, password);
      const { access_token, user } = res.data;
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
      // Auto sign-in after registration
      const res = await loginUser(email, password);
      const { access_token, user } = res.data;
      localStorage.setItem('avenir_token', access_token);
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Welcome!', description: 'Account created successfully.' });
      navigate('/profile-setup');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Please try again.';
      toast({ title: 'Registration failed', description: msg, variant: 'destructive' });
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <AuthUI
      onSignIn={handleSignIn}
      onSignUp={handleSignUp}
      signInLoading={signInLoading}
      signUpLoading={signUpLoading}
      defaultTab="signup"
    />
  );
};

export default Register;
