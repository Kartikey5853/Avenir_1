import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useGoogleLogin } from '@react-oauth/google';
import { googleLogin as googleLoginApi } from '@/services/api';
import { AuthUI } from '@/components/ui/auth-fuse';
import { supabase } from '@/lib/supabase';

const Login = () => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (email: string, password: string) => {
    setSignInLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      const token = data.session!.access_token;
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

  const handleSignUp = async (name: string, email: string, password: string) => {
    setSignUpLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw new Error(error.message);
      const token = data.session?.access_token;
      if (token) {
        localStorage.setItem('avenir_token', token);
        localStorage.setItem('avenir_user', JSON.stringify({ email, name }));
      }
      toast({ title: 'Welcome!', description: 'Account created successfully.' });
      navigate('/profile-setup');
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSignUpLoading(false);
    }
  };

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
