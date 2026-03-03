import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, TrendingUp, User, Shield, Building2, Settings,
  Heart, Briefcase, Baby, Car, UserRound, Home, Loader2
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { ParticleCard } from '@/components/MagicBento';
import { getProfile } from '@/services/api';

interface ProfileData {
  marital_status: string;
  has_parents: boolean;
  employment_status: string;
  income_range?: string;
  has_vehicle?: boolean;
  has_elderly?: boolean;
  has_children?: boolean;
}

const navTiles = [
  { label: 'Profile', desc: 'View & edit your profile', icon: User, path: '/profile', gradient: 'from-orange-500 to-amber-500' },
  { label: 'Settings', desc: 'Theme & password', icon: Settings, path: '/settings', gradient: 'from-purple-500 to-indigo-500' },
  { label: 'Map View', desc: 'Explore & score locations', icon: MapPin, path: '/map', gradient: 'from-blue-500 to-cyan-500' },
  { label: 'Market Insights', desc: 'Rental & housing data', icon: TrendingUp, path: '/market', gradient: 'from-green-500 to-emerald-500' },
  { label: 'Facilities', desc: 'Infrastructure overview', icon: Building2, path: '/facilities', gradient: 'from-pink-500 to-rose-500' },
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

  const profileFields = profile
    ? [
        { label: 'Marital Status', value: profile.marital_status === 'married' ? 'Married' : 'Single', icon: Heart },
        { label: 'Employment', value: profile.employment_status === 'working' ? 'Working' : profile.employment_status === 'student' ? 'Student' : 'Unemployed', icon: Briefcase },
        { label: 'Income Range', value: profile.income_range?.replace(/_/g, ' ') || 'Not specified', icon: TrendingUp },
        { label: 'Has Vehicle', value: profile.has_vehicle ? 'Yes' : 'No', icon: Car },
        { label: 'Has Children', value: profile.has_children ? 'Yes' : 'No', icon: Baby },
        { label: 'Has Elderly', value: profile.has_elderly ? 'Yes' : 'No', icon: UserRound },
        { label: 'Lives with Parents', value: profile.has_parents ? 'Yes' : 'No', icon: Home },
      ]
    : [];
  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-10">
        {/* Welcome */}
        <div className="animate-slide-up">
          <h1 className="font-bold tracking-tight">
            Welcome back, <span className="text-primary">{user.name}</span> 👋
          </h1>
          <p className="text-muted-foreground mt-2 text-base">Here's your lifestyle exploration dashboard</p>
        </div>

        {/* Profile Summary */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
          <div className="flex items-center justify-between pb-3 mb-5 border-b border-border">
            <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight">
              <User className="h-5 w-5 text-primary" /> Your Profile
            </h2>
            {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>

          {profile ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {profileFields.map((f) => (
                <div key={f.label} className="flex items-center gap-3 p-3.5 rounded-lg border border-border bg-background transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
                  <f.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-medium capitalize truncate">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : !loading ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">No profile set up yet</p>
              <button
                onClick={() => navigate('/profile-setup')}
                className="text-sm text-primary hover:underline font-medium"
              >
                Set up your profile →
              </button>
            </div>
          ) : null}

          {/* Privacy notice */}
          <div className="flex items-start gap-2 mt-5 p-3.5 rounded-lg bg-accent/50 border border-border">
            <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium">Privacy Assured</p>
              <p className="text-xs text-muted-foreground">
                Your personal data is stored securely and won't be shared with third parties. It's only used to personalize your lifestyle scores.
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tiles */}
        <div className="animate-slide-up">
          <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Quick Navigation</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {navTiles.map((tile) => (
              <ParticleCard
                key={tile.label}
                className="group rounded-xl border border-border bg-card p-6 text-left shadow-card cursor-pointer"
                enableTilt
                clickEffect
                enableMagnetism
                particleCount={8}
                glowColor="246, 166, 84"
              >
                <button
                  onClick={() => navigate(tile.path)}
                  className="w-full text-left"
                >
                  <div className={`inline-flex p-2.5 rounded-lg bg-gradient-to-br ${tile.gradient} mb-4`}>
                    <tile.icon className="h-5 w-5 text-white" />
                  </div>
                  <p className="font-semibold text-sm">{tile.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tile.desc}</p>
                </button>
              </ParticleCard>
            ))}
          </div>
        </div>

        {/* Quick tips */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
          <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border">💡 Quick Tips</h2>
          <ul className="space-y-2.5 text-sm text-muted-foreground">
            <li>• Open <span className="text-foreground font-medium">Map View</span> and click anywhere to score a custom location</li>
            <li>• Update your <span className="text-foreground font-medium">Profile</span> to get personalized weight adjustments</li>
            <li>• Use <span className="text-foreground font-medium">Market Insights</span> to compare rental prices between areas</li>
            <li>• Check <span className="text-foreground font-medium">Facilities</span> to see infrastructure data with a map view</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
};

export default Dashboard;
