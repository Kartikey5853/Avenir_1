import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { ChevronLeft, ChevronRight, MapPin, Loader2, Sparkles, Target, Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import AppLayout from '@/components/AppLayout';
import { getAreas, getProfile } from '@/services/api';
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
  marital_status: string;
  has_parents: boolean;
  employment_status: string;
  has_vehicle: boolean;
  has_elderly: boolean;
  has_children: boolean;
  income_range: string;
}

const MapView = () => {
  const [areas, setAreas] = useState<BackendArea[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  // Custom click-on-map state
  const [customLat, setCustomLat] = useState<number | null>(null);
  const [customLon, setCustomLon] = useState<number | null>(null);
  const [radius, setRadius] = useState(2000);
  const [mode, setMode] = useState<'area' | 'custom'>('area');

  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const customLayerRef = useRef<L.LayerGroup | null>(null);
  const navigate = useNavigate();

  const selectedArea = areas.find((a) => String(a.id) === selectedId);

  // Fetch areas + profile from backend
  useEffect(() => {
    getAreas()
      .then((res) => setAreas(res.data.areas || []))
      .catch(() => {})
      .finally(() => setLoadingAreas(false));

    getProfile()
      .then((res) => {
        if (res.data) setProfile(res.data);
      })
      .catch(() => {});
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: false }).setView([17.44, 78.38], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    customLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Click on map handler
    map.on('click', (e: L.LeafletMouseEvent) => {
      setMode('custom');
      setSelectedId('');
      setCustomLat(e.latlng.lat);
      setCustomLon(e.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw area selection on map
  useEffect(() => {
    if (!mapRef.current || !layerGroupRef.current) return;
    layerGroupRef.current.clearLayers();

    if (!selectedArea || mode !== 'area') return;

    mapRef.current.flyTo([selectedArea.center_lat, selectedArea.center_lon], 14, { duration: 1.2 });

    L.circle([selectedArea.center_lat, selectedArea.center_lon], {
      radius: selectedArea.radius_meters || 2000,
      color: 'hsl(31,100%,71%)',
      fillColor: 'hsl(31,100%,71%)',
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(layerGroupRef.current);

    const icon = L.divIcon({
      html: `<div style="background:hsl(31,100%,71%);width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
      className: '',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    L.marker([selectedArea.center_lat, selectedArea.center_lon], { icon })
      .bindPopup(`<strong>${selectedArea.name}</strong>`)
      .addTo(layerGroupRef.current);
  }, [selectedArea, mode]);

  // Draw custom marker + radius on map
  useEffect(() => {
    if (!mapRef.current || !customLayerRef.current) return;
    customLayerRef.current.clearLayers();

    if (mode !== 'custom' || customLat === null || customLon === null) return;

    L.circle([customLat, customLon], {
      radius: radius,
      color: '#a855f7',
      fillColor: '#a855f7',
      fillOpacity: 0.12,
      weight: 2,
    }).addTo(customLayerRef.current);

    const icon = L.divIcon({
      html: `<div style="background:#a855f7;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
      className: '',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    L.marker([customLat, customLon], { icon })
      .bindPopup(`<strong>Custom Location</strong><br/>${customLat.toFixed(4)}, ${customLon.toFixed(4)}`)
      .addTo(customLayerRef.current);
  }, [customLat, customLon, radius, mode]);

  // Invalidate map size when panel toggles
  useEffect(() => {
    setTimeout(() => mapRef.current?.invalidateSize(), 350);
  }, [panelOpen]);

  const handleAreaSelect = (val: string) => {
    setSelectedId(val);
    setMode('area');
    setCustomLat(null);
    setCustomLon(null);
    customLayerRef.current?.clearLayers();
  };

  const handleGenerateScore = () => {
    if (mode === 'area' && selectedArea) {
      navigate(`/score/${selectedArea.id}`);
    } else if (mode === 'custom' && customLat !== null && customLon !== null) {
      navigate(`/score/custom?lat=${customLat}&lon=${customLon}&radius=${radius}`);
    }
  };

  const canGenerate =
    (mode === 'area' && selectedArea) ||
    (mode === 'custom' && customLat !== null && customLon !== null);
  return (
    <AppLayout noPadding>
      <div className="relative flex h-[calc(100vh-3.5rem)] overflow-hidden">
        {/* Left panel */}
        <div
          className={`absolute md:relative z-10 h-full bg-card border-r border-border transition-all duration-300 overflow-y-auto ${
            panelOpen ? 'w-80' : 'w-0 overflow-hidden'
          }`}
        >
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
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* OR divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Click on map instruction */}
            <div className="text-center p-3 rounded-lg border border-dashed border-border bg-muted/30">
              <Target className="h-5 w-5 mx-auto mb-1 text-primary" />
              <p className="text-xs text-muted-foreground">
                Click anywhere on the map to select a custom location
              </p>
            </div>

            {/* Radius adjustment for custom mode */}
            {mode === 'custom' && customLat !== null && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Custom Location</h3>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Latitude</span>
                    <span className="font-medium text-foreground">{customLat.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Longitude</span>
                    <span className="font-medium text-foreground">{customLon!.toFixed(4)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Radius</label>
                    <span className="text-sm text-primary font-semibold">{radius}m</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setRadius(Math.max(500, radius - 500))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Slider
                      value={[radius]}
                      onValueChange={(v) => setRadius(v[0])}
                      min={500}
                      max={10000}
                      step={250}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setRadius(Math.min(10000, radius + 500))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Area details */}
            {mode === 'area' && selectedArea && (
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold text-sm">Area Details</h3>
                <div className="flex justify-between text-muted-foreground">
                  <span>Latitude</span>
                  <span className="font-medium text-foreground">{selectedArea.center_lat}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Longitude</span>
                  <span className="font-medium text-foreground">{selectedArea.center_lon}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Radius</span>
                  <span className="font-medium text-foreground">{selectedArea.radius_meters || 2000}m</span>
                </div>
              </div>
            )}

            {/* Profile summary */}
            {profile && (
              <div className="space-y-2 pt-2 border-t border-border">
                <h3 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">Your Profile</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Status</span>
                    <span className="font-medium capitalize">{profile.marital_status}</span>
                  </div>
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Work</span>
                    <span className="font-medium capitalize">{profile.employment_status}</span>
                  </div>
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Vehicle</span>
                    <span className="font-medium">{profile.has_vehicle ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Elderly</span>
                    <span className="font-medium">{profile.has_elderly ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Children</span>
                    <span className="font-medium">{profile.has_children ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="p-2 rounded border border-border bg-muted/30">
                    <span className="text-muted-foreground block">Parents</span>
                    <span className="font-medium">{profile.has_parents ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Generate Score button */}
            {canGenerate && (
              <>
                <Button
                  onClick={handleGenerateScore}
                  className="w-full gradient-warm text-primary-foreground font-semibold"
                  size="lg"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Score
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Fetches real infrastructure data from OpenStreetMap and computes your personalized lifestyle score
                </p>
              </>
            )}
          </div>
        </div>

        {/* Toggle panel button */}
        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-card border border-border rounded-r-lg p-1 shadow-card md:hidden"
          style={{ left: panelOpen ? '320px' : 0 }}
        >
          {panelOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="h-full w-full" />
        </div>
      </div>
    </AppLayout>
  );
};

export default MapView;
