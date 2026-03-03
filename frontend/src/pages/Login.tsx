import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { loginUser } from '@/services/api';
import ShaderBackground from '@/components/ui/shader-background';
import ShinyText from '@/components/ShinyText';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await loginUser(email, password);
      const { access_token, user } = res.data;
      localStorage.setItem('avenir_token', access_token);
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Welcome back!', description: 'Logged in successfully.' });

      if (!user.is_profile_completed) {
        navigate('/profile-setup');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Invalid credentials.';
      toast({ title: 'Login failed', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      <ShaderBackground />

      <div className="w-full max-w-md animate-slide-up relative z-10">
        {/* Logo & heading in dark glass */}
        <div className="text-center mb-8">
          <ShinyText
            text="Avenir"
            speed={3}
            className="font-bold text-5xl mb-3"
            color="oklch(0.637 0.128 66.29)"
            shineColor="oklch(0.937 0.128 66.29)"
            spread={120}
            direction="left"
            yoyo
          />
          <p className="text-white/60 text-sm">Sign in to explore your ideal neighborhood</p>
        </div>

        {/* Form card — dark glass */}
        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-8 space-y-5 border"
          style={{
            background: 'rgba(0, 0, 0, 0.75)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-orange-400/50 focus:ring-orange-400/20"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white/80">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-orange-400/50 focus:ring-orange-400/20"
                required
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-orange-300/80 hover:text-orange-200 hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full gradient-warm text-white font-semibold h-11 text-sm tracking-wide" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
            Sign In
          </Button>

          <p className="text-center text-sm text-white/50">
            Don't have an account?{' '}
            <Link to="/register" className="text-orange-300 font-medium hover:text-orange-200 hover:underline transition-colors">Register</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
