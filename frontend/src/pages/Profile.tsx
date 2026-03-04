import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Briefcase, Heart, Home, ArrowLeft, Loader2, Save,
  DollarSign, Car, Baby, UserRound, FileText, Camera
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getProfile, createProfile, updateProfile } from '@/services/api';
import AppLayout from '@/components/AppLayout';

const INCOME_RANGES = [
  { value: 'below_20k', label: 'Below ₹20,000' },
  { value: '20k_40k', label: '₹20,000 – ₹40,000' },
  { value: '40k_60k', label: '₹40,000 – ₹60,000' },
  { value: '60k_100k', label: '₹60,000 – ₹1,00,000' },
  { value: '100k_200k', label: '₹1,00,000 – ₹2,00,000' },
  { value: 'above_200k', label: 'Above ₹2,00,000' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const Profile = () => {
  const [maritalStatus, setMaritalStatus] = useState('single');
  const [hasParents, setHasParents] = useState(false);
  const [employmentStatus, setEmploymentStatus] = useState('working');
  const [incomeRange, setIncomeRange] = useState('prefer_not_to_say');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [hasVehicle, setHasVehicle] = useState(false);
  const [hasElderly, setHasElderly] = useState(false);
  const [hasChildren, setHasChildren] = useState(false);
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
          setMaritalStatus(res.data.marital_status || 'single');
          setHasParents(res.data.has_parents || false);
          setEmploymentStatus(res.data.employment_status || 'working');
          setIncomeRange(res.data.income_range || 'prefer_not_to_say');
          setAdditionalInfo(res.data.additional_info || '');
          setHasVehicle(res.data.has_vehicle || false);
          setHasElderly(res.data.has_elderly || false);
          setHasChildren(res.data.has_children || false);
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
      toast({ title: 'Image too large', description: 'Please choose an image under 500KB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePicture(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setLoading(true);
    const data = {
      marital_status: maritalStatus,
      has_parents: hasParents,
      employment_status: employmentStatus,
      income_range: incomeRange,
      additional_info: additionalInfo,
      has_vehicle: hasVehicle,
      has_elderly: hasElderly,
      has_children: hasChildren,
      profile_picture: profilePicture || undefined,
    };
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
      toast({ title: 'Profile saved!', description: 'Your preferences will personalize your scores.' });
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
    <AppLayout>      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-4 animate-slide-up">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="font-bold tracking-tight">Your Profile</h1>
        </div>

        <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift space-y-6 animate-slide-up">
          {/* Profile Picture */}
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />            <p className="text-xs text-muted-foreground">Click to change photo (max 500KB)</p>
          </div>

          <div className="border-b border-border" />

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

          {/* Income Range */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Monthly Income Range
            </label>
            <Select value={incomeRange} onValueChange={setIncomeRange}>
              <SelectTrigger>
                <SelectValue placeholder="Select income range" />
              </SelectTrigger>
              <SelectContent>
                {INCOME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Has Vehicle */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" /> Do you have a vehicle to commute?
            </label>
            <p className="text-xs text-muted-foreground">If yes, transportation will have less weight in scoring</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setHasVehicle(opt.value)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    hasVehicle === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Has Elderly */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" /> Do you have elderly people at home?
            </label>
            <p className="text-xs text-muted-foreground">If yes, hospitals & healthcare will have more weight</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setHasElderly(opt.value)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    hasElderly === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Has Children */}
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Baby className="h-4 w-4 text-primary" /> Do you have children?
            </label>
            <p className="text-xs text-muted-foreground">If yes, education facilities will have more weight</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ].map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setHasChildren(opt.value)}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    hasChildren === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>          {/* Additional Info */}
          <div className="border-b border-border" />
          <div className="space-y-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Additional Information
            </label>
            <p className="text-xs text-muted-foreground">
              Tell us anything else that can help personalize your scores (hobbies, lifestyle preferences, etc.)
            </p>
            <Textarea
              placeholder="e.g. I prefer quiet neighborhoods, I work from home, I enjoy outdoor activities..."
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              rows={4}
            />
          </div>          {/* Save Button */}
          <div className="border-b border-border" />
          <Button
            className="w-full gradient-warm text-primary-foreground font-semibold"
            onClick={handleSubmit}
            disabled={loading}
            size="lg"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Profile
          </Button>
        </div>
      </div>
    </AppLayout>
  );
};

export default Profile;
