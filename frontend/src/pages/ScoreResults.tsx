import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, MapPin, Loader2, User, Sparkles, RefreshCw,
  Wifi, AlertTriangle, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

const PROVIDER_STEPS = [
  { id: 'geoapify',   name: 'Geoapify Batch',    detail: 'All categories in 1 call — fastest' },
  { id: 'mapbox',     name: 'Mapbox Search Box', detail: 'Commercial precision fallback'       },
  { id: 'locationiq', name: 'LocationIQ Nearby', detail: 'OSM-powered fallback'               },
  { id: 'overpass',   name: 'Overpass API',      detail: 'Free OSM final fallback'            },
];
const LOAD_TIMEOUT_MS = 30_000;

const CAT_CFG: Record<string, { color: string; label: string; angle: number }> = {
  safety:    { color: '#ef4444', label: 'Safety',    angle: -90  },
  family:    { color: '#a855f7', label: 'Family',    angle: -18  },
  transport: { color: '#3b82f6', label: 'Transport', angle: 54   },
  lifestyle: { color: '#f97316', label: 'Lifestyle', angle: 126  },
  grocery:   { color: '#22c55e', label: 'Grocery',   angle: 198  },
};

const CAT_ORDER = ['safety', 'family', 'transport', 'lifestyle', 'grocery'];

const FACILITY_CFG: Array<{ key: string; label: string; color: string }> = [
  { key: 'hospital_count',      label: 'Hospitals',    color: '#ef4444' },
  { key: 'school_count',        label: 'Schools',      color: '#a855f7' },
  { key: 'bus_stop_count',      label: 'Bus Stops',    color: '#3b82f6' },
  { key: 'park_count',          label: 'Parks',        color: '#22c55e' },
  { key: 'restaurant_count',    label: 'Restaurants',  color: '#eab308' },
  { key: 'supermarket_count',   label: 'Supermarkets', color: '#16a34a' },
  { key: 'gym_count',           label: 'Gyms',         color: '#f97316' },
  { key: 'police_count',        label: 'Police',       color: '#1d4ed8' },
  { key: 'fire_station_count',  label: 'Fire Stn.',    color: '#dc2626' },
];

function RadarChart({ scores, weights }: { scores: Record<string, number>; weights?: Record<string, number> }) {
  const cx = 110, cy = 100, maxR = 58, labelR = 80;
  const toXY = (angle: number, pct: number) => {
    const rad = (angle * Math.PI) / 180;
    const r = (pct / 100) * maxR;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const toLabelXY = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + labelR * Math.cos(rad), y: cy + labelR * Math.sin(rad) };
  };
  const textAnchor = (angle: number) => {
    const cos = Math.cos((angle * Math.PI) / 180);
    if (cos > 0.3) return 'start';
    if (cos < -0.3) return 'end';
    return 'middle';
  };
  const cats = CAT_ORDER.filter((k) => k in (scores ?? {}));
  const dataPoints = cats.map((k) => toXY(CAT_CFG[k].angle, scores[k] ?? 0));
  const polyPts = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const levels = [100, 75, 50, 25];
  return (
    <svg viewBox="0 0 220 200" className="w-full max-w-[220px] mx-auto">
      {levels.map((lvl) => {
        const pts = cats.map((k) => toXY(CAT_CFG[k].angle, lvl));
        return (
          <polygon key={lvl} points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none" stroke="hsl(220 13% 22%)" strokeWidth="0.5" />
        );
      })}
      {cats.map((k) => {
        const outer = toXY(CAT_CFG[k].angle, 100);
        return <line key={k} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="hsl(220 13% 22%)" strokeWidth="0.5" />;
      })}
      <polygon points={polyPts} fill="oklch(0.637 0.128 66.29)" fillOpacity="0.28"
        stroke="oklch(0.637 0.128 66.29)" strokeWidth="1.8" />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="oklch(0.637 0.128 66.29)" />
      ))}
      {/* Weight labels on each axis */}
      {cats.map((k) => {
        const { x, y } = toLabelXY(CAT_CFG[k].angle);
        const anchor = textAnchor(CAT_CFG[k].angle);
        const w = weights ? Math.round((weights[k] ?? 0) * 100) : null;
        return (
          <text key={k} x={x} y={y} textAnchor={anchor} fontSize="6.5" fill={CAT_CFG[k].color}
            fontFamily="system-ui,sans-serif" fontWeight="600">
            <tspan x={x} dy="0">{CAT_CFG[k].label}</tspan>
            {w !== null && <tspan x={x} dy="8" fill="hsl(215 20% 55%)" fontWeight="400">{w}% weight</tspan>}
          </text>
        );
      })}
    </svg>
  );
}

