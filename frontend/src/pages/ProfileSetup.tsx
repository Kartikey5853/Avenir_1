import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Briefcase, Heart, Home, ArrowRight, Loader2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createProfile } from '@/services/api';

const ProfileSetup = () => {
  const [maritalStatus, setMaritalStatus] = useState<string>('single');
  const [hasParents, setHasParents] = useState<boolean>(false);
  const [employmentStatus, setEmploymentStatus] = useState<string>('working');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await createProfile({
        marital_status: maritalStatus,
        has_parents: hasParents,
        employment_status: employmentStatus,
      });
      // Update local user data
      const user = JSON.parse(localStorage.getItem('avenir_user') || '{}');
      user.is_profile_completed = true;
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Profile saved!', description: 'Your preferences will personalize your scores.' });
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save profile.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    toast({ title: 'Skipped', description: 'You can set up your profile later from settings.' });
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-subtle px-4">
      <div className="w-full max-w-lg animate-slide-up">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Tell us about <span className="text-primary">yourself</span></h1>
          <p className="text-muted-foreground">This helps us personalize your lifestyle scores</p>
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card space-y-6 border border-border">
          {/* Marital Status */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Heart className="h-4 w-4 text-primary" /> Marital Status
            </label>
            <div className="grid grid-cols-2 gap-3">
              {['single', 'married'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setMaritalStatus(opt)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all capitalize ${
                    maritalStatus === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Living with Parents */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Home className="h-4 w-4 text-primary" /> Living with Parents?
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setHasParents(opt.value)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    hasParents === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Employment Status */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Employment Status
            </label>
            <div className="grid grid-cols-3 gap-3">
              {['student', 'working', 'unemployed'].map((opt) => (
                <button
                  key={opt}
                  onClick={() => setEmploymentStatus(opt)}
                  className={`px-3 py-3 rounded-lg border text-sm font-medium transition-all capitalize ${
                    employmentStatus === opt
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
            >
              <SkipForward className="h-4 w-4 mr-2" /> Skip for now
            </Button>
            <Button
              className="flex-1 gradient-warm text-primary-foreground font-semibold"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
              Save & Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
