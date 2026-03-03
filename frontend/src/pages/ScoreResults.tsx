import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  ArrowLeft, MapPin, Loader2, Building2, GraduationCap, Bus, ShoppingCart,
  UtensilsCrossed, TrainFront, User, Heart, Briefcase, Home, Info, Dumbbell,
  Wine, Car, Baby, UserRound, Sparkles, GitCompareArrows, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import AnimatedNumber from '@/components/AnimatedNumber';
import { getAreaScore, getCustomScore, getAIRecommendation, updateProfile, getProfile } from '@/services/api';

interface ScoreData {
  area_id: number;
  area_name: string;
  final_score: number;
  category_scores: {
    transport: number;
    healthcare: number;
    education: number;
    lifestyle: number;
    grocery: number;
  };
  weights_used: {
    transport: number;
    healthcare: number;
    education: number;
    lifestyle: number;
    grocery: number;
  };
  infrastructure: {
    hospitals: number;
    schools: number;
    bus_stops: number;
    metro_stations: number;
    supermarkets: number;
    restaurants: number;
    gyms?: number;
    bars?: number;
  };
  profile_context: {
    marital_status: string;
    has_parents: boolean;
    employment_status: string;
    has_vehicle?: boolean;
    has_elderly?: boolean;
    has_children?: boolean;
    income_range?: string;
    adjustments: string[];
  } | null;
}

const COLORS = ['#f97316', '#3b82f6', '#a855f7', '#22c55e', '#eab308'];

const categoryIcons: Record<string, React.ReactNode> = {
  transport: <Bus className="h-4 w-4" />,
  healthcare: <Building2 className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  lifestyle: <UtensilsCrossed className="h-4 w-4" />,
  grocery: <ShoppingCart className="h-4 w-4" />,
};

const infraLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  hospitals: { label: 'Hospitals & Clinics', icon: <Building2 className="h-4 w-4 text-red-500" /> },
  schools: { label: 'Schools', icon: <GraduationCap className="h-4 w-4 text-purple-500" /> },
  bus_stops: { label: 'Bus Stops', icon: <Bus className="h-4 w-4 text-blue-500" /> },
  metro_stations: { label: 'Metro Stations', icon: <TrainFront className="h-4 w-4 text-blue-600" /> },
  supermarkets: { label: 'Supermarkets', icon: <ShoppingCart className="h-4 w-4 text-green-500" /> },
  restaurants: { label: 'Restaurants & Cafes', icon: <UtensilsCrossed className="h-4 w-4 text-yellow-500" /> },
  gyms: { label: 'Gyms & Fitness', icon: <Dumbbell className="h-4 w-4 text-orange-500" /> },
  bars: { label: 'Bars & Pubs', icon: <Wine className="h-4 w-4 text-pink-500" /> },
};

const INCOME_RANGES = [
  { value: 'below_20k', label: 'Below ₹20k' },
  { value: '20k_40k', label: '₹20k – ₹40k' },
  { value: '40k_60k', label: '₹40k – ₹60k' },
  { value: '60k_100k', label: '₹60k – ₹1L' },
  { value: '100k_200k', label: '₹1L – ₹2L' },
  { value: 'above_200k', label: 'Above ₹2L' },
  { value: 'prefer_not_to_say', label: 'Not specified' },
];

