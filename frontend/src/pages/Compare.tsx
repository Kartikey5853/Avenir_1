import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  ArrowLeft, MapPin, Loader2, Building2, GraduationCap, Bus, ShoppingCart,
  UtensilsCrossed, TrainFront, Dumbbell, Wine, Target, Sparkles, RefreshCw, X
} from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppLayout from '@/components/AppLayout';
import { getAreas, getAreaScore, getCustomScore, getAIRecommendation, getProfile } from '@/services/api';
import 'leaflet/dist/leaflet.css';

interface BackendArea {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  boundary_type: string;
  radius_meters: number | null;
}

interface ScoreData {
  area_id: number;
  area_name: string;
  overall_score: number;
  category_scores: Record<string, number>;
  weights: Record<string, number>;
  counts?: Record<string, number> | null;
  summary?: string;
  highlights?: string[];
  concerns?: string[];
}

const infraLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  hospital_count:      { label: 'Hospitals',     icon: <Building2 className="h-3.5 w-3.5 text-red-500" /> },
  school_count:        { label: 'Schools',       icon: <GraduationCap className="h-3.5 w-3.5 text-purple-500" /> },
  bus_stop_count:      { label: 'Bus Stops',     icon: <Bus className="h-3.5 w-3.5 text-blue-500" /> },
  metro_count:         { label: 'Metro',         icon: <TrainFront className="h-3.5 w-3.5 text-blue-600" /> },
  train_station_count: { label: 'Train',         icon: <TrainFront className="h-3.5 w-3.5 text-indigo-500" /> },
  supermarket_count:   { label: 'Supermarkets',  icon: <ShoppingCart className="h-3.5 w-3.5 text-green-500" /> },
  restaurant_count:    { label: 'Restaurants',   icon: <UtensilsCrossed className="h-3.5 w-3.5 text-yellow-500" /> },
  cafe_count:          { label: 'Cafes',         icon: <UtensilsCrossed className="h-3.5 w-3.5 text-amber-500" /> },
  gym_count:           { label: 'Gyms',          icon: <Dumbbell className="h-3.5 w-3.5 text-orange-500" /> },
  bar_count:           { label: 'Bars',          icon: <Wine className="h-3.5 w-3.5 text-pink-500" /> },
  park_count:          { label: 'Parks',         icon: <MapPin className="h-3.5 w-3.5 text-green-600" /> },
  police_count:        { label: 'Police',        icon: <Building2 className="h-3.5 w-3.5 text-blue-700" /> },
  fire_station_count:  { label: 'Fire Stations', icon: <Building2 className="h-3.5 w-3.5 text-red-600" /> },
};

// ── Area-picker modal (reused for both sides) ────────────────────────────────

interface AreaPickerModalProps {
  title: string;
  areas: BackendArea[];
  loadingAreas: boolean;
  onConfirm: (mode: 'area' | 'custom', areaId?: string, lat?: number, lon?: number) => void;
  onClose: () => void;
  accentColor?: string;
}

