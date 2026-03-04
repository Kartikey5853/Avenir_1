import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  ArrowLeft, MapPin, Loader2, Building2, GraduationCap, Bus, ShoppingCart,
  UtensilsCrossed, TrainFront, Dumbbell, Wine, Target, Sparkles, RefreshCw
} from 'lucide-react';
import AnimatedNumber from '@/components/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import AppLayout from '@/components/AppLayout';
import { getAreas, getAreaScore, getCustomScore, getAIRecommendation } from '@/services/api';
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
  final_score: number;
  category_scores: Record<string, number>;
  weights_used: Record<string, number>;
  infrastructure: Record<string, number>;
  profile_context: Record<string, unknown> | null;
}

const infraLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  hospitals: { label: 'Hospitals', icon: <Building2 className="h-3.5 w-3.5 text-red-500" /> },
  schools: { label: 'Schools', icon: <GraduationCap className="h-3.5 w-3.5 text-purple-500" /> },
  bus_stops: { label: 'Bus Stops', icon: <Bus className="h-3.5 w-3.5 text-blue-500" /> },
  metro_stations: { label: 'Metro', icon: <TrainFront className="h-3.5 w-3.5 text-blue-600" /> },
  supermarkets: { label: 'Supermarkets', icon: <ShoppingCart className="h-3.5 w-3.5 text-green-500" /> },
  restaurants: { label: 'Restaurants', icon: <UtensilsCrossed className="h-3.5 w-3.5 text-yellow-500" /> },
  gyms: { label: 'Gyms', icon: <Dumbbell className="h-3.5 w-3.5 text-orange-500" /> },
  bars: { label: 'Bars', icon: <Wine className="h-3.5 w-3.5 text-pink-500" /> },
};

