import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import {
  ChevronLeft, ChevronRight, MapPin, Loader2, Sparkles, Target,
  Building2, GraduationCap, Bus, ShoppingCart, UtensilsCrossed,
  TrainFront, Dumbbell, Wine, Trees, ShieldCheck, Flame, Coffee,
  RefreshCw, AlertTriangle, Wifi
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import { getAreas, getProfile, getAreaInfrastructureLocations } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';

interface BackendArea {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  boundary_type: string;
  radius_meters: number | null;
}

interface ProfileData {
  has_children: boolean;
  relies_on_public_transport: boolean;
  prefers_vibrant_lifestyle: boolean;
  safety_priority: boolean;
}

const infraCfg: Record<string, { mapColor: string }> = {
  hospitals:      { mapColor: '#ef4444' },
  schools:        { mapColor: '#a855f7' },
  bus_stops:      { mapColor: '#60a5fa' },
  metro_stations: { mapColor: '#2563eb' },
  train_stations: { mapColor: '#6366f1' },
  supermarkets:   { mapColor: '#22c55e' },
  restaurants:    { mapColor: '#eab308' },
  cafes:          { mapColor: '#f59e0b' },
  gyms:           { mapColor: '#f97316' },
  bars:           { mapColor: '#ec4899' },
  parks:          { mapColor: '#16a34a' },
  police:         { mapColor: '#1d4ed8' },
  fire_stations:  { mapColor: '#dc2626' },
};

const PROVIDER_STEPS = [
  { id: 'geoapify',   name: 'Geoapify Places',   detail: 'Batch — all 13 categories in 1 call' },
  { id: 'mapbox',     name: 'Mapbox Search Box', detail: 'Commercial precision mapping'        },
  { id: 'locationiq', name: 'LocationIQ Nearby', detail: 'OSM-powered nearby search'           },
  { id: 'overpass',   name: 'Overpass API',      detail: 'Free OSM fallback'                   },
];

const LOAD_TIMEOUT_MS = 30_000;

const MapView = () => {
  const [areas, setAreas] = useState<BackendArea[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Custom click state
  const [customLat, setCustomLat] = useState<number | null>(null);
  const [customLon, setCustomLon] = useState<number | null>(null);
  const [mode, setMode] = useState<'area' | 'custom'>('area');

  // Facility loading state
  const [facilityLoading, setFacilityLoading] = useState(false);
  const [facilityProgress, setFacilityProgress] = useState(0);
  const [facilityProviderIdx, setFacilityProviderIdx] = useState(0);
  const [facilityTimedOut, setFacilityTimedOut] = useState(false);
  const [facilityError, setFacilityError] = useState<string | null>(null);
  const [facilityCounts, setFacilityCounts] = useState<Record<string, number> | null>(null);

  const mapRef            = useRef<L.Map | null>(null);
  const mapContainerRef   = useRef<HTMLDivElement>(null);
  const layerGroupRef     = useRef<L.LayerGroup | null>(null);
  const customLayerRef    = useRef<L.LayerGroup | null>(null);
  const facilityLayerRef  = useRef<L.LayerGroup | null>(null);
  const circleRef         = useRef<L.Circle | null>(null);
  const progressRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const providerCycleRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();

  const selectedArea = areas.find((a) => String(a.id) === selectedId);

  // Load areas + profile
  useEffect(() => {
    getAreas()
      .then((res) => setAreas(res.data.areas || []))
      .catch(() => {})
      .finally(() => setLoadingAreas(false));
    getProfile()
      .then((res) => { if (res.data) setProfile(res.data); })
      .catch(() => {});
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([17.44, 78.38], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layerGroupRef.current    = L.layerGroup().addTo(map);
    customLayerRef.current   = L.layerGroup().addTo(map);
    facilityLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      setMode('custom');
      setSelectedId('');
      setCustomLat(e.latlng.lat);
      setCustomLon(e.latlng.lng);
      clearFacilities();
    });

    const ro = new window.ResizeObserver(() => map.invalidateSize());
    ro.observe(mapContainerRef.current!);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // Facility animation helpers
  const stopAnim = useCallback(() => {
    if (progressRef.current)      clearInterval(progressRef.current);
    if (providerCycleRef.current) clearInterval(providerCycleRef.current);
    if (timeoutRef.current)       clearTimeout(timeoutRef.current);
    setFacilityProgress(100);
  }, []);

  const startAnim = useCallback((onTimeout: () => void) => {
    setFacilityProgress(0); setFacilityProviderIdx(0);
    setFacilityTimedOut(false); setFacilityError(null);
    let p = 0;
    progressRef.current = setInterval(() => {
      p += p < 70 ? 3 : p < 90 ? 0.8 : 0.2;
      if (p > 99) p = 99;
      setFacilityProgress(Math.round(p));
    }, 300);
    let idx = 0;
    providerCycleRef.current = setInterval(() => {
      idx = (idx + 1) % PROVIDER_STEPS.length; setFacilityProviderIdx(idx);
    }, 2000);
    timeoutRef.current = setTimeout(() => { stopAnim(); onTimeout(); }, LOAD_TIMEOUT_MS);
  }, [stopAnim]);

  const clearFacilities = useCallback(() => {
    facilityLayerRef.current?.clearLayers();
    if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
    setFacilityCounts(null);
  }, []);

  // Fetch facility locations when area changes
  const fetchFacilities = useCallback((area: BackendArea) => {
    setFacilityLoading(true);
    setFacilityCounts(null);
    setFacilityError(null);
    clearFacilities();

    // Draw circle
    const map = mapRef.current;
    if (map) {
      const radius = area.radius_meters || 2000;
      const circle = L.circle([area.center_lat, area.center_lon], {
        radius, color: 'hsl(31,100%,71%)', fillColor: 'hsl(31,100%,71%)',
        fillOpacity: 0.07, weight: 2, dashArray: '8 6',
      }).addTo(map);
      circleRef.current = circle;
      map.flyTo([area.center_lat, area.center_lon], 14, { duration: 1 });
    }

    startAnim(() => setFacilityTimedOut(true));

    getAreaInfrastructureLocations(area.id)
      .then((res) => {
        const d = res.data;
        const newCounts: Record<string, number> = {
          hospitals:      d.hospital_count      ?? (d.hospitals      ?? []).length,
          schools:        d.school_count        ?? (d.schools        ?? []).length,
          bus_stops:      d.bus_stop_count      ?? (d.bus_stops      ?? []).length,
          metro_stations: d.metro_count         ?? (d.metro_stations ?? []).length,
          train_stations: d.train_station_count ?? (d.train_stations ?? []).length,
          supermarkets:   d.supermarket_count   ?? (d.supermarkets   ?? []).length,
          restaurants:    d.restaurant_count    ?? (d.restaurants    ?? []).length,
          cafes:          d.cafe_count          ?? (d.cafes          ?? []).length,
          gyms:           d.gym_count           ?? (d.gyms           ?? []).length,
          bars:           d.bar_count           ?? (d.bars           ?? []).length,
          parks:          d.park_count          ?? (d.parks          ?? []).length,
          police:         d.police_count        ?? (d.police         ?? []).length,
          fire_stations:  d.fire_station_count  ?? (d.fire_stations  ?? []).length,
        };
        setFacilityCounts(newCounts);

        // Plot facility pins
        facilityLayerRef.current?.clearLayers();
        Object.entries(infraCfg).forEach(([key, cfg]) => {
          const items = d[key as keyof typeof d] as any[] | undefined;
          if (!Array.isArray(items)) return;
          items.forEach((f: any) => {
            if (typeof f.lat !== 'number' || typeof f.lon !== 'number') return;
            L.circleMarker([f.lat, f.lon], {
              radius: 5, fillColor: cfg.mapColor, color: cfg.mapColor,
              weight: 1, opacity: 0.9, fillOpacity: 0.75,
            })
              .bindTooltip(f.name || key, { direction: 'top', offset: [0, -5] })
              .addTo(facilityLayerRef.current!);
          });
        });
      })
      .catch((err) => {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;
        const msg = typeof detail === 'object' ? detail?.message : detail;
        setFacilityError(
          status === 503
            ? (msg || 'Facility service temporarily unavailable.')
            : 'Failed to load facilities. Please retry.'
        );
      })
      .finally(() => { stopAnim(); setFacilityLoading(false); });
  }, [startAnim, stopAnim, clearFacilities]);

  // Custom marker
  useEffect(() => {
    if (!mapRef.current || !customLayerRef.current) return;
    customLayerRef.current.clearLayers();
    if (mode !== 'custom' || customLat === null || customLon === null) return;
    L.circle([customLat, customLon], {
      radius: 2000, color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.12, weight: 2,
    }).addTo(customLayerRef.current);
    const icon = L.divIcon({
      html: `<div style="background:#a855f7;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
      className: '', iconSize: [12, 12], iconAnchor: [6, 6],
    });
    L.marker([customLat, customLon], { icon })
      .bindPopup(`<strong>Custom Location</strong><br/>${customLat.toFixed(4)}, ${customLon!.toFixed(4)}`)
      .addTo(customLayerRef.current);
  }, [customLat, customLon, mode]);

  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 350);
  }, [panelOpen]);

  const handleAreaSelect = (val: string) => {
    setSelectedId(val);
    setMode('area');
    setCustomLat(null);
    setCustomLon(null);
    customLayerRef.current?.clearLayers();
    layerGroupRef.current?.clearLayers();
    facilityLayerRef.current?.clearLayers();
    setFacilityCounts(null);
    setFacilityError(null);
    setFacilityTimedOut(false);

    const area = areas.find((a) => String(a.id) === val);
    if (!area) return;

    // Just highlight the area with a circle — no POI fetching
    const map = mapRef.current;
    if (map) {
      if (circleRef.current) { circleRef.current.remove(); circleRef.current = null; }
      const radius = area.radius_meters || 2000;
      const circle = L.circle([area.center_lat, area.center_lon], {
        radius, color: 'hsl(31,100%,71%)', fillColor: 'hsl(31,100%,71%)',
        fillOpacity: 0.10, weight: 2, dashArray: '8 6',
      }).addTo(map);
      circleRef.current = circle;
      map.flyTo([area.center_lat, area.center_lon], 14, { duration: 1 });
    }
  };

  const handleGenerateScore = () => {
    if (mode === 'area' && selectedArea) navigate(`/score/${selectedArea.id}`);
    else if (mode === 'custom' && customLat !== null && customLon !== null)
      navigate(`/score/custom?lat=${customLat}&lon=${customLon}`);
  };

  const canGenerate = (mode === 'area' && selectedArea) || (mode === 'custom' && customLat !== null);

  return (
    <AppLayout noPadding>
      <div className="relative flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Left panel */}
        <div className={`absolute md:relative z-10 h-full bg-card border-r border-border transition-all duration-300 overflow-y-auto ${panelOpen ? 'w-80' : 'w-0 overflow-hidden'}`}>
          <div className="p-5 space-y-5">
            {/* Area Dropdown */}
            <div>
              <h2 className="font-semibold text-sm mb-3">Select Area</h2>
              {loadingAreas ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading areas...
                </div>
              ) : (
                <Select value={selectedId} onValueChange={handleAreaSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose an area" /></SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="text-center p-3 rounded-lg border border-dashed border-border bg-muted/30">
              <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">Click anywhere on the map to select a custom location</p>
            </div>

            {/* Custom coords */}
            {mode === 'custom' && customLat !== null && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <h3 className="font-semibold text-sm text-foreground">Custom Location</h3>
                <div className="flex justify-between"><span>Latitude</span><span className="font-medium text-foreground">{customLat.toFixed(4)}</span></div>
                <div className="flex justify-between"><span>Longitude</span><span className="font-medium text-foreground">{customLon!.toFixed(4)}</span></div>
                <div className="flex justify-between"><span>Radius</span><span className="font-medium text-foreground">2000m</span></div>
              </div>
            )}

            {/* Area details */}
            {mode === 'area' && selectedArea && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <h3 className="font-semibold text-sm text-foreground">Area Details</h3>
                <div className="flex justify-between"><span>Lat</span><span className="font-medium text-foreground">{selectedArea.center_lat}</span></div>
                <div className="flex justify-between"><span>Lon</span><span className="font-medium text-foreground">{selectedArea.center_lon}</span></div>
                <div className="flex justify-between"><span>Radius</span><span className="font-medium text-foreground">{selectedArea.radius_meters || 2000}m</span></div>
              </div>
            )}

            {/* Facility counts summary — removed (area selection now shows score only) */}



            {/* Profile summary */}
            {profile && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Your Profile</h3>
                <div className="space-y-1 text-xs">
                  {[
                    { label: 'Has Children',      val: profile.has_children                },
                    { label: 'Public Transport',  val: profile.relies_on_public_transport  },
                    { label: 'Vibrant Lifestyle', val: profile.prefers_vibrant_lifestyle   },
                    { label: 'Safety Priority',   val: profile.safety_priority             },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex justify-between text-muted-foreground">
                      <span>{label}</span>
                      <span className={`font-medium ${val ? 'text-green-500' : 'text-foreground'}`}>{val ? 'Yes' : 'No'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generate Score */}
            {canGenerate && (
              <>
                <Button onClick={handleGenerateScore} className="w-full gradient-warm text-primary-foreground font-semibold" size="lg">
                  <Sparkles className="h-4 w-4 mr-2" /> Generate Score
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Fetches live infrastructure data and computes your personalized lifestyle score
                </p>
              </>
            )}
          </div>
        </div>

        {/* Panel toggle (mobile) */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute top-1/2 -translate-y-1/2 z-20 bg-card border border-border rounded-r-lg p-1 shadow-card md:hidden"
          style={{ left: panelOpen ? '320px' : 0 }}
        >
          {panelOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Map */}
        <div className="flex-1 relative">
          {/* Map container */}
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </AppLayout>
  );
};

export default MapView;
