import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Baby, Bus, Sparkles, Shield, ArrowLeft,
  Loader2, Save, Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getProfile, createProfile, updateProfile } from '@/services/api';
import AppLayout from '@/components/AppLayout';

interface Question {
  key: keyof ProfileState;
  label: string;
  description: string;
  icon: React.ReactNode;
  yesEffect: string;
  noEffect: string;
}

interface ProfileState {
  has_children: boolean;
  relies_on_public_transport: boolean;
  prefers_vibrant_lifestyle: boolean;
  safety_priority: boolean;
}

const QUESTIONS: Question[] = [
  {
    key: 'has_children',
    label: 'Do you have children?',
    description: 'Determines how much schools and parks matter in your score.',
    icon: <Baby className="h-5 w-5 text-primary" />,
    yesEffect: 'Schools & parks weighted at 30 %',
    noEffect: 'Schools have less weight (10 %)',
  },
  {
    key: 'relies_on_public_transport',
    label: 'Do you rely on public transport for daily commute?',
    description: 'Controls how heavily metro, bus and train proximity is scored.',
    icon: <Bus className="h-5 w-5 text-primary" />,
    yesEffect: 'Transport weighted at 25 %',
    noEffect: 'Transport weighted at 5 % (you drive)',
  },
  {
    key: 'prefers_vibrant_lifestyle',
    label: 'Do you prefer areas with active nightlife and lifestyle options?',
    description: 'Governs weight given to restaurants, cafes, gyms and bars.',
    icon: <Sparkles className="h-5 w-5 text-primary" />,
    yesEffect: 'Lifestyle weighted at 25 %',
    noEffect: 'Lifestyle at minimum 15 %',
  },
  {
    key: 'safety_priority',
    label: 'Is safety one of your top priorities?',
    description: 'Boosts the importance of hospitals, police stations and fire stations.',
    icon: <Shield className="h-5 w-5 text-primary" />,
    yesEffect: 'Safety weighted at 30 %',
    noEffect: 'Safety weighted at 20 %',
  },
];

const DEFAULT_STATE: ProfileState = {
  has_children: false,
  relies_on_public_transport: false,
  prefers_vibrant_lifestyle: false,
  safety_priority: false,
};

const Profile = () => {
  const [answers, setAnswers] = useState<ProfileState>(DEFAULT_STATE);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [isExisting, setIsExisting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const user = JSON.parse(localStorage.getItem('avenir_user') || '{"name":"Guest"}');

  useEffect(() => {
    getProfile()
      .then((res) => {
        if (res.data) {
          setIsExisting(true);
          setAnswers({
            has_children:               !!res.data.has_children,
            relies_on_public_transport: !!res.data.relies_on_public_transport,
            prefers_vibrant_lifestyle:  !!res.data.prefers_vibrant_lifestyle,
            safety_priority:            !!res.data.safety_priority,
          });
          setProfilePicture(res.data.profile_picture || null);
        }
      })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) {
      toast({ title: 'Image too large', description: 'Please choose an image under 500 KB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setProfilePicture(reader.result as string);
    reader.readAsDataURL(file);
  };

  const toggle = (key: keyof ProfileState, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    const data = { ...answers, profile_picture: profilePicture || undefined };
    try {
      if (isExisting) {
        await updateProfile(data);
      } else {
        await createProfile(data);
        setIsExisting(true);
      }
      const u = JSON.parse(localStorage.getItem('avenir_user') || '{}');
      u.is_profile_completed = true;
      localStorage.setItem('avenir_user', JSON.stringify(u));
      toast({ title: 'Profile saved!', description: 'Your scores are now personalised to your preferences.' });
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Failed to save profile.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const initials = user.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'G';

  if (fetching) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4 animate-slide-up">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="font-bold tracking-tight">Your Profile</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Answer 5 questions to personalise your livability scores</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift space-y-6 animate-slide-up">
          {/* Profile Photo */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Avatar className="h-24 w-24 border-4 border-border group-hover:border-primary transition-colors">
                <AvatarImage src={profilePicture || undefined} alt={user.name} />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="h-6 w-6 text-white" />
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <p className="text-xs text-muted-foreground">Click to change photo (max 500 KB)</p>
          </div>

          <div className="border-b border-border" />

          {/* 5 Questions */}
          <div className="space-y-6">
            {QUESTIONS.map((q, idx) => (
              <div key={q.key} className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{q.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">
                      <span className="text-muted-foreground mr-2">Q{idx + 1}.</span>
                      {q.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{q.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 ml-8">
                  {[
                    { label: 'Yes', value: true,  effect: q.yesEffect },
                    { label: 'No',  value: false, effect: q.noEffect  },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => toggle(q.key, opt.value)}
                      className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all text-left ${
                        answers[q.key] === opt.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className={`text-xs mt-0.5 ${answers[q.key] === opt.value ? 'text-primary/80' : 'text-muted-foreground'}`}>
                        {opt.effect}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-b border-border" />

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full gradient-warm text-primary-foreground font-semibold hover-lift"
            size="lg"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            {isExisting ? 'Update Profile' : 'Create Profile'}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Profile;
