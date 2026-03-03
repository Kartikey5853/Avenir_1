import { useEffect, useState } from 'react';
import {
  Home, TrendingUp, IndianRupee, Loader2, Building2, GitCompareArrows,
  BarChart3, Ruler, Armchair, X
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import AppLayout from '@/components/AppLayout';
import ScoreCard from '@/components/ScoreCard';
import { getMarketAreas, getMarketListings, getMarketSummary, compareMarketAreas } from '@/services/api';

interface Listing {
  area: string;
  project_name: string;
  rent: number;
  sqft: number;
  rent_per_sqft: number;
  furnishing: string;
}

interface Summary {
  area: string;
  count: number;
  avg_rent: number;
  avg_sqft: number;
  avg_rent_per_sqft: number;
  min_rent: number;
  max_rent: number;
  furnished_count: number;
  unfurnished_count: number;
}

interface CompareData {
  area1: Summary & { listings: Listing[] };
  area2: Summary & { listings: Listing[] };
}

const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const MarketInsights = () => {
  const [marketAreas, setMarketAreas] = useState<string[]>([]);
  const [selectedArea, setSelectedArea] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  // Compare
  const [compareArea, setCompareArea] = useState('');
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Load area names
  useEffect(() => {
    getMarketAreas()
      .then((res) => {
        const areas = res.data.areas || [];
        setMarketAreas(areas);
        if (areas.length > 0) setSelectedArea(areas[0]);
      })
      .catch(() => {});
  }, []);

  // Load data when area changes
  useEffect(() => {
    if (!selectedArea) return;
    setLoading(true);
    setShowCompare(false);
    setCompareData(null);

    Promise.all([
      getMarketListings(selectedArea),
      getMarketSummary(selectedArea),
    ])
      .then(([listRes, sumRes]) => {
        setListings(listRes.data.listings || []);
        setSummary(sumRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedArea]);

  // Compare handler
  const handleCompare = () => {
    if (!selectedArea || !compareArea || selectedArea === compareArea) return;
    setCompareLoading(true);
    compareMarketAreas(selectedArea, compareArea)
      .then((res) => {
        setCompareData(res.data);
        setShowCompare(true);
      })
      .catch(() => {})
      .finally(() => setCompareLoading(false));
  };

  const compareChartData = compareData
    ? [
        { metric: 'Avg Rent', [compareData.area1.area]: compareData.area1.avg_rent, [compareData.area2.area]: compareData.area2.avg_rent },
        { metric: 'Avg Sqft', [compareData.area1.area]: compareData.area1.avg_sqft, [compareData.area2.area]: compareData.area2.avg_sqft },
        { metric: '₹/Sqft', [compareData.area1.area]: compareData.area1.avg_rent_per_sqft, [compareData.area2.area]: compareData.area2.avg_rent_per_sqft },
      ]
    : [];

  return (
    <AppLayout>
      <div className="px-4 md:px-8 py-6 md:py-10 w-full max-w-full space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slide-up">
          <div>
            <h1 className="font-bold tracking-tight">Market Insights</h1>
            <p className="text-muted-foreground mt-2">2BHK rental data across Hyderabad localities</p>
          </div>
          <div className="w-full sm:w-64 glow-on-active rounded-lg">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger>
                <SelectValue placeholder="Select locality" />
              </SelectTrigger>
              <SelectContent>
                {marketAreas.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : summary && summary.count > 0 ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 animate-slide-up">
              <ScoreCard
                title="Avg Rent"
                value={fmt(summary.avg_rent)}
                subtitle={`${summary.count} listings`}
                icon={<IndianRupee className="h-5 w-5" />}
              />
              <ScoreCard
                title="Avg Area"
                value={`${summary.avg_sqft} sqft`}
                subtitle="Average floor area"
                icon={<Ruler className="h-5 w-5" />}
              />
              <ScoreCard
                title="₹/Sqft"
                value={`₹${summary.avg_rent_per_sqft}`}
                subtitle="Average rent per sqft"
                icon={<BarChart3 className="h-5 w-5" />}
                accent
              />
              <ScoreCard
                title="Rent Range"
                value={`${fmt(summary.min_rent)} – ${fmt(summary.max_rent)}`}
                subtitle={`${summary.furnished_count} furnished`}
                icon={<Home className="h-5 w-5" />}
              />
            </div>

            {/* Listings Table */}
            <div className="bg-card rounded-xl border border-border shadow-card hover-lift animate-slide-up">
              <div className="p-5 border-b border-border">
                <h2 className="font-semibold text-lg tracking-tight">Listings in {selectedArea}</h2>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Rent</TableHead>
                      <TableHead className="text-right">Area (sqft)</TableHead>
                      <TableHead className="text-right">₹/Sqft</TableHead>
                      <TableHead>Furnishing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listings.map((l, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{l.project_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(l.rent)}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.sqft.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">₹{l.rent_per_sqft}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                            l.furnishing.toLowerCase() === 'furnished'
                              ? 'bg-green-500/10 text-green-500'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            <Armchair className="h-3 w-3" />
                            {l.furnishing}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Compare Section */}
            <div className="bg-card rounded-xl border border-border p-6 shadow-card hover-lift animate-slide-up">
              <h2 className="font-semibold text-lg tracking-tight pb-3 mb-5 border-b border-border flex items-center gap-2">
                <GitCompareArrows className="h-4 w-4 text-primary" /> Price Comparison
              </h2>
              <div className="flex flex-col sm:flex-row items-end gap-3">
                <div className="flex-1 w-full">
                  <label className="text-xs text-muted-foreground mb-1 block">Compare {selectedArea} with:</label>
                  <div className="glow-on-active rounded-lg">
                    <Select value={compareArea} onValueChange={setCompareArea}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select area to compare" />
                      </SelectTrigger>
                      <SelectContent>
                        {marketAreas.filter((a) => a !== selectedArea).map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  onClick={handleCompare}
                  disabled={!compareArea || compareLoading}
                  className="gradient-warm text-primary-foreground font-semibold hover-lift"
                >
                  {compareLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitCompareArrows className="h-4 w-4 mr-2" />}
                  Compare
                </Button>
              </div>

              {showCompare && compareData && (
                <div className="mt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {compareData.area1.area} vs {compareData.area2.area}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowCompare(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Comparison Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Avg Rent', v1: fmt(compareData.area1.avg_rent), v2: fmt(compareData.area2.avg_rent), winner: compareData.area1.avg_rent < compareData.area2.avg_rent ? 1 : 2 },
                      { label: 'Avg Area', v1: `${compareData.area1.avg_sqft} sqft`, v2: `${compareData.area2.avg_sqft} sqft`, winner: compareData.area1.avg_sqft > compareData.area2.avg_sqft ? 1 : 2 },
                      { label: '₹/Sqft', v1: `₹${compareData.area1.avg_rent_per_sqft}`, v2: `₹${compareData.area2.avg_rent_per_sqft}`, winner: compareData.area1.avg_rent_per_sqft < compareData.area2.avg_rent_per_sqft ? 1 : 2 },
                    ].map((item) => (
                      <div key={item.label} className="p-3 rounded-lg border border-border bg-background hover:border-primary/30 hover:shadow-sm transition-all duration-200">
                        <p className="text-xs text-muted-foreground mb-2">{item.label}</p>
                        <div className="flex items-center justify-between">
                          <div className={item.winner === 1 ? 'text-green-500 font-bold' : ''}>
                            <p className="text-xs text-muted-foreground">{compareData.area1.area}</p>
                            <p className="text-sm font-semibold">{item.v1}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">vs</span>
                          <div className={`text-right ${item.winner === 2 ? 'text-green-500 font-bold' : ''}`}>
                            <p className="text-xs text-muted-foreground">{compareData.area2.area}</p>
                            <p className="text-sm font-semibold">{item.v2}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comparison Chart */}
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={compareChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                        <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={compareData.area1.area} fill="hsl(31,100%,71%)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey={compareData.area2.area} fill="hsl(210,100%,56%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <p>No listings found for this area.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default MarketInsights;
