import { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import {
  Building2, GraduationCap, Bus, ShoppingCart, UtensilsCrossed, TrainFront,
  Dumbbell, Wine, Loader2, MapPin
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AppLayout from '@/components/AppLayout';
import { getAreas, getAreaScore, getAreaInfrastructureLocations } from '@/services/api';
import 'leaflet/dist/leaflet.css';

interface BackendArea {
  id: number;
  name: string;
  center_lat: number;
  center_lon: number;
  radius_meters: number | null;
}

interface InfraData {
  hospitals: number;
  schools: number;
  bus_stops: number;
  metro_stations: number;
  supermarkets: number;
  restaurants: number;
  gyms: number;
  bars: number;
}

const infraConfig: Record<string, { label: string; icon: React.ReactNode; color: string; mapColor: string }> = {
  hospitals: { label: 'Hospitals & Clinics', icon: <Building2 className="h-5 w-5" />, color: 'text-red-500', mapColor: '#ef4444' },
  schools: { label: 'Schools', icon: <GraduationCap className="h-5 w-5" />, color: 'text-purple-500', mapColor: '#a855f7' },
  bus_stops: { label: 'Bus Stops', icon: <Bus className="h-5 w-5" />, color: 'text-blue-500', mapColor: '#3b82f6' },
  metro_stations: { label: 'Metro Stations', icon: <TrainFront className="h-5 w-5" />, color: 'text-blue-600', mapColor: '#2563eb' },
  supermarkets: { label: 'Grocery / Supermarkets', icon: <ShoppingCart className="h-5 w-5" />, color: 'text-green-500', mapColor: '#22c55e' },
  restaurants: { label: 'Restaurants & Cafes', icon: <UtensilsCrossed className="h-5 w-5" />, color: 'text-yellow-500', mapColor: '#eab308' },
  gyms: { label: 'Gyms & Fitness', icon: <Dumbbell className="h-5 w-5" />, color: 'text-orange-500', mapColor: '#f97316' },
  bars: { label: 'Bars & Pubs', icon: <Wine className="h-5 w-5" />, color: 'text-pink-500', mapColor: '#ec4899' },
};

const Facilities = () => {
  const [areas, setAreas] = useState<BackendArea[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [infra, setInfra] = useState<InfraData | null>(null);
  const [areaName, setAreaName] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [facilityLocations, setFacilityLocations] = useState<any | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Load areas
  useEffect(() => {
    getAreas()
      .then((res) => {
        setAreas(res.data.areas || []);
        if (res.data.areas?.length > 0) {
          setSelectedAreaId(String(res.data.areas[0].id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAreas(false));
  }, []);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [17.44, 78.38],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Fix: ensure map always renders at full size on first load
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    // Optionally, use ResizeObserver for robustness
    if (mapContainerRef.current) {
      const resizeObserver = new window.ResizeObserver(() => {
        map.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
      // Clean up
      return () => {
        resizeObserver.disconnect();
        map.remove();
        mapRef.current = null;
      };
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fetch infra when area changes
  useEffect(() => {
    if (!selectedAreaId) return;
    const area = areas.find((a) => String(a.id) === selectedAreaId);
    if (!area) return;

    setLoading(true);
    setAreaName(area.name);

    // Try to fetch facility locations for main areas (IDs 1-6)
    const areaIdNum = Number(selectedAreaId);
    if ([1,2,3,4,5,6].includes(areaIdNum)) {
      getAreaInfrastructureLocations(areaIdNum)
        .then((res) => {
          setInfra({
            hospitals: res.data.hospital_count,
            schools: res.data.school_count,
            bus_stops: res.data.bus_stop_count,
            metro_stations: res.data.metro_count,
            supermarkets: res.data.supermarket_count,
            restaurants: res.data.restaurant_count,
            gyms: res.data.gym_count,
            bars: res.data.bar_count,
          });
          setFacilityLocations(res.data);

          // Update map view
          if (mapRef.current) {
            mapRef.current.setView([area.center_lat, area.center_lon], 14, { animate: true });
            if (markersRef.current) markersRef.current.clearLayers();
            // Plot real facility locations
            const cats = [
              { key: 'hospitals', color: infraConfig.hospitals.mapColor, label: infraConfig.hospitals.label },
              { key: 'schools', color: infraConfig.schools.mapColor, label: infraConfig.schools.label },
              { key: 'bus_stops', color: infraConfig.bus_stops.mapColor, label: infraConfig.bus_stops.label },
              { key: 'metro_stations', color: infraConfig.metro_stations.mapColor, label: infraConfig.metro_stations.label },
              { key: 'supermarkets', color: infraConfig.supermarkets.mapColor, label: infraConfig.supermarkets.label },
              { key: 'restaurants', color: infraConfig.restaurants.mapColor, label: infraConfig.restaurants.label },
              { key: 'gyms', color: infraConfig.gyms.mapColor, label: infraConfig.gyms.label },
              { key: 'bars', color: infraConfig.bars.mapColor, label: infraConfig.bars.label },
            ];
            cats.forEach(({key, color}) => {
              const items = res.data[key] || [];
              items.forEach((f: any) => {
                const marker = L.circleMarker([f.lat, f.lon], {
                  radius: 6,
                  fillColor: color,
                  color: color,
                  weight: 1,
                  opacity: 0.9,
                  fillOpacity: 0.7,
                }).bindTooltip(f.name ? f.name : '', { direction: 'top', offset: [0, -6] });
                markersRef.current?.addLayer(marker);
              });
            });
            // Center marker
            const centerIcon = L.divIcon({
              html: `<div style="background:hsl(31,100%,71%);width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(0,0,0,0.4)"></div>`,
              className: '',
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });
            L.marker([area.center_lat, area.center_lon], { icon: centerIcon })
              .bindTooltip(area.name, { permanent: true, direction: 'top', offset: [0, -10] })
              .addTo(markersRef.current!);
          }
        })
        .catch(() => {
          setFacilityLocations(null);
          // fallback to old logic below
        })
        .finally(() => setLoading(false));
      return;
    }

    // Fallback: old logic for non-main areas
    getAreaScore(Number(selectedAreaId))
      .then((res) => {
        setInfra(res.data.infrastructure);
        setFacilityLocations(null);
        // ...existing code for random scatter dots...
        if (mapRef.current) {
          mapRef.current.setView([area.center_lat, area.center_lon], 14, { animate: true });
          if (markersRef.current) markersRef.current.clearLayers();
          const infraData = res.data.infrastructure as InfraData;
          Object.entries(infraData).forEach(([key, count]) => {
            const config = infraConfig[key];
            if (!config || count === 0) return;
            const radiusKm = (area.radius_meters || 2000) / 1000;
            for (let i = 0; i < Math.min(count, 30); i++) {
              const angle = Math.random() * 2 * Math.PI;
              const dist = Math.random() * radiusKm * 0.8;
              const dLat = (dist / 111) * Math.cos(angle);
              const dLon = (dist / (111 * Math.cos((area.center_lat * Math.PI) / 180))) * Math.sin(angle);
              const marker = L.circleMarker([area.center_lat + dLat, area.center_lon + dLon], {
                radius: 6,
                fillColor: config.mapColor,
                color: config.mapColor,
                weight: 1,
                opacity: 0.9,
                fillOpacity: 0.7,
              }).bindTooltip(`${config.label}`, { direction: 'top', offset: [0, -6] });
              markersRef.current?.addLayer(marker);
            }
          });
          // Center marker
          const centerIcon = L.divIcon({
            html: `<div style="background:hsl(31,100%,71%);width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 8px rgba(0,0,0,0.4)"></div>`,
            className: '',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([area.center_lat, area.center_lon], { icon: centerIcon })
            .bindTooltip(area.name, { permanent: true, direction: 'top', offset: [0, -10] })
            .addTo(markersRef.current!);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedAreaId, areas]);

  const total = infra ? Object.values(infra).reduce((s, v) => s + v, 0) : 0;

  return (
    <AppLayout>      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="font-bold tracking-tight">Facilities Overview</h1>
            <p className="text-muted-foreground mt-2">Real infrastructure data from OpenStreetMap</p>
          </div>
          <div className="w-full sm:w-64 glow-on-active rounded-lg">
            <Select value={selectedAreaId} onValueChange={setSelectedAreaId} disabled={loadingAreas}>
              <SelectTrigger>
                <SelectValue placeholder={loadingAreas ? 'Loading areas...' : 'Select area'} />
              </SelectTrigger>
              <SelectContent>
                {areas.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Mini Map */}
          <div className="bg-card rounded-xl border border-border overflow-hidden shadow-card hover-lift animate-slide-up">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-sm">Facility Map – {areaName || 'Select an area'}</h2>
            </div>
            <div ref={mapContainerRef} className="h-[400px] w-full" />
            {/* Legend */}
            <div className="p-3 border-t border-border flex flex-wrap gap-3">
              {Object.entries(infraConfig).map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-1.5 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.mapColor }} />
                  <span className="text-muted-foreground">{cfg.label.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>          {/* Number Data */}
          <div className="space-y-6 animate-slide-up">
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift">
              <div className="flex items-center justify-between pb-3 mb-5 border-b border-border">
                <h2 className="font-semibold text-lg tracking-tight">{areaName || 'Area'} Infrastructure</h2>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground mb-5">
                Total facilities found: <span className="font-bold text-foreground">{total}</span>
              </p>

              {infra ? (
                <div className="space-y-3">
                  {Object.entries(infra).map(([key, count]) => {
                    const cfg = infraConfig[key];
                    if (!cfg) return null;
                    const pct = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:border-primary/30 hover:shadow-sm transition-all duration-200">
                        <div className={cfg.color}>{cfg.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{cfg.label}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, backgroundColor: cfg.mapColor }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(pct)}%</span>
                          </div>
                        </div>
                        <p className="text-2xl font-bold tabular-nums min-w-[3rem] text-right">{count}</p>
                      </div>
                    );
                  })}
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
