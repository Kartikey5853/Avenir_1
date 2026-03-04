import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  ArrowLeft, MapPin, Loader2, Building2, GraduationCap, Bus, ShoppingCart,
  UtensilsCrossed, TrainFront, User, Sparkles, RefreshCw,
  Dumbbell, Wine, Wifi, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppLayout from '@/components/AppLayout';
import AnimatedNumber from '@/components/AnimatedNumber';
import { getAreaScore, getCustomScore, getAIRecommendation, updateProfile, getProfile } from '@/services/api';

interface ScoreData {
  area_id: number;
  area_name: string;
  overall_score: number;
  category_scores: Record<string, number>;
  weights: Record<string, number>;
  summary: string;
  highlights: string[];
  concerns: string[];
  counts?: Record<string, number> | null;
  radius_m?: number | null;
}

const COLORS = ['#f97316', '#3b82f6', '#a855f7', '#22c55e', '#eab308'];

const PROVIDER_STEPS = [
  { id: 'geoapify',   name: 'Geoapify Batch',    detail: 'All 13 categories in 1 call — fastest' },
  { id: 'mapbox',     name: 'Mapbox Search Box', detail: 'Commercial precision fallback'          },
  { id: 'locationiq', name: 'LocationIQ Nearby', detail: 'OSM-powered fallback'                  },
  { id: 'overpass',   name: 'Overpass API',      detail: 'Free OSM final fallback'               },
];
const LOAD_TIMEOUT_MS = 30_000;

const categoryIcons: Record<string, React.ReactNode> = {
  transport: <Bus className="h-4 w-4" />,
  healthcare: <Building2 className="h-4 w-4" />,
  education: <GraduationCap className="h-4 w-4" />,
  lifestyle: <UtensilsCrossed className="h-4 w-4" />,
  grocery: <ShoppingCart className="h-4 w-4" />,
};

const infraLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  hospital_count:       { label: 'Hospitals',       icon: <Building2 className="h-4 w-4 text-red-500" /> },
  school_count:         { label: 'Schools',         icon: <GraduationCap className="h-4 w-4 text-purple-500" /> },
  bus_stop_count:       { label: 'Bus Stops',       icon: <Bus className="h-4 w-4 text-blue-500" /> },
  metro_count:          { label: 'Metro',           icon: <TrainFront className="h-4 w-4 text-blue-600" /> },
  train_station_count:  { label: 'Train Stations',  icon: <TrainFront className="h-4 w-4 text-indigo-500" /> },
  supermarket_count:    { label: 'Supermarkets',    icon: <ShoppingCart className="h-4 w-4 text-green-500" /> },
  restaurant_count:     { label: 'Restaurants',     icon: <UtensilsCrossed className="h-4 w-4 text-yellow-500" /> },
  cafe_count:           { label: 'Cafes',           icon: <UtensilsCrossed className="h-4 w-4 text-amber-500" /> },
  gym_count:            { label: 'Gyms',            icon: <Dumbbell className="h-4 w-4 text-orange-500" /> },
  bar_count:            { label: 'Bars',            icon: <Wine className="h-4 w-4 text-pink-500" /> },
  park_count:           { label: 'Parks',           icon: <MapPin className="h-4 w-4 text-green-600" /> },
  police_count:         { label: 'Police',          icon: <Building2 className="h-4 w-4 text-blue-700" /> },
  fire_station_count:   { label: 'Fire Stations',   icon: <Building2 className="h-4 w-4 text-red-600" /> },
};