function AreaPickerModal({ title, areas, loadingAreas, onConfirm, onClose, accentColor = 'text-primary border-primary bg-primary/10' }: AreaPickerModalProps) {
  const mapRef        = useRef<L.Map | null>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const layerRef      = useRef<L.LayerGroup | null>(null);

  const [pickedArea,  setPickedArea]  = useState('');
  const [customLat,   setCustomLat]   = useState<number | null>(null);
  const [customLon,   setCustomLon]   = useState<number | null>(null);
  const [showMap,     setShowMap]     = useState(false);

  useEffect(() => {
    if (!showMap || !containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([17.44, 78.38], 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on('click', (e: L.LeafletMouseEvent) => {
      setCustomLat(e.latlng.lat);
      setCustomLon(e.latlng.lng);
      setPickedArea('');
      layerRef.current?.clearLayers();
      const icon = L.divIcon({
        html: `<div style="background:#f97316;width:14px;height:14px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>`,
        className: '', iconSize: [14, 14], iconAnchor: [7, 7],
      });
      L.marker([e.latlng.lat, e.latlng.lng], { icon }).addTo(layerRef.current!);
    });
    return () => { map.remove(); mapRef.current = null; };
  }, [showMap]);

  const canConfirm = pickedArea !== '' || (customLat !== null && customLon !== null);

  const handleConfirm = () => {
    if (pickedArea) {
      onConfirm('area', pickedArea);
    } else if (customLat !== null && customLon !== null) {
      onConfirm('custom', undefined, customLat, customLon);
    }
  };

  return (
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-[520px] max-w-full max-h-[90vh] overflow-y-auto animate-slide-up">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-bold text-lg tracking-tight flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> {title}
          </h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Predefined areas */}
          {loadingAreas ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading areas…
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Predefined Areas</p>
              <div className="grid grid-cols-2 gap-2">
                {areas.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setPickedArea(String(a.id)); setCustomLat(null); setCustomLon(null); }}
                    className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                      pickedArea === String(a.id)
                        ? accentColor
                        : 'border-border bg-background hover:border-primary/40'
                    }`}
                  >
                    <p className="font-medium truncate">{a.name}</p>
                    {a.radius_meters && (
                      <p className="text-[10px] text-muted-foreground">{(a.radius_meters / 1000).toFixed(1)} km radius</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Custom map picker */}
          <div>
            <Button variant="outline" size="sm" className="w-full mb-3" onClick={() => setShowMap(!showMap)}>
              <Target className="h-4 w-4 mr-2" />
              {showMap ? 'Hide Map' : 'Pick a Custom Location on Map'}
            </Button>
            {showMap && (
              <div className="rounded-lg overflow-hidden border border-border h-52">
                <div ref={containerRef} className="h-full w-full" />
              </div>
            )}
            {customLat !== null && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                📍 Selected: {customLat.toFixed(4)}, {customLon!.toFixed(4)}
              </p>
            )}
          </div>
        </div>

        <div className="p-6 pt-0">
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full gradient-warm text-primary-foreground font-semibold"
          >
            <Sparkles className="h-4 w-4 mr-2" /> Confirm & Generate Score
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Compare Component ───────────────────────────────────────────────────

const Compare = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [areas, setAreas] = useState<BackendArea[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);

  // Place 1
  const [score1, setScore1]   = useState<ScoreData | null>(null);
  const [loading1, setLoading1] = useState(false);
  const [showModal1, setShowModal1] = useState(false);

  // Place 2
  const [score2, setScore2]   = useState<ScoreData | null>(null);
  const [loading2, setLoading2] = useState(false);
  const [showModal2, setShowModal2] = useState(false);

  // Profile summary
  const [profileSummary, setProfileSummary] = useState<string | null>(null);

  // AI comparison
  const [aiRec, setAiRec]       = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Load areas + profile on mount
  useEffect(() => {
    getAreas()
      .then((res) => setAreas(res.data.areas || []))
      .catch(() => {})
      .finally(() => setLoadingAreas(false));

    getProfile()
      .then((res) => {
        if (res.data) {
          const p = res.data;
          const parts: string[] = [];
          if (p.has_children)               parts.push('has children');
          if (p.relies_on_public_transport) parts.push('uses public transport');
          if (p.prefers_vibrant_lifestyle)  parts.push('vibrant lifestyle');
          if (p.safety_priority)            parts.push('safety priority');
          setProfileSummary(parts.length > 0 ? parts.join(' · ') : 'Default preferences');
        }
      })
      .catch(() => {});
  }, []);

  // Handle URL params from ScoreResults (backward compat)
  useEffect(() => {
    const type1   = searchParams.get('type1') || '';
    const area1Id = searchParams.get('area1') || '';
    const lat1    = searchParams.get('lat1');
    const lon1    = searchParams.get('lon1');
    if (!type1) return;  // no params — user opened directly

    setLoading1(true);
    if (type1 === 'custom' && lat1 && lon1) {
      getCustomScore(parseFloat(lat1), parseFloat(lon1))
        .then((res) => setScore1(res.data))
        .catch(() => {})
        .finally(() => setLoading1(false));
    } else if (type1 === 'area' && area1Id) {
      getAreaScore(parseInt(area1Id))
        .then((res) => setScore1(res.data))
        .catch(() => {})
        .finally(() => setLoading1(false));
    } else {
      setLoading1(false);
    }
  }, [searchParams]);

  // Handle modal confirm for Place 1
  const handleConfirm1 = useCallback((mode: 'area' | 'custom', areaId?: string, lat?: number, lon?: number) => {
    setShowModal1(false);
    setScore1(null);
    setLoading1(true);
    setAiRec(null);
    if (mode === 'area' && areaId) {
      getAreaScore(parseInt(areaId))
        .then((res) => setScore1(res.data))
        .catch(() => {})
        .finally(() => setLoading1(false));
    } else if (mode === 'custom' && lat != null && lon != null) {
      getCustomScore(lat, lon)
        .then((res) => setScore1(res.data))
        .catch(() => {})
        .finally(() => setLoading1(false));
    } else {
      setLoading1(false);
    }
  }, []);

  // Handle modal confirm for Place 2
  const handleConfirm2 = useCallback((mode: 'area' | 'custom', areaId?: string, lat?: number, lon?: number) => {
    setShowModal2(false);
    setScore2(null);
    setLoading2(true);
    setAiRec(null);
    if (mode === 'area' && areaId) {
      getAreaScore(parseInt(areaId))
        .then((res) => setScore2(res.data))
        .catch(() => {})
        .finally(() => setLoading2(false));
    } else if (mode === 'custom' && lat != null && lon != null) {
      getCustomScore(lat, lon)
        .then((res) => setScore2(res.data))
        .catch(() => {})
        .finally(() => setLoading2(false));
    } else {
      setLoading2(false);
    }
  }, []);

  const fetchComparison = async () => {
    if (!score1 || !score2) return;
    setAiLoading(true);
    try {
      const res = await getAIRecommendation({
        locality_name: `${score1.area_name} vs ${score2.area_name}`,
        final_score: score1.overall_score,
        category_scores: {
          ...score1.category_scores,
          ...Object.fromEntries(Object.keys(score2.category_scores).map((k) => [`${k}_place2`, score2.category_scores[k]])),
        },
        infrastructure: {
          ...(score1.counts ?? {}),
          ...Object.fromEntries(Object.keys(score2.counts ?? {}).map((k) => [`${k}_place2`, (score2.counts ?? {})[k]])),
        },
        profile_context: null,
      });
      setAiRec(res.data.recommendation);
    } catch {
      setAiRec('Unable to generate comparison. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const bothLoaded = score1 && score2;
  const scoreColor = (s: number) => s >= 75 ? 'text-green-500' : s >= 50 ? 'text-yellow-500' : 'text-red-500';

  const comparisonChartData = bothLoaded
    ? Object.keys(score1.category_scores).map((key) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        [score1.area_name]: Math.round(score1.category_scores[key]),
        [score2.area_name]: Math.round(score2.category_scores[key]),
      }))
    : [];

  const PlaceCard = ({
    side, score, loading, label, accent, onSelect, onClear,
  }: {
    side: 1 | 2;
    score: ScoreData | null;
    loading: boolean;
    label: string;
    accent: string;
    onSelect: () => void;
    onClear: () => void;
  }) => (
    <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
      <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border flex items-center gap-2">
        <MapPin className={`h-4 w-4 ${accent}`} /> {label}
      </h2>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Computing score via Geoapify Batch…</p>
        </div>
      ) : !score ? (
        <div className="flex flex-col items-center gap-4 py-10">
          <div className={`rounded-full p-4 bg-muted ${accent}`}>
            <Target className="h-8 w-8" />
          </div>
          <p className="text-sm text-muted-foreground text-center">No area selected yet</p>
          <Button onClick={onSelect} className="gradient-warm text-primary-foreground font-semibold">
            <MapPin className="h-4 w-4 mr-2" /> Select Area {side}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{score.area_name}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <AnimatedNumber value={score.overall_score} duration={800} className={`text-4xl font-extrabold ${scoreColor(score.overall_score)}`} />
                <span className="text-muted-foreground">/100</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}>Change</Button>
          </div>
          <div className="space-y-2">
            {Object.entries(score.category_scores).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{k}</span>
                <div className="flex items-center gap-2">
                  <Progress value={v} className="w-20 h-2" />
                  <span className="font-semibold w-8 text-right">{Math.round(v)}</span>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(score.counts ?? {}).length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Nearby Facilities</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(score.counts ?? {}).map(([k, v]) => {
                  const info = infraLabels[k];
                  return (
                    <div key={k} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                      <div className="flex items-center gap-1 min-w-0">
                        {info?.icon ?? <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                        <span className="text-muted-foreground truncate">{info?.label ?? k.replace(/_count$/, '')}</span>
                      </div>
                      <span className={`font-bold ml-1 flex-shrink-0 ${v === 0 ? 'text-muted-foreground' : ''}`}>{v}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4 animate-slide-up">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="font-bold tracking-tight">Compare Locations</h1>
            <p className="text-muted-foreground text-sm mt-1">Side-by-side lifestyle score comparison</p>
            {profileSummary && (
              <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                <Sparkles className="h-3 w-3" /> Scoring using your saved profile: <span className="font-medium">{profileSummary}</span>
              </p>
            )}
          </div>
        </div>

        {/* Two-column place cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <PlaceCard
            side={1}
            score={score1}
            loading={loading1}
            label="Place 1"
            accent="text-primary"
            onSelect={() => setShowModal1(true)}
            onClear={() => { setScore1(null); setAiRec(null); }}
          />
          <PlaceCard
            side={2}
            score={score2}
            loading={loading2}
            label="Place 2"
            accent="text-purple-500"
            onSelect={() => setShowModal2(true)}
            onClear={() => { setScore2(null); setAiRec(null); }}
          />
        </div>

        {/* Comparison charts — only when both are loaded */}
        {bothLoaded && (
          <div className="space-y-8 animate-slide-up">

            {/* Score summary */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Score Comparison</h2>
              <div className="grid grid-cols-3 gap-4 items-center text-center">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{score1.area_name}</p>
                  <AnimatedNumber value={score1.overall_score} duration={800} className={`text-3xl font-extrabold ${scoreColor(score1.overall_score)}`} />
                </div>
                <div className="text-2xl font-bold text-muted-foreground">VS</div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{score2.area_name}</p>
                  <AnimatedNumber value={score2.overall_score} duration={800} className={`text-3xl font-extrabold ${scoreColor(score2.overall_score)}`} />
                </div>
              </div>
              {score1.overall_score !== score2.overall_score && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <span className="text-primary font-semibold">
                    {score1.overall_score > score2.overall_score ? score1.area_name : score2.area_name}
                  </span>{' '}
                  scores higher by{' '}
                  <span className="font-semibold">{Math.abs(Math.round(score1.overall_score - score2.overall_score))} points</span>
                </p>
              )}
            </div>

            {/* Category bar chart */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Category Comparison</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey={score1.area_name} fill="hsl(31,100%,71%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={score2.area_name} fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category-by-category winner */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Best For Each Category</h2>
              <div className="space-y-3">
                {Object.keys(score1.category_scores).map((k) => {
                  const v1 = score1.category_scores[k];
                  const v2 = score2.category_scores[k];
                  const winner = v1 > v2 ? score1.area_name : v2 > v1 ? score2.area_name : 'Tie';
                  const wc = v1 > v2 ? 'text-primary' : v2 > v1 ? 'text-purple-500' : 'text-muted-foreground';
                  return (
                    <div key={k} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:border-primary/30 transition-all">
                      <span className="capitalize font-medium text-sm">{k}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-8 text-right font-semibold">{Math.round(v1)}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="w-8 font-semibold">{Math.round(v2)}</span>
                        <span className={`w-28 text-right text-xs font-semibold ${wc}`}>
                          {winner === 'Tie' ? '🤝 Tie' : `✓ ${winner}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Comparison */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-border">
                <h2 className="font-semibold text-lg tracking-tight flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> AI Comparison Summary
                </h2>
                <Button variant="ghost" size="sm" onClick={fetchComparison} disabled={aiLoading}>
                  <RefreshCw className={`h-3 w-3 mr-1 ${aiLoading ? 'animate-spin' : ''}`} />
                  {aiRec ? 'Refresh' : 'Generate'}
                </Button>
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating AI comparison...
                </div>
              ) : aiRec ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{aiRec}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click "Generate" for an AI-powered comparison.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Area picker modals */}
      {showModal1 && (
        <AreaPickerModal
          title="Select Area 1"
          areas={areas}
          loadingAreas={loadingAreas}
          onConfirm={handleConfirm1}
          onClose={() => setShowModal1(false)}
          accentColor="text-primary border-primary bg-primary/10"
        />
      )}
      {showModal2 && (
        <AreaPickerModal
          title="Select Area 2"
          areas={areas}
          loadingAreas={loadingAreas}
          onConfirm={handleConfirm2}
          onClose={() => setShowModal2(false)}
          accentColor="text-purple-500 border-purple-500 bg-purple-500/10"
        />
      )}
    </AppLayout>
  );
};

export default Compare;
