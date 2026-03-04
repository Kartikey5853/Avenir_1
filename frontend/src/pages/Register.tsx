import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { AuthUI } from '@/components/ui/auth-fuse';
import { supabase } from '@/lib/supabase';

const Register = () => {
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw new Error(error.message);
      toast({ title: 'Account created!', description: 'Check your email for a verification link, then sign in.' });
    } catch (err: any) {
      toast({ title: 'Registration failed', description: err.message || 'Please try again.', variant: 'destructive' });
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