const ScoreResults = () => {
  const { areaId } = useParams<{ areaId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 4-question profile state
  const [hasChildren,             setHasChildren]             = useState(false);
  const [reliesOnTransport,       setReliesOnTransport]       = useState(false);
  const [prefersLifestyle,        setPrefersLifestyle]        = useState(false);
  const [safetyFirst,             setSafetyFirst]             = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI recommendation
  const [aiRec, setAiRec] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 4-provider loading animation state
  const [progress,       setProgress]       = useState(0);
  const [providerIdx,    setProviderIdx]     = useState(0);
  const [timedOut,       setTimedOut]        = useState(false);
  const progressRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout>  | null>(null);

  const isCustom = !areaId || areaId === 'custom';

  const stopAnim = useCallback(() => {
    if (progressRef.current)  clearInterval(progressRef.current);
    if (providerRef.current)  clearInterval(providerRef.current);
    if (timeoutRef.current)   clearTimeout(timeoutRef.current);
    setProgress(100);
  }, []);

  const startAnim = useCallback(() => {
    setProgress(0); setProviderIdx(0); setTimedOut(false);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += p < 70 ? 3 : p < 90 ? 0.8 : 0.2;
      if (p > 99) p = 99;
      setProgress(Math.round(p));
    }, 300);
    let idx = 0;
    providerRef.current = setInterval(() => {
      idx = (idx + 1) % PROVIDER_STEPS.length;
      setProviderIdx(idx);
    }, 2500);
    timeoutRef.current = setTimeout(() => {
      stopAnim();
      setTimedOut(true);
      setLoading(false);
    }, LOAD_TIMEOUT_MS);
  }, [stopAnim]);

  const fetchScore = useCallback(() => {
    setLoading(true);
    setTimedOut(false);
    setError(null);
    startAnim();
    setAiRec(null);
    if (isCustom) {
      const lat = parseFloat(searchParams.get('lat') || '0');
      const lon = parseFloat(searchParams.get('lon') || '0');
      getCustomScore(lat, lon)
        .then((res) => setData(res.data))
        .catch((err) => setError(err.response?.data?.detail || 'Failed to load score'))
        .finally(() => { stopAnim(); setLoading(false); });
    } else {
      getAreaScore(Number(areaId))
        .then((res) => setData(res.data))
        .catch((err) => setError(err.response?.data?.detail || 'Failed to load score'))
        .finally(() => { stopAnim(); setLoading(false); });
    }
  }, [areaId, searchParams, isCustom, startAnim, stopAnim]);

  useEffect(() => {
    fetchScore();
  }, [fetchScore]);

  // Load profile into editable fields
  useEffect(() => {
    getProfile()
      .then((res) => {
        if (res.data) {
          setHasChildren(!!res.data.has_children);
          setReliesOnTransport(!!res.data.relies_on_public_transport);
          setPrefersLifestyle(!!res.data.prefers_vibrant_lifestyle);
          setSafetyFirst(!!res.data.safety_priority);
        }
      })
      .catch(() => {});
  }, []);

  // Save profile changes and re-score
  const handleUpdateAndRescore = async () => {
    setSaving(true);
    try {
      await updateProfile({
        has_children:               hasChildren,
        relies_on_public_transport: reliesOnTransport,
        prefers_vibrant_lifestyle:  prefersLifestyle,
        safety_priority:            safetyFirst,
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
        final_score: data.overall_score,
        category_scores: data.category_scores,
        infrastructure: {},
        profile_context: null,
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
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-[480px] max-w-full space-y-6">
            <div>
              <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                <Wifi className="h-5 w-5 text-primary animate-pulse" />
                Computing Lifestyle Score
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Racing <strong>4 providers simultaneously</strong> via Geoapify Batch — fastest response wins.
              </p>
            </div>
            <div className="space-y-2">
              {PROVIDER_STEPS.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-500 ${
                  i === providerIdx ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border bg-background opacity-50'
                }`}>
                  <div className={`h-2 w-2 rounded-full flex-shrink-0 ${i === providerIdx ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${i === providerIdx ? 'text-primary' : 'text-muted-foreground'}`}>{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.detail}</p>
                  </div>
                  {i === providerIdx && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto flex-shrink-0" />}
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Fetching infrastructure & computing score…</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div className="h-2 rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground text-center">May take up to 30 seconds on first load</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (timedOut && !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-96 max-w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
            <h3 className="font-bold text-lg">Taking Longer Than Expected</h3>
            <p className="text-sm text-muted-foreground">The infrastructure fetch timed out. This can happen when APIs are under load.</p>
            <Button onClick={fetchScore} className="w-full gradient-warm text-primary-foreground">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry Now
            </Button>
            <Button variant="outline" onClick={() => navigate('/map')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Map
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-96 max-w-full text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <p className="font-medium">{error || 'Failed to load score'}</p>
            <Button onClick={fetchScore} className="w-full gradient-warm text-primary-foreground">
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
            <Button variant="outline" onClick={() => navigate('/map')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Map
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const chartData = Object.entries(data.category_scores ?? {}).map(([key, val]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    score: val,
  }));

  const weightData = Object.entries(data.weights ?? {}).map(([key, val], i) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value: Math.round(val * 100),
    color: COLORS[i % COLORS.length],
  }));

  const scoreColor = data.overall_score >= 75 ? 'text-green-500' : data.overall_score >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">
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

        </div>

        {/* â”€â”€ 1. OVERALL SCORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="bg-card rounded-xl border border-border p-8 shadow-card hover-lift animate-slide-up">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Overall Lifestyle Score</p>
              <div className="flex items-baseline gap-3">
                <AnimatedNumber value={data.overall_score} duration={800} className={`text-7xl font-extrabold ${scoreColor}`} />
                <span className="text-2xl text-muted-foreground">/100</span>
              </div>
              <p className="text-muted-foreground text-sm mt-3">
                {data.overall_score >= 75 ? 'Excellent area for your lifestyle!' : data.overall_score >= 50 ? 'Good area with room for improvement.' : 'This area may not fully match your preferences.'}
              </p>
            </div>
            <div className="sm:w-40 space-y-2">
              <Progress value={data.overall_score} className="h-3" />
              {data.summary && <p className="text-xs text-muted-foreground leading-relaxed">{data.summary}</p>}
            </div>
          </div>
          {/* Highlights & Concerns inline */}
          {((data.highlights?.length ?? 0) > 0 || (data.concerns?.length ?? 0) > 0) && (
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(data.highlights?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2">Highlights</p>
                  <ul className="space-y-1">
                    {data.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="text-green-500 flex-shrink-0">âœ“</span>{h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(data.concerns?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-500 uppercase tracking-wider mb-2">Concerns</p>
                  <ul className="space-y-1">
                    {data.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="text-orange-400 flex-shrink-0">âš </span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* â”€â”€ 2. CATEGORY SCORES + WEIGHT DISTRIBUTION | YOUR PROFILE â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Category Scores + Weight Distribution (left 2 cols) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Category Scores */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Category Scores</h2>
              <div className="h-52">
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
                {Object.entries(data.category_scores ?? {}).map(([key, val]) => (
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
            </div>

            {/* Weight Distribution */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Weight Distribution</h2>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-44 h-44 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={weightData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={65} paddingAngle={3} label={false}>
                        {weightData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
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
                      <div className="w-20"><Progress value={w.value} className="h-2" /></div>
                      <span className="text-sm font-semibold w-10 text-right">{w.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Your Profile (right 1 col) */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up self-start sticky top-4">
            <h2 className="font-semibold flex items-center gap-2 text-lg tracking-tight pb-3 mb-4 border-b border-border">
              <User className="h-5 w-5 text-primary" /> Your Profile
            </h2>
            <p className="text-xs text-muted-foreground mb-4">Change your profile to see how it affects the score</p>
            <div className="space-y-3">
              {[
                { key: 'hasChildren',       label: 'Has Children?',       val: hasChildren,       set: setHasChildren       },
                { key: 'reliesOnTransport', label: 'Public Transport?',   val: reliesOnTransport, set: setReliesOnTransport },
                { key: 'prefersLifestyle',  label: 'Vibrant Lifestyle?',  val: prefersLifestyle,  set: setPrefersLifestyle  },
                { key: 'safetyFirst',       label: 'Safety Priority?',    val: safetyFirst,       set: setSafetyFirst       },
              ].map(({ key, label, val, set }) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[{ l: 'Yes', v: true }, { l: 'No', v: false }].map(({ l, v }) => (
                      <button
                        key={l}
                        onClick={() => { set(v); markDirty(); }}
                        className={`h-8 rounded-md border text-xs font-medium transition-all ${val === v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {profileDirty && (
                <Button onClick={handleUpdateAndRescore} disabled={saving} className="w-full gradient-warm text-primary-foreground font-semibold text-xs" size="sm">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  Save & Re-score
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* â”€â”€ 3. NEARBY FACILITIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {(data.counts && Object.keys(data.counts).length > 0) && (
          <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
            <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border">Nearby Facilities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
              {Object.entries(data.counts).map(([k, v]) => {
                const lbl = infraLabels[k];
                return (
                  <div key={k} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background hover:border-primary/30 transition-all">
                    {lbl?.icon ?? <MapPin className="h-4 w-4 text-muted-foreground" />}
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{lbl?.label ?? k.replace(/_count$/, '').replace(/_/g, ' ')}</p>
                      <p className={`text-base font-bold ${v === 0 ? 'text-muted-foreground' : ''}`}>{v}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* â”€â”€ 4. AI RECOMMENDATION (BOTTOM) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
        </div>

      </div>
    </AppLayout>
  );
};

export default ScoreResults;