const ScoreResults = () => {
  const { areaId } = useParams<{ areaId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable profile fields
  const [maritalStatus, setMaritalStatus] = useState('single');
  const [employmentStatus, setEmploymentStatus] = useState('working');
  const [hasVehicle, setHasVehicle] = useState('no');
  const [hasElderly, setHasElderly] = useState('no');
  const [hasChildren, setHasChildren] = useState('no');
  const [hasParents, setHasParents] = useState('no');
  const [incomeRange, setIncomeRange] = useState('prefer_not_to_say');
  const [profileDirty, setProfileDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI recommendation
  const [aiRec, setAiRec] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const isCustom = !areaId || areaId === 'custom';

  const fetchScore = useCallback(() => {
    setLoading(true);
    setAiRec(null);
    if (isCustom) {
      const lat = parseFloat(searchParams.get('lat') || '0');
      const lon = parseFloat(searchParams.get('lon') || '0');
      const radius = parseInt(searchParams.get('radius') || '2000');
      getCustomScore(lat, lon, radius)
        .then((res) => setData(res.data))
        .catch((err) => setError(err.response?.data?.detail || 'Failed to load score'))
        .finally(() => setLoading(false));
    } else {
      getAreaScore(Number(areaId))
        .then((res) => setData(res.data))
        .catch((err) => setError(err.response?.data?.detail || 'Failed to load score'))
        .finally(() => setLoading(false));
    }
  }, [areaId, searchParams, isCustom]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  // Load profile into editable fields
  useEffect(() => {
    getProfile()
      .then((res) => {
        if (res.data) {
          setMaritalStatus(res.data.marital_status || 'single');
          setEmploymentStatus(res.data.employment_status || 'working');
          setHasVehicle(res.data.has_vehicle ? 'yes' : 'no');
          setHasElderly(res.data.has_elderly ? 'yes' : 'no');
          setHasChildren(res.data.has_children ? 'yes' : 'no');
          setHasParents(res.data.has_parents ? 'yes' : 'no');
          setIncomeRange(res.data.income_range || 'prefer_not_to_say');
        }
      })
      .catch(() => {});
  }, []);

  // Save profile changes and re-score
  const handleUpdateAndRescore = async () => {
    setSaving(true);
    try {
      await updateProfile({
        marital_status: maritalStatus,
        employment_status: employmentStatus,
        has_vehicle: hasVehicle === 'yes',
        has_elderly: hasElderly === 'yes',
        has_children: hasChildren === 'yes',
        has_parents: hasParents === 'yes',
        income_range: incomeRange,
      });
      setProfileDirty(false);
      fetchScore();
    } catch {
      // silently ignore
    } finally {
      setSaving(false);
    }
  };

  const markDirty = () => setProfileDirty(true);

  // Fetch AI recommendation
  const fetchAIRecommendation = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const res = await getAIRecommendation({
        locality_name: data.area_name,
        final_score: data.final_score,
        category_scores: data.category_scores,
        infrastructure: data.infrastructure,
        profile_context: data.profile_context,
      });
      setAiRec(res.data.recommendation);
    } catch {
      setAiRec('Unable to generate recommendation. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  // Auto-fetch AI recommendation when score loads
  useEffect(() => {
    if (data && !aiRec && !aiLoading) {
      fetchAIRecommendation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <div className="text-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground">Fetching infrastructure data & computing score...</p>
            <p className="text-xs text-muted-foreground">This may take a moment (fetching from OpenStreetMap)</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
          <div className="text-center space-y-4">
            <p className="text-destructive font-medium">{error || 'Failed to load score'}</p>
            <Button variant="outline" onClick={() => navigate('/map')}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Map
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const chartData = Object.entries(data.category_scores).map(([key, val]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    score: val,
  }));

  const weightData = Object.entries(data.weights_used).map(([key, val], i) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: Math.round(val * 100),
    color: COLORS[i % COLORS.length],
  }));

  const scoreColor = data.final_score >= 75 ? 'text-green-500' : data.final_score >= 50 ? 'text-yellow-500' : 'text-red-500';

  const compareUrl = isCustom
    ? `/compare?type1=custom&lat1=${searchParams.get('lat')}&lon1=${searchParams.get('lon')}&radius1=${searchParams.get('radius')}`
    : `/compare?type1=area&area1=${areaId}`;

  return (
    <AppLayout>      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between animate-slide-up">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/map')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 tracking-tight">
                <MapPin className="h-5 w-5 text-primary" /> {data.area_name}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Lifestyle Score Analysis</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => navigate(compareUrl)} className="hover-lift">
            <GitCompareArrows className="h-4 w-4 mr-2" /> Compare
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
          {/* LEFT COLUMN */}
          <div className="lg:col-span-2 space-y-8">
            {/* Final Score */}
            <div className="bg-card rounded-xl border border-border p-8 shadow-card hover-lift animate-slide-up">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Overall Lifestyle Score</p>
                  <div className="flex items-baseline gap-2">
                    <AnimatedNumber value={data.final_score} duration={800} className={`text-6xl font-extrabold ${scoreColor}`} />
                    <span className="text-xl text-muted-foreground">/100</span>
                  </div>
                  <p className="text-muted-foreground text-sm mt-3">
                    {data.final_score >= 75
                      ? 'Excellent area for your lifestyle!'
                      : data.final_score >= 50
                      ? 'Good area with room for improvement.'
                      : 'This area may not fully match your preferences.'}
                  </p>
                </div>
                <div className="hidden sm:block w-32">
                  <Progress value={data.final_score} className="h-3" />
                </div>
              </div>
            </div>            {/* AI Recommendation */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-border">
                <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Recommendation
                </h2>
                <Button variant="ghost" size="sm" onClick={fetchAIRecommendation} disabled={aiLoading}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${aiLoading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating personalized recommendation...
                </div>
              ) : aiRec ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{aiRec}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click refresh to get an AI recommendation.</p>
              )}
            </div>            {/* Category Scores Chart */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Category Scores</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="score" fill="hsl(31,100%,71%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {Object.entries(data.category_scores).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      {categoryIcons[key]}
                      <span className="capitalize text-muted-foreground">{key}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={val} className="w-24 h-2" />
                      <span className="text-sm font-semibold w-10 text-right">{Math.round(val)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>            {/* Weight Distribution */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Weight Distribution</h2>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-48 h-48 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={weightData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={35}
                        outerRadius={70}
                        paddingAngle={3}
                        label={false}
                      >
                        {weightData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(val: number) => `${val}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2 w-full">
                  {weightData.map((w) => (
                    <div key={w.name} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: w.color }} />
                      <span className="text-sm text-muted-foreground flex-1">{w.name}</span>
                      <div className="w-20">
                        <Progress value={w.value} className="h-2" />
                      </div>
                      <span className="text-sm font-semibold w-10 text-right">{w.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>          {/* RIGHT COLUMN */}
          <div className="space-y-8">
            {/* Editable Profile */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight pb-3 mb-4 border-b border-border">
                <User className="h-5 w-5 text-primary" /> Your Profile
              </h2>
              <p className="text-xs text-muted-foreground mb-4">
                Change your profile to see how it affects the score
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Heart className="h-3 w-3" /> Marital Status
                  </label>
                  <Select value={maritalStatus} onValueChange={(v) => { setMaritalStatus(v); markDirty(); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single</SelectItem>
                      <SelectItem value="married">Married</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Briefcase className="h-3 w-3" /> Employment
                  </label>
                  <Select value={employmentStatus} onValueChange={(v) => { setEmploymentStatus(v); markDirty(); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="working">Working</SelectItem>
                      <SelectItem value="unemployed">Unemployed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Info className="h-3 w-3" /> Income
                  </label>
                  <Select value={incomeRange} onValueChange={(v) => { setIncomeRange(v); markDirty(); }}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCOME_RANGES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Car className="h-3 w-3" /> Vehicle
                    </label>
                    <Select value={hasVehicle} onValueChange={(v) => { setHasVehicle(v); markDirty(); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <UserRound className="h-3 w-3" /> Elderly
                    </label>
                    <Select value={hasElderly} onValueChange={(v) => { setHasElderly(v); markDirty(); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Baby className="h-3 w-3" /> Children
                    </label>
                    <Select value={hasChildren} onValueChange={(v) => { setHasChildren(v); markDirty(); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                      <Home className="h-3 w-3" /> Parents
                    </label>
                    <Select value={hasParents} onValueChange={(v) => { setHasParents(v); markDirty(); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {profileDirty && (
                  <Button
                    onClick={handleUpdateAndRescore}
                    disabled={saving}
                    className="w-full gradient-warm text-primary-foreground font-semibold text-xs"
                    size="sm"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Save & Re-score
                  </Button>
                )}
              </div>

              {data.profile_context && data.profile_context.adjustments.length > 0 && (
                <div className="space-y-2 border-t border-border pt-3 mt-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Weight Adjustments</p>
                  {data.profile_context.adjustments.map((adj, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">→</span>
                      <span>{adj}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>            {/* Infrastructure Found */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border">Infrastructure Found</h2>
              <p className="text-xs text-muted-foreground mb-5">Real data from OpenStreetMap</p>
              <div className="space-y-3">
                {Object.entries(data.infrastructure).map(([key, count]) => {
                  const info = infraLabels[key];
                  if (!info) return null;
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background transition-all duration-200 hover:border-primary/30 hover:shadow-sm">
                      {info.icon}
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">{info.label}</p>
                      </div>
                      <p className="text-xl font-bold">{count}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default ScoreResults;
