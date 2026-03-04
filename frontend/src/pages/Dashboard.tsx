import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, TrendingUp, User, Shield, Loader2
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Timeline, TimelineItem } from '@/components/ui/modern-timeline';
import { getProfile } from '@/services/api';
import FloatingBubbles from '@/components/FloatingBubbles';

interface ProfileData {
  has_children: boolean;
  relies_on_public_transport: boolean;
  prefers_vibrant_lifestyle: boolean;
  safety_priority: boolean;
  profile_picture?: string | null;
}

const getJourneyItems = (profile: ProfileData | null): TimelineItem[] => [
  {
    title: 'Create Your Account',
    description: 'Signed up and verified your email. You\'re all set to explore Avenir.',
    category: 'Account',
    date: 'Completed',
    status: 'completed',
  },
  {
    title: 'Set Up Your Profile',
    description: profile
      ? 'Your lifestyle profile is complete — scores are now personalized to your household.'
      : 'Tell us about your household so we can personalize livability scores for you.',
    category: 'Profile',
    date: profile ? 'Completed' : 'In Progress',
    status: profile ? 'completed' : 'current',
  },
  {
    title: 'Explore the Map',
    description: 'Open Map View and click any location on the map to get a real-time livability score powered by OpenStreetMap data.',
    category: 'Discovery',
    date: 'Next Step',
    status: profile ? 'current' : 'upcoming',
  },
  {
    title: 'Score a Neighbourhood',
    description: 'Get a detailed breakdown of safety, transport, education, lifestyle and grocery scores for any area.',
    category: 'Scoring',
    date: 'Upcoming',
    status: 'upcoming',
  },
  {
    title: 'Check Market Data',
    description: 'Browse real rental and housing listings, compare area prices, and spot the best value neighbourhoods.',
    category: 'Market',
    date: 'Upcoming',
    status: 'upcoming',
  },
  {
    title: 'Explore Facilities',
    description: 'Visualise hospitals, schools, transit, restaurants and more on an interactive map for any area.',
    category: 'Infrastructure',
    date: 'Upcoming',
    status: 'upcoming',
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('avenir_user') || '{"name":"Guest"}');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProfile()
      .then((res) => setProfile(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const journeyItems = getJourneyItems(profile);

  return (
    <AppLayout>
      <div className="relative">
        <FloatingBubbles className="z-0" />
      <div className="relative z-10 px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-10">
        {/* Welcome */}
        <div className="animate-slide-up">
          <h1 className="font-bold tracking-tight">
            Welcome back, <span className="text-primary">{user.name}</span> 👋
          </h1>
          <p className="text-muted-foreground mt-2 text-base">Here's your lifestyle exploration dashboard</p>
        </div>

        {/* ── 1. YOUR AVENIR JOURNEY (first, no extra card boxing) ── */}
        <div className="animate-slide-up">
          <div className="mb-4">
            <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight">
              <MapPin className="h-5 w-5 text-primary" /> Your Avenir Journey
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Track your progress — complete each step to get the most out of Avenir.
            </p>
          </div>
          <Timeline items={journeyItems} />
        </div>

        {/* ── 2. PROFILE QUESTIONS ── */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card animate-slide-up">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight">
              <User className="h-5 w-5 text-primary" /> Your Profile
            </h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          {profile ? (
            <div className="space-y-2">
              {[
                { label: 'Do you have children?',                val: profile.has_children                },
                { label: 'Do you rely on public transport?',     val: profile.relies_on_public_transport  },
                { label: 'Do you prefer a vibrant lifestyle?',   val: profile.prefers_vibrant_lifestyle   },
                { label: 'Is safety a top priority for you?',    val: profile.safety_priority             },
              ].map(({ label, val }) => (
                <div key={label} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-background border border-border">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className={`text-sm font-semibold ${val ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {val ? 'Yes' : 'No'}
                  </span>
                </div>
              ))}
              <button
                onClick={() => navigate('/profile')}
                className="text-xs text-primary hover:underline font-medium mt-1 w-full text-right"
              >
                Edit profile →
              </button>
            </div>
          ) : !loading ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">No profile set up yet</p>
              <button onClick={() => navigate('/profile-setup')} className="text-sm text-primary hover:underline font-medium">
                Set up your profile →
              </button>
            </div>
          ) : null}

          <div className="flex items-start gap-2 mt-4 p-3.5 rounded-lg bg-accent/50 border border-border">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Privacy Assured — </span>
              Your data is stored securely and only used to personalize your lifestyle scores.
            </p>
          </div>
        </div>
      </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;

