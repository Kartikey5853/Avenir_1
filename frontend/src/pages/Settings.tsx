import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Lock, Palette, Sun, Moon, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { changePassword, enable2FA, disable2FA } from '@/services/api';
import AppLayout from '@/components/AppLayout';

type ThemeOption = 'light' | 'dark';

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // 2FA
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean>(() => {
    try {
      const u = JSON.parse(localStorage.getItem('avenir_user') || '{}');
      return !!u.two_factor_enabled;
    } catch { return false; }
  });
  const [toggling2FA, setToggling2FA] = useState(false);

  // Theme
  const [theme, setTheme] = useState<ThemeOption>(() => {
    return (localStorage.getItem('avenir_theme') as ThemeOption) || 'dark';
  });

  const applyTheme = (t: ThemeOption) => {
    setTheme(t);
    localStorage.setItem('avenir_theme', t);
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword) {
      toast({ title: 'Error', description: 'Please fill in all password fields.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'New passwords do not match.', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast({ title: 'Success', description: 'Password changed successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to change password.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setChangingPassword(false);
    }
  };

  const handle2FAToggle = async () => {
    setToggling2FA(true);
    try {
      if (twoFactorEnabled) {
        await disable2FA();
        setTwoFactorEnabled(false);
        const u = JSON.parse(localStorage.getItem('avenir_user') || '{}');
        u.two_factor_enabled = false;
        localStorage.setItem('avenir_user', JSON.stringify(u));
        toast({ title: '2FA Disabled', description: 'Two-factor authentication has been turned off.' });
      } else {
        await enable2FA();
        setTwoFactorEnabled(true);
        const u = JSON.parse(localStorage.getItem('avenir_user') || '{}');
        u.two_factor_enabled = true;
        localStorage.setItem('avenir_user', JSON.stringify(u));
        toast({ title: '2FA Enabled', description: 'A verification code will be sent to your email each time you sign in.' });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to update 2FA settings.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setToggling2FA(false);
    }
  };

  return (
    <AppLayout>      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4 animate-slide-up">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="font-bold tracking-tight">Settings</h1>
        </div>

        {/* Theme Selection */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift space-y-4 animate-slide-up">
          <h2 className="font-semibold text-lg tracking-tight pb-3 border-b border-border flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> Theme
          </h2>
          <p className="text-sm text-muted-foreground">Choose your preferred appearance</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Light Theme */}
            <button
              onClick={() => applyTheme('light')}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                theme === 'light'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-full h-24 rounded-md bg-white border border-gray-200 flex flex-col overflow-hidden">
                  <div className="h-4 bg-gray-100 border-b border-gray-200" />
                  <div className="flex-1 p-2 space-y-1">
                    <div className="h-2 bg-gray-200 rounded w-3/4" />
                    <div className="h-2 bg-gray-200 rounded w-1/2" />
                    <div className="h-2 bg-orange-200 rounded w-2/3" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  <span className="text-sm font-medium">Light</span>
                </div>
              </div>
              {theme === 'light' && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs">✓</span>
                </div>
              )}
            </button>

            {/* Dark Theme */}
            <button
              onClick={() => applyTheme('dark')}
              className={`relative p-4 rounded-lg border-2 transition-all ${
                theme === 'dark'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-muted-foreground'
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-full h-24 rounded-md bg-[#0a0a0a] border border-[#383838] flex flex-col overflow-hidden">
                  <div className="h-4 bg-[#191919] border-b border-[#383838]" />
                  <div className="flex-1 p-2 space-y-1">
                    <div className="h-2 bg-[#383838] rounded w-3/4" />
                    <div className="h-2 bg-[#383838] rounded w-1/2" />
                    <div className="h-2 bg-[#FFB86A]/40 rounded w-2/3" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  <span className="text-sm font-medium">Dark</span>
                </div>
              </div>
              {theme === 'dark' && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-primary-foreground text-xs">✓</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Change Password */}        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift space-y-4 animate-slide-up">
          <h2 className="font-semibold text-lg tracking-tight pb-3 border-b border-border flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> Change Password
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">Current Password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Confirm New Password</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <Button
              onClick={handlePasswordChange}
              disabled={changingPassword}
              className="w-full gradient-warm text-primary-foreground font-semibold"
            >
              {changingPassword ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Lock className="h-4 w-4 mr-2" />
              )}
              Change Password
            </Button>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift space-y-4 animate-slide-up">
          <h2 className="font-semibold text-lg tracking-tight pb-3 border-b border-border flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Two-Factor Authentication
          </h2>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Login verification code</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {twoFactorEnabled
                  ? 'A code will be emailed to you each time you sign in.'
                  : 'Enable to receive a login code each time you sign in.'}
              </p>
            </div>
            <Button
              onClick={handle2FAToggle}
              disabled={toggling2FA}
              variant="outline"
              className={`shrink-0 font-semibold border-2 transition-all ${
                twoFactorEnabled
                  ? 'border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground'
                  : 'border-primary text-primary hover:bg-primary hover:text-primary-foreground'
              }`}
            >
              {toggling2FA ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : twoFactorEnabled ? (
                <ShieldOff className="h-4 w-4 mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
            </Button>
          </div>
        </div>

      </div>
    </AppLayout>
  );
};

export default Settings;
