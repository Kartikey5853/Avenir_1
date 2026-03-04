import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Bus, Sparkles, ShieldCheck, ArrowRight, Loader2, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createProfile } from '@/services/api';

const QUESTIONS = [
  {
    key: 'hasChildren' as const,
    label: 'Do you have children?',
    desc: 'Increases weight on schools & parks in your score.',
    icon: <Users className="h-4 w-4 text-primary" />,
  },
  {
    key: 'reliesOnTransport' as const,
    label: 'Do you rely on public transport?',
    desc: 'Increases weight on bus stop coverage.',
    icon: <Bus className="h-4 w-4 text-primary" />,
  },
  {
    key: 'prefersLifestyle' as const,
    label: 'Do you prefer a vibrant lifestyle?',
    desc: 'Increases weight on restaurants & gyms.',
    icon: <Sparkles className="h-4 w-4 text-primary" />,
  },
  {
    key: 'safetyFirst' as const,
    label: 'Is safety your top priority?',
    desc: 'Increases weight on hospitals & police stations.',
    icon: <ShieldCheck className="h-4 w-4 text-primary" />,
  },
];

const ProfileSetup = () => {
  const [answers, setAnswers] = useState({
    hasChildren: false,
    reliesOnTransport: false,
    prefersLifestyle: false,
    safetyFirst: false,
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await createProfile({
        has_children: answers.hasChildren,
        relies_on_public_transport: answers.reliesOnTransport,
        prefers_vibrant_lifestyle: answers.prefersLifestyle,
        safety_priority: answers.safetyFirst,
      });
      const user = JSON.parse(localStorage.getItem('avenir_user') || '{}');
      user.is_profile_completed = true;
      localStorage.setItem('avenir_user', JSON.stringify(user));
      toast({ title: 'Profile saved!', description: 'Your preferences will personalise your scores.' });
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
          <h1 className="text-3xl font-bold mb-2">
            Tell us about <span className="text-primary">yourself</span>
          </h1>
          <p className="text-muted-foreground">
            Your answers change how categories are weighted in your lifestyle score.
          </p>
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card space-y-6 border border-border">
          {QUESTIONS.map(({ key, label, desc, icon }) => (
            <div key={key} className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                {icon} {label}
              </label>
              <p className="text-xs text-muted-foreground">{desc}</p>
              <div className="grid grid-cols-2 gap-3">
                {([{ l: 'Yes', v: true }, { l: 'No', v: false }] as const).map(({ l, v }) => (
                  <button
                    key={l}
                    onClick={() => setAnswers((a) => ({ ...a, [key]: v }))}
                    className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                      answers[key] === v
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleSkip}>
              <SkipForward className="h-4 w-4 mr-2" /> Skip for now
            </Button>
            <Button
              className="flex-1 gradient-warm text-primary-foreground font-semibold"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Save & Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSetup;
