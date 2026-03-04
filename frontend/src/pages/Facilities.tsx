import { useEffect, useState, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  Building2, GraduationCap, Bus, ShoppingCart, UtensilsCrossed,
  Dumbbell, Loader2, MapPin, Trees,
  ShieldCheck, Flame, RefreshCw, AlertTriangle, Wifi
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppLayout from '@/components/AppLayout';
import { getAreas, getAreaInfrastructureLocations } from '@/services/api';
import 'leaflet/dist/leaflet.css';

interface BackendArea {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_meters: number | null;
}

const infraConfig: Record<string, { label: string; icon: React.ReactNode; color: string; mapColor: string }> = {
  hospitals:     { label: 'Hospitals & Clinics',    icon: <Building2 className="h-4 w-4" />,       color: 'text-red-500',    mapColor: '#ef4444' },
  schools:       { label: 'Schools',                icon: <GraduationCap className="h-4 w-4" />,   color: 'text-purple-500', mapColor: '#a855f7' },
  bus_stops:     { label: 'Bus Stops',              icon: <Bus className="h-4 w-4" />,             color: 'text-blue-400',   mapColor: '#60a5fa' },
  supermarkets:  { label: 'Grocery / Supermarkets', icon: <ShoppingCart className="h-4 w-4" />,    color: 'text-green-500',  mapColor: '#22c55e' },
  restaurants:   { label: 'Restaurants',            icon: <UtensilsCrossed className="h-4 w-4" />, color: 'text-yellow-500', mapColor: '#eab308' },
  gyms:          { label: 'Gyms & Fitness',         icon: <Dumbbell className="h-4 w-4" />,        color: 'text-orange-500', mapColor: '#f97316' },
  parks:         { label: 'Parks',                  icon: <Trees className="h-4 w-4" />,           color: 'text-green-600',  mapColor: '#16a34a' },
  police:        { label: 'Police Stations',        icon: <ShieldCheck className="h-4 w-4" />,     color: 'text-blue-700',   mapColor: '#1d4ed8' },
  fire_stations: { label: 'Fire Stations',          icon: <Flame className="h-4 w-4" />,           color: 'text-red-600',    mapColor: '#dc2626' },
};

const PROVIDER_STEPS = [
  { id: 'geoapify',   name: 'Geoapify Places',    detail: 'Batch mode — all 13 categories in 1 call' },
  { id: 'mapbox',     name: 'Mapbox Search Box',  detail: 'Commercial precision mapping'             },
  { id: 'locationiq', name: 'LocationIQ Nearby',  detail: 'OSM-powered nearby search'                },
  { id: 'overpass',   name: 'Overpass API',       detail: 'Free OSM fallback — always available'     },
];

const LOAD_TIMEOUT_MS = 30_000;

const Facilities = () => {
  const [areas, setAreas]               = useState<BackendArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [areaName, setAreaName]         = useState('');
  const [counts, setCounts]             = useState<Record<string, number> | null>(null);
  const [loading, setLoading]           = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [progress, setProgress]         = useState(0);
  const [activeProviderIdx, setActiveProviderIdx] = useState(0);
  const [timedOut, setTimedOut]         = useState(false);
  const [serverError, setServerError]   = useState<string | null>(null);

  // Area picker modal
  const [showStartModal, setShowStartModal] = useState(true);
  const [pickedAreaId,   setPickedAreaId]   = useState<string>('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<L.Map | null>(null);
  const markersRef      = useRef<L.LayerGroup | null>(null);
  const circleRef       = useRef<L.Circle | null>(null);
  const progressRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerCycleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load areas ───────────────────────────────────────────────────────────────
  useEffect(() => {
    getAreas()
      .then((res) => {
        setAreas(res.data.areas || []);
        // Do NOT auto-select first area — user must pick via modal
      })
      .catch(() => {})
      .finally(() => setLoadingAreas(false));
  }, []);

  // ── Init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [17.44, 78.38], zoom: 13, zoomControl: true, attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);
    const ro = new window.ResizeObserver(() => map.invalidateSize());
    ro.observe(mapContainerRef.current!);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // ── Animation helpers ─────────────────────────────────────────────────────────
  const stopLoadingAnimations = useCallback(() => {
    if (progressRef.current)      clearInterval(progressRef.current);
    if (providerCycleRef.current) clearInterval(providerCycleRef.current);
    if (timeoutRef.current)       clearTimeout(timeoutRef.current);
    setProgress(100);
  }, []);

  const startLoadingAnimations = useCallback((onTimeout: () => void) => {
    setProgress(0); setActiveProviderIdx(0); setTimedOut(false); setServerError(null);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += p < 70 ? 3 : p < 90 ? 0.8 : 0.2;
      if (p > 99) p = 99;
      setProgress(Math.round(p));
    }, 300);
    let idx = 0;
    providerCycleRef.current = setInterval(() => {
      idx = (idx + 1) % PROVIDER_STEPS.length;
      setActiveProviderIdx(idx);
    }, 2000);
    timeoutRef.current = setTimeout(() => {
      stopLoadingAnimations();
      onTimeout();
    }, LOAD_TIMEOUT_MS);
  }, [stopLoadingAnimations]);

  // ── Draw area circle ──────────────────────────────────────────────────────────
  const drawAreaCircle = useCallback((area: BackendArea) => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
    const radius = area.radius_meters || 2000;
    const circle = L.circle([area.center_lat, area.center_lon], {
      radius,
      color: 'hsl(31,100%,71%)', fillColor: 'hsl(31,100%,71%)',
      fillOpacity: 0.06, weight: 2, dashArray: '8 6',
    }).addTo(map);
    circleRef.current = circle;
    map.fitBounds(circle.getBounds(), { padding: [30, 30], animate: true });
  }, []);

  // ── Plot facility markers ─────────────────────────────────────────────────────
  const plotLocations = useCallback((cats: Record<string, any[]>, area: BackendArea) => {
    if (!mapRef.current) return;
    if (markersRef.current) markersRef.current.clearLayers();
    Object.entries(cats).forEach(([key, items]) => {
      const cfg = infraConfig[key];
      if (!cfg || !Array.isArray(items)) return;
      items.forEach((f: any) => {
        if (typeof f.lat !== 'number' || typeof f.lon !== 'number') return;
        L.circleMarker([f.lat, f.lon], {
          radius: 6, fillColor: cfg.mapColor, color: cfg.mapColor,
          weight: 1, opacity: 0.9, fillOpacity: 0.75,
        })
          .bindTooltip(f.name || cfg.label, { direction: 'top', offset: [0, -6] })
          .addTo(markersRef.current!);
      });
    });
    const pin = L.divIcon({
      html: `<div style="background:hsl(31,100%,71%);width:13px;height:13px;border-radius:50%;border:2.5px solid white;box-shadow:0 0 8px rgba(0,0,0,.45)"></div>`,
      className: '', iconSize: [13, 13], iconAnchor: [6, 6],
    });
    L.marker([area.center_lat, area.center_lon], { icon: pin })
      .bindTooltip(area.name, { permanent: true, direction: 'top', offset: [0, -12] })
      .addTo(markersRef.current!);
  }, []);

  // ── Main fetch ────────────────────────────────────────────────────────────────
  const doFetch = useCallback((areaId: string) => {
    const area = areas.find((a) => String(a.id) === areaId);
    if (!area) return;
    setLoading(true); setCounts(null); setAreaName(area.name);
    setServerError(null); setTimedOut(false);
    drawAreaCircle(area);
    startLoadingAnimations(() => setTimedOut(true));

    getAreaInfrastructureLocations(Number(areaId))
      .then((res) => {
        const d = res.data;
        setCounts({
          hospitals:     d.hospital_count      ?? (d.hospitals      ?? []).length,
          schools:       d.school_count        ?? (d.schools        ?? []).length,
          bus_stops:     d.bus_stop_count      ?? (d.bus_stops      ?? []).length,
          supermarkets:  d.supermarket_count   ?? (d.supermarkets   ?? []).length,
          restaurants:   d.restaurant_count    ?? (d.restaurants    ?? []).length,
          gyms:          d.gym_count           ?? (d.gyms           ?? []).length,
          parks:         d.park_count          ?? (d.parks          ?? []).length,
          police:        d.police_count        ?? (d.police         ?? []).length,
          fire_stations: d.fire_station_count  ?? (d.fire_stations  ?? []).length,
        });
        plotLocations({
          hospitals:     d.hospitals      || [],
          schools:       d.schools        || [],
          bus_stops:     d.bus_stops      || [],
          supermarkets:  d.supermarkets   || [],
          restaurants:   d.restaurants    || [],
          gyms:          d.gyms           || [],
          parks:         d.parks          || [],
          police:        d.police         || [],
          fire_stations: d.fire_stations  || [],
        }, area);
      })
      .catch((err) => {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        const msg = typeof detail === 'object' ? detail?.message : detail;
        setServerError(
          status === 503
            ? (msg || 'Infrastructure service temporarily unavailable (503).')
            : 'Failed to load facility data. Please retry.'
        );
      })
      .finally(() => { stopLoadingAnimations(); setLoading(false); });
  }, [areas, startLoadingAnimations, stopLoadingAnimations, drawAreaCircle, plotLocations]);

  useEffect(() => {
    if (!selectedAreaId || areas.length === 0) return;
    doFetch(selectedAreaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAreaId, areas]);

  const handleModalConfirm = () => {
    if (!pickedAreaId) return;
    setShowStartModal(false);
    setSelectedAreaId(pickedAreaId);
  };

  const total = counts ? Object.values(counts).reduce((s, v) => s + v, 0) : 0;

  return (
    <AppLayout noPadding>
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">

        {/* ── MAP ─────────────────────────────────────────── */}
        <div className="flex-1 relative min-w-0">
          <div ref={mapContainerRef} className="absolute inset-0" />

        {/* ── Area-picker startup modal ─────────────────────────────────── */}
          {showStartModal && (
            <div className="absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-[440px] max-w-[92vw] space-y-6 animate-slide-up">
                <div>
                  <h2 className="font-bold text-xl tracking-tight flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" /> Facilities Overview
                  </h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    Select an area to view live infrastructure data fetched via our 4-provider race.
                  </p>
                </div>

                {loadingAreas ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading areas…
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Choose Area</p>
                    <div className="space-y-2">
                      {areas.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => setPickedAreaId(String(a.id))}
                          className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                            pickedAreaId === String(a.id)
                              ? 'border-primary bg-primary/10 text-primary font-semibold'
                              : 'border-border bg-background hover:border-primary/40 text-foreground'
                          }`}
                        >
                          <span className="font-medium">{a.name}</span>
                          {a.radius_meters && (
                            <span className="ml-2 text-xs text-muted-foreground">• {(a.radius_meters / 1000).toFixed(1)} km radius</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleModalConfirm}
                  disabled={!pickedAreaId || loadingAreas}
                  className="w-full gradient-warm text-primary-foreground font-semibold"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Load Facilities
                </Button>
              </div>
            </div>
          )}
          {loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-[480px] max-w-[90vw] space-y-6">
                <div>
                  <h3 className="font-bold text-lg tracking-tight flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-primary animate-pulse" />
                    Fetching Facilities
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    We race <strong>4 providers simultaneously</strong> — the fastest response wins and the rest are cancelled immediately.
                  </p>
                </div>
                <div className="space-y-2">
                  {PROVIDER_STEPS.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-500 ${
                      i === activeProviderIdx ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-border bg-background opacity-50'
                    }`}>
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${i === activeProviderIdx ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold truncate ${i === activeProviderIdx ? 'text-primary' : 'text-muted-foreground'}`}>{p.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{p.detail}</p>
                      </div>
                      {i === activeProviderIdx && <Loader2 className="h-3 w-3 animate-spin text-primary ml-auto flex-shrink-0" />}
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Querying OpenStreetMap / commercial APIs…</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-[10px] text-muted-foreground text-center">May take up to 30 seconds on first load</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeout overlay */}
          {timedOut && !serverError && !loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 w-96 max-w-[90vw] text-center space-y-4">
                <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
                <h3 className="font-bold text-lg">Taking Longer Than Expected</h3>
                <p className="text-sm text-muted-foreground">The request is processing in the background. Retry to check.</p>
                <Button onClick={() => doFetch(selectedAreaId)} className="w-full gradient-warm text-primary-foreground">
                  <RefreshCw className="h-4 w-4 mr-2" /> Retry Now
                </Button>
              </div>
            </div>
          )}

          {/* 503 / error overlay */}
          {serverError && !loading && (
            <div className="absolute inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="bg-card border border-destructive/40 rounded-2xl shadow-2xl p-8 w-96 max-w-[90vw] text-center space-y-4">
                <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
                <h3 className="font-bold text-lg">Service Unavailable</h3>
                <p className="text-sm text-muted-foreground">{serverError}</p>
                <p className="text-xs text-muted-foreground">The OpenStreetMap / Overpass service may be temporarily overloaded. Please wait a moment.</p>
                <Button onClick={() => doFetch(selectedAreaId)} className="w-full gradient-warm text-primary-foreground">
                  <RefreshCw className="h-4 w-4 mr-2" /> Reload Data
                </Button>
              </div>
            </div>
          )}

          {/* Map legend – z-[600] so it floats above loading/error overlays */}
          <div className="absolute bottom-4 left-4 z-[600] bg-card/90 backdrop-blur-sm rounded-lg border border-border p-2.5 flex flex-wrap gap-x-3 gap-y-1.5 max-w-xs shadow-lg">
            {Object.entries(infraConfig).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-[10px]">
                <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.mapColor }} />
                <span className="text-muted-foreground">{cfg.label.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────── */}
        <div className="w-80 xl:w-96 flex-shrink-0 border-l border-border bg-card overflow-y-auto">
          <div className="p-5 space-y-5">
            <div>
              <h1 className="font-bold tracking-tight text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> Facilities Overview
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Live data via 4-provider race</p>
            </div>

            <div className="glow-on-active rounded-lg">
              <Select value={selectedAreaId} onValueChange={setSelectedAreaId} disabled={loadingAreas || loading}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingAreas ? 'Loading areas…' : 'Select area'} />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">{areaName || 'Area'} Infrastructure</p>
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />}
              </div>

              {counts ? (
                <div className="space-y-1.5">
                  {Object.entries(infraConfig).map(([key, cfg]) => {
                    const count = counts[key] ?? 0;
                    return (
                      <div key={key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-background hover:border-primary/30 transition-all">
                        <div className={cfg.color}>{cfg.icon}</div>
                        <p className="text-xs font-medium flex-1 truncate">{cfg.label}</p>
                        <p className={`text-base font-bold tabular-nums ${count === 0 ? 'text-muted-foreground' : ''}`}>{count}</p>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground pt-1 text-right">
                    Total: <span className="font-bold text-foreground">{total}</span> facilities
                  </p>
                  <Button variant="outline" size="sm" className="w-full mt-1 text-xs" onClick={() => doFetch(selectedAreaId)} disabled={loading}>
                    <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Data
                  </Button>
                </div>
              ) : loading ? (
                <div className="space-y-1.5">
                  {Object.keys(infraConfig).map((key) => (
                    <div key={key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-background animate-pulse">
                      <div className="h-4 w-4 rounded bg-muted" />
                      <div className="flex-1 h-3 rounded bg-muted" />
                      <div className="h-4 w-6 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Select an area to view facilities</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default Facilities;