const Compare = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Areas list
  const [areas, setAreas] = useState<BackendArea[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(true);

  // Left side (place 1) – comes from URL params
  const type1 = searchParams.get('type1') || 'area';
  const area1Id = searchParams.get('area1') || '';
  const lat1 = searchParams.get('lat1') || '';
  const lon1 = searchParams.get('lon1') || '';
  const radius1 = searchParams.get('radius1') || '2000';

  const [score1, setScore1] = useState<ScoreData | null>(null);
  const [loading1, setLoading1] = useState(false);

  // Right side (place 2) – user picks
  const [mode2, setMode2] = useState<'area' | 'custom'>('area');
  const [selectedArea2, setSelectedArea2] = useState('');
  const [customLat2, setCustomLat2] = useState<number | null>(null);
  const [customLon2, setCustomLon2] = useState<number | null>(null);
  const [radius2] = useState(2000);
  const [score2, setScore2] = useState<ScoreData | null>(null);
  const [loading2, setLoading2] = useState(false);

  // Map for place 2 selection
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const [showMap, setShowMap] = useState(false);

  // AI
  const [aiRec, setAiRec] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch areas
  useEffect(() => {
    getAreas()
      .then((res) => setAreas(res.data.areas || []))
      .catch(() => {})
      .finally(() => setLoadingAreas(false));
  }, []);

  // Fetch score 1
  useEffect(() => {
    setLoading1(true);
    if (type1 === 'custom' && lat1 && lon1) {
      getCustomScore(parseFloat(lat1), parseFloat(lon1), parseInt(radius1))
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
  }, [type1, area1Id, lat1, lon1, radius1]);

  // Fetch score 2 when area is selected
  const fetchScore2 = useCallback(() => {
    if (mode2 === 'area' && selectedArea2) {
      setLoading2(true);
      setAiRec(null);
      getAreaScore(parseInt(selectedArea2))
        .then((res) => setScore2(res.data))
        .catch(() => {})
        .finally(() => setLoading2(false));
    } else if (mode2 === 'custom' && customLat2 !== null && customLon2 !== null) {
      setLoading2(true);
      setAiRec(null);
      getCustomScore(customLat2, customLon2, radius2)
        .then((res) => setScore2(res.data))
        .catch(() => {})
        .finally(() => setLoading2(false));
    }
  }, [mode2, selectedArea2, customLat2, customLon2, radius2]);

  // Init map for place 2
  useEffect(() => {
    if (!showMap || !mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([17.44, 78.38], 12);    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(map);

    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      setMode2('custom');
      setSelectedArea2('');
      setCustomLat2(e.latlng.lat);
      setCustomLon2(e.latlng.lng);

      markerLayerRef.current?.clearLayers();
      const icon = L.divIcon({
        html: `<div style="background:#a855f7;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker([e.latlng.lat, e.latlng.lng], { icon }).addTo(markerLayerRef.current!);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [showMap]);

  // Fetch AI comparison
  const fetchComparison = async () => {
    if (!score1 || !score2) return;
    setAiLoading(true);
    try {
      const res = await getAIRecommendation({
        locality_name: `Comparison: ${score1.area_name} vs ${score2.area_name}`,
        final_score: score1.final_score,
        category_scores: {
          ...Object.fromEntries(
            Object.keys(score1.category_scores).map((k) => [
              k,
              score1.category_scores[k],
            ])
          ),
          ...Object.fromEntries(
            Object.keys(score2.category_scores).map((k) => [
              `${k}_place2`,
              score2.category_scores[k],
            ])
          ),
        },
        infrastructure: {
          ...score1.infrastructure,
          ...Object.fromEntries(
            Object.keys(score2.infrastructure).map((k) => [
              `${k}_place2`,
              score2.infrastructure[k],
            ])
          ),
        },
        profile_context: score1.profile_context,
      });
      setAiRec(res.data.recommendation);
    } catch {
      setAiRec('Unable to generate comparison. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const bothLoaded = score1 && score2;

  // Build comparison chart data
  const comparisonChartData = bothLoaded
    ? Object.keys(score1.category_scores).map((key) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        [score1.area_name]: Math.round(score1.category_scores[key]),
        [score2.area_name]: Math.round(score2.category_scores[key]),
      }))
    : [];

  const scoreColor = (s: number) =>
    s >= 75 ? 'text-green-500' : s >= 50 ? 'text-yellow-500' : 'text-red-500';

  return (
    <AppLayout>      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 animate-slide-up">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="font-bold tracking-tight">Compare Locations</h1>
            <p className="text-muted-foreground text-sm mt-1">Side-by-side lifestyle score comparison</p>
          </div>
        </div>

        {/* Two-column selection */}        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Place 1 */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
            <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Place 1
            </h2>
            {loading1 ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading score...
              </div>
            ) : score1 ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">{score1.area_name}</p>                  <div className="flex items-baseline gap-2 mt-1">
                    <AnimatedNumber value={score1.final_score} duration={800} className={`text-4xl font-extrabold ${scoreColor(score1.final_score)}`} />
                    <span className="text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {Object.entries(score1.category_scores).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={v} className="w-20 h-2" />
                        <span className="font-semibold w-8 text-right">{Math.round(v)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Infrastructure</p>
                  {Object.entries(score1.infrastructure).map(([k, v]) => {
                    const info = infraLabels[k];
                    if (!info) return null;
                    return (
                      <div key={k} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-1.5">
                          {info.icon}
                          <span className="text-muted-foreground">{info.label}</span>
                        </div>
                        <span className="font-semibold">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No score data available</p>
            )}
          </div>

          {/* Place 2 */}          <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
            <h2 className="font-semibold text-lg tracking-tight pb-3 mb-4 border-b border-border flex items-center gap-2">
              <MapPin className="h-4 w-4 text-purple-500" /> Place 2
            </h2>

            {!score2 && (
              <div className="space-y-4">
                {/* Area dropdown */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Select a pre-defined area</label>
                  {loadingAreas ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading...
                    </div>
                  ) : (
                    <Select
                      value={selectedArea2}
                      onValueChange={(v) => {
                        setSelectedArea2(v);
                        setMode2('area');
                        setCustomLat2(null);
                        setCustomLon2(null);
                      }}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Choose an area" /></SelectTrigger>
                      <SelectContent>
                        {areas.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">OR</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Map toggle */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowMap(!showMap)}
                >
                  <Target className="h-4 w-4 mr-2" />
                  {showMap ? 'Hide Map' : 'Pick on Map'}
                </Button>

                {showMap && (
                  <div className="rounded-lg overflow-hidden border border-border h-48">
                    <div ref={mapContainerRef} className="h-full w-full" />
                  </div>
                )}

                {mode2 === 'custom' && customLat2 !== null && (
                  <p className="text-xs text-muted-foreground text-center">
                    Selected: {customLat2.toFixed(4)}, {customLon2!.toFixed(4)}
                  </p>
                )}

                {/* Fetch Score 2 */}
                {(selectedArea2 || (customLat2 !== null && customLon2 !== null)) && (
                  <Button
                    onClick={fetchScore2}
                    disabled={loading2}
                    className="w-full gradient-warm text-primary-foreground font-semibold"
                    size="sm"
                  >
                    {loading2 ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Generate Score
                  </Button>
                )}
              </div>
            )}

            {loading2 && (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Computing score...
              </div>
            )}

            {score2 && !loading2 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{score2.area_name}</p>                    <div className="flex items-baseline gap-2 mt-1">
                      <AnimatedNumber value={score2.final_score} duration={800} className={`text-4xl font-extrabold ${scoreColor(score2.final_score)}`} />
                      <span className="text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setScore2(null);
                      setSelectedArea2('');
                      setCustomLat2(null);
                      setCustomLon2(null);
                      setAiRec(null);
                    }}
                  >
                    Change
                  </Button>
                </div>
                <div className="space-y-2">
                  {Object.entries(score2.category_scores).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{k}</span>
                      <div className="flex items-center gap-2">
                        <Progress value={v} className="w-20 h-2" />
                        <span className="font-semibold w-8 text-right">{Math.round(v)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Infrastructure</p>                  {Object.entries(score2.infrastructure).map(([k, v]) => {
                    const info = infraLabels[k];
                    if (!info) return null;
                    return (
                      <div key={k} className="flex items-center justify-between text-xs p-1.5 rounded hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-1.5">
                          {info.icon}
                          <span className="text-muted-foreground">{info.label}</span>
                        </div>
                        <span className="font-semibold">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comparison Section – only shows when both are loaded */}
        {bothLoaded && (          <div className="space-y-8 animate-slide-up">
            {/* Score summary */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Score Comparison</h2>
              <div className="grid grid-cols-3 gap-4 items-center text-center">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{score1.area_name}</p>
                  <AnimatedNumber value={score1.final_score} duration={800} className={`text-3xl font-extrabold ${scoreColor(score1.final_score)}`} />
                </div>
                <div className="text-2xl font-bold text-muted-foreground">VS</div>                <div>
                  <p className="text-sm text-muted-foreground mb-1">{score2.area_name}</p>
                  <AnimatedNumber value={score2.final_score} duration={800} className={`text-3xl font-extrabold ${scoreColor(score2.final_score)}`} />
                </div>
              </div>
              {score1.final_score !== score2.final_score && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <span className="text-primary font-semibold">
                    {score1.final_score > score2.final_score ? score1.area_name : score2.area_name}
                  </span>{' '}
                  scores higher by{' '}
                  <span className="font-semibold">
                    {Math.abs(Math.round(score1.final_score - score2.final_score))} points
                  </span>
                </p>
              )}
            </div>

            {/* Side-by-side bar chart */}            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
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

            {/* Category-by-category winner */}            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border">Best For Each Category</h2>
              <div className="space-y-3">
                {Object.keys(score1.category_scores).map((k) => {
                  const v1 = score1.category_scores[k];
                  const v2 = score2.category_scores[k];
                  const winner = v1 > v2 ? score1.area_name : v2 > v1 ? score2.area_name : 'Tie';
                  const winnerColor = v1 > v2 ? 'text-primary' : v2 > v1 ? 'text-purple-500' : 'text-muted-foreground';
                  return (
                    <div key={k} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background hover:border-primary/30 hover:shadow-sm transition-all duration-200">
                      <span className="capitalize font-medium text-sm">{k}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="w-8 text-right font-semibold">{Math.round(v1)}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="w-8 font-semibold">{Math.round(v2)}</span>
                        <span className={`w-28 text-right text-xs font-semibold ${winnerColor}`}>
                          {winner === 'Tie' ? '🤝 Tie' : `✓ ${winner}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Comparison */}            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
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
                <p className="text-sm text-muted-foreground">
                  Click "Generate" to get an AI-powered comparison of these two localities.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Compare;