function ProfileModal({
  values, onChange, onSave, onClose, saving,
}: {
  values: { hasChildren: boolean; reliesOnTransport: boolean; prefersLifestyle: boolean; safetyFirst: boolean };
  onChange: (key: keyof typeof values, val: boolean) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}) {
  const questions = [
    { key: 'hasChildren' as const,       label: 'Has Children?',       desc: 'Increases weight on schools & parks' },
    { key: 'reliesOnTransport' as const, label: 'Public Transport?',   desc: 'Increases weight on bus stops'       },
    { key: 'prefersLifestyle' as const,  label: 'Vibrant Lifestyle?',  desc: 'Increases weight on restaurants'     },
    { key: 'safetyFirst' as const,       label: 'Safety Priority?',    desc: 'Increases weight on hospitals, police' },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 w-[380px] max-w-[90vw] space-y-5"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Custom Profile
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Your answers change the category weights and re-compute your score.
        </p>
        <div className="space-y-4">
          {questions.map(({ key, label, desc }) => (
            <div key={key}>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-[11px] text-muted-foreground mb-2">{desc}</p>
              <div className="grid grid-cols-2 gap-2">
                {[{ l: 'Yes', v: true }, { l: 'No', v: false }].map(({ l, v }) => (
                  <button key={l} onClick={() => onChange(key, v)}
                    className={`h-9 rounded-lg border text-sm font-medium transition-all ${
                      values[key] === v
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <Button onClick={onSave} disabled={saving} className="w-full gradient-warm text-primary-foreground font-semibold">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : <><RefreshCw className="h-4 w-4 mr-2" /> Save & Re-score</>}
        </Button>
      </div>
    </div>
  );
}

const ScoreResults = () => {
  const { areaId } = useParams<{ areaId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData]       = useState<ScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [hasChildren,       setHasChildren]       = useState(false);
  const [reliesOnTransport, setReliesOnTransport] = useState(false);
  const [prefersLifestyle,  setPrefersLifestyle]  = useState(false);
  const [safetyFirst,       setSafetyFirst]       = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiRec, setAiRec]         = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [progress,    setProgress]    = useState(0);
  const [providerIdx, setProviderIdx] = useState(0);
  const [timedOut,    setTimedOut]    = useState(false);
  const progressRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);
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
    progressRef.current = setInterval(() => { p += p < 70 ? 3 : p < 90 ? 0.8 : 0.2; if (p > 99) p = 99; setProgress(Math.round(p)); }, 300);
    let idx = 0;
    providerRef.current = setInterval(() => { idx = (idx + 1) % PROVIDER_STEPS.length; setProviderIdx(idx); }, 2500);
    timeoutRef.current = setTimeout(() => { stopAnim(); setTimedOut(true); setLoading(false); }, LOAD_TIMEOUT_MS);
  }, [stopAnim]);

  const fetchScore = useCallback(() => {
    setLoading(true); setTimedOut(false); setError(null); startAnim(); setAiRec(null);
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

  useEffect(() => { fetchScore(); }, [fetchScore]);

  useEffect(() => {
    getProfile().then((res) => {
      if (res.data) {
        setHasChildren(!!res.data.has_children);
        setReliesOnTransport(!!res.data.relies_on_public_transport);
        setPrefersLifestyle(!!res.data.prefers_vibrant_lifestyle);
        setSafetyFirst(!!res.data.safety_priority);
      }
    }).catch(() => {});
  }, []);

  const fetchAIRecommendation = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const res = await getAIRecommendation({ locality_name: data.area_name, final_score: data.overall_score, category_scores: data.category_scores, infrastructure: {}, profile_context: null, lat: lat, lon: lon });
      setAiRec(res.data.recommendation);
    } catch { setAiRec('Unable to generate recommendation. Please try again.'); }
    finally { setAiLoading(false); }
  };

  useEffect(() => { if (data && !aiRec && !aiLoading) fetchAIRecommendation(); }, [data]); // eslint-disable-line

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile({ has_children: hasChildren, relies_on_public_transport: reliesOnTransport, prefers_vibrant_lifestyle: prefersLifestyle, safety_priority: safetyFirst });
      setProfileOpen(false); fetchScore();
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-[480px] max-w-full space-y-6">
          <div>
            <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary animate-pulse" /> Computing Lifestyle Score
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Racing <strong>4 providers simultaneously</strong> — fastest response wins.</p>
          </div>
          <div className="space-y-2">
            {PROVIDER_STEPS.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-500 ${i === providerIdx ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border bg-background opacity-50'}`}>
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
              <span>Fetching infrastructure & computing score…</span><span>{progress}%</span>
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

  if (timedOut && !data) return (
    <AppLayout>
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-96 max-w-full text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          <h3 className="font-bold text-lg">Taking Longer Than Expected</h3>
          <p className="text-sm text-muted-foreground">The infrastructure fetch timed out. APIs may be under load.</p>
          <Button onClick={fetchScore} className="w-full gradient-warm text-primary-foreground"><RefreshCw className="h-4 w-4 mr-2" /> Retry Now</Button>
          <Button variant="outline" onClick={() => navigate('/map')} className="w-full"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Map</Button>
        </div>
      </div>
    </AppLayout>
  );

  if (error || !data) return (
    <AppLayout>
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)] px-4">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-96 max-w-full text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
          <p className="font-medium">{error || 'Failed to load score'}</p>
          <Button onClick={fetchScore} className="w-full gradient-warm text-primary-foreground"><RefreshCw className="h-4 w-4 mr-2" /> Retry</Button>
          <Button variant="outline" onClick={() => navigate('/map')} className="w-full"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Map</Button>
        </div>
      </div>
    </AppLayout>
  );

  const overallScore = data.overall_score;
  const scoreColor = overallScore >= 75 ? '#22c55e' : overallScore >= 50 ? 'oklch(0.637 0.128 66.29)' : '#ef4444';
  const summaryShort = overallScore >= 85 ? 'Excellent' : overallScore >= 70 ? 'Very Good' : overallScore >= 55 ? 'Good' : overallScore >= 40 ? 'Moderate' : 'Below Average';
  const lat = isCustom ? parseFloat(searchParams.get('lat') || '0') : null;
  const lon = isCustom ? parseFloat(searchParams.get('lon') || '0') : null;
  const coordLabel = lat && lon ? `${lat.toFixed(2)}°N ${lon.toFixed(2)}°E` : data.area_name;

  return (
    <AppLayout>
      {profileOpen && (
        <ProfileModal
          values={{ hasChildren, reliesOnTransport, prefersLifestyle, safetyFirst }}
          onChange={(key, val) => {
            if (key === 'hasChildren')       setHasChildren(val);
            if (key === 'reliesOnTransport') setReliesOnTransport(val);
            if (key === 'prefersLifestyle')  setPrefersLifestyle(val);
            if (key === 'safetyFirst')       setSafetyFirst(val);
          }}
          onSave={handleSaveProfile}
          onClose={() => setProfileOpen(false)}
          saving={saving}
        />
      )}
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate('/map')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> {data.area_name}
              </h1>
              <p className="text-xs text-muted-foreground">Lifestyle Score Analysis</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setProfileOpen(true)}
            className="flex items-center gap-2 border-primary/40 text-primary hover:bg-primary/10">
            <User className="h-4 w-4" /> Custom Profile
          </Button>
        </div>

        {/* Dashboard card */}
        <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border bg-card/80">
            <div className="h-3 w-3 rounded-full bg-red-500/70" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <div className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-muted-foreground font-mono">avenir · area intelligence dashboard</span>
            <div className="ml-auto flex items-center gap-3">
              <div className="px-2 py-0.5 rounded bg-primary/20 text-xs text-primary font-semibold">LIVE</div>
              <span className="text-xs text-muted-foreground hidden sm:block">{coordLabel}</span>
            </div>
          </div>

          {/* Score + Category grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Left: Score + Radar */}
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Overall Lifestyle Score</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-7xl font-black" style={{ color: scoreColor }}>
                    <AnimatedNumber value={overallScore} duration={900} className="" />
                  </span>
                  <span className="text-xl text-muted-foreground">/100</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-semibold" style={{ color: scoreColor }}>{summaryShort}</span>
                  {' · '}{data.summary}
                </p>
              </div>
              <RadarChart scores={data.category_scores} weights={data.weights} />
              {((data.highlights?.length ?? 0) > 0 || (data.concerns?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {(data.highlights?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wider mb-1">Highlights</p>
                      <ul className="space-y-0.5">
                        {data.highlights.map((h, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-1">
                            <span className="text-green-500 flex-shrink-0">✓</span>{h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(data.concerns?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-orange-500 uppercase tracking-wider mb-1">Concerns</p>
                      <ul className="space-y-0.5">
                        {data.concerns.map((c, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-1">
                            <span className="text-orange-400 flex-shrink-0">⚠</span>{c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Category breakdown */}
            <div className="p-6 space-y-5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category Breakdown</p>
              <div className="space-y-4">
                {CAT_ORDER.filter((k) => k in (data.category_scores ?? {})).map((key) => {
                  const cfg = CAT_CFG[key];
                  const score = Math.round(data.category_scores[key] ?? 0);
                  const weight = Math.round((data.weights?.[key] ?? 0) * 100);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{cfg.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">weight {weight}%</span>
                          <span className="text-sm font-bold" style={{ color: cfg.color }}>{score}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${score}%`, backgroundColor: cfg.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom: Facility counts */}
          {data.counts && Object.keys(data.counts).length > 0 && (
            <div className="border-t border-border px-6 py-5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-4">Nearby Facilities</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
                {FACILITY_CFG.map(({ key, label, color }) => {
                  const count = data.counts?.[key] ?? 0;
                  return (
                    <div key={key} className="text-center p-3 rounded-xl bg-background border border-border hover:border-primary/30 transition-colors">
                      <p className="text-2xl font-black" style={{ color }}>{count}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* AI Recommendation */}
        <div className="bg-card rounded-xl border border-border p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> AI Recommendation
            </h2>
            <Button variant="ghost" size="sm" onClick={fetchAIRecommendation} disabled={aiLoading}>
              <RefreshCw className={`h-3 w-3 mr-1 ${aiLoading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating personalized recommendation…
            </div>
          ) : aiRec ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{aiRec}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Click Refresh to get an AI recommendation.</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
};

export default ScoreResults;
