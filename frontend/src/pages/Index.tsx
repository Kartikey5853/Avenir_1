import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Tiny hook: fade-in on scroll ──────────────────────────────────────────────
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('opacity-100', 'translate-y-0'); el.classList.remove('opacity-0', 'translate-y-8'); } },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`opacity-0 translate-y-8 transition-all duration-700 ease-out ${className}`}>
      {children}
    </div>
  );
}

// ── Data-network SVG background (subtle) ─────────────────────────────────────
function NetworkBg() {
  return (
    <svg className="absolute inset-0 w-full h-full opacity-[0.07] pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="oklch(0.637 0.128 66.29)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <circle cx="20%" cy="30%" r="2" fill="oklch(0.637 0.128 66.29)" />
      <circle cx="50%" cy="20%" r="1.5" fill="oklch(0.637 0.128 66.29)" />
      <circle cx="75%" cy="45%" r="2" fill="oklch(0.637 0.128 66.29)" />
      <circle cx="35%" cy="70%" r="1.5" fill="oklch(0.637 0.128 66.29)" />
      <circle cx="85%" cy="25%" r="1.5" fill="oklch(0.637 0.128 66.29)" />
      <line x1="20%" y1="30%" x2="50%" y2="20%" stroke="oklch(0.637 0.128 66.29)" strokeWidth="0.4" />
      <line x1="50%" y1="20%" x2="75%" y2="45%" stroke="oklch(0.637 0.128 66.29)" strokeWidth="0.4" />
      <line x1="20%" y1="30%" x2="35%" y2="70%" stroke="oklch(0.637 0.128 66.29)" strokeWidth="0.4" />
      <line x1="75%" y1="45%" x2="85%" y2="25%" stroke="oklch(0.637 0.128 66.29)" strokeWidth="0.4" />
    </svg>
  );
}

// ── Mock dashboard visualization ─────────────────────────────────────────────
function MockDashboard() {
  const bars = [
    { label: 'Transport', w: '85%', color: '#3b82f6' },
    { label: 'Healthcare', w: '72%', color: '#ef4444' },
    { label: 'Education',  w: '91%', color: '#a855f7' },
    { label: 'Grocery',    w: '68%', color: '#22c55e' },
    { label: 'Lifestyle',  w: '79%', color: '#f97316' },
  ];
  const radar = [
    { label: 'Transport', angle: -90,  r: 85 },
    { label: 'Healthcare', angle: -18,  r: 72 },
    { label: 'Education',  angle: 54,  r: 91 },
    { label: 'Grocery',    angle: 126, r: 68 },
    { label: 'Lifestyle',  angle: 198, r: 79 },
  ];

  const toXY = (angle: number, pct: number, cx = 90, cy = 90, maxR = 70) => {
    const rad = (angle * Math.PI) / 180;
    const r   = (pct / 100) * maxR;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const points = radar.map((p) => toXY(p.angle, p.r));
  const polyPts = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl w-full max-w-3xl mx-auto">
      {/* top bar */}
      <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
        <div className="h-3 w-3 rounded-full bg-red-500/70" />
        <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <div className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs text-muted-foreground font-mono">avenir · area intelligence dashboard</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-primary/20 text-xs text-primary font-semibold">LIVE</div>
          <div className="text-xs text-muted-foreground">Kondapur · 17.46°N 78.35°E</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score + radar */}
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Overall Lifestyle Score</p>
            <p className="text-6xl font-black text-primary">82</p>
            <p className="text-xs text-muted-foreground mt-1">/100 · Excellent</p>
          </div>
          {/* Mini radar */}
          <svg viewBox="0 0 180 180" className="w-full max-w-[160px] mx-auto">
            {[25, 50, 75, 100].map((r) => (
              <circle key={r} cx="90" cy="90" r={(r / 100) * 70} fill="none" stroke="hsl(220 13% 28%)" strokeWidth="0.5" />
            ))}
            {radar.map((p) => {
              const outer = toXY(p.angle, 100);
              return <line key={p.label} x1="90" y1="90" x2={outer.x} y2={outer.y} stroke="hsl(220 13% 28%)" strokeWidth="0.5" />;
            })}
            <polygon points={polyPts} fill="oklch(0.637 0.128 66.29)" fillOpacity="0.25" stroke="oklch(0.637 0.128 66.29)" strokeWidth="1.5" />
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="3" fill="oklch(0.637 0.128 66.29)" />
            ))}
          </svg>
        </div>

        {/* Category bars */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category Breakdown</p>
          {bars.map((b) => (
            <div key={b.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{b.label}</span>
                <span className="font-semibold text-foreground">{parseInt(b.w)}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: b.w, backgroundColor: b.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Infra counts */}
      <div className="mt-5 pt-4 border-t border-border grid grid-cols-4 gap-3">
        {[
          { label: 'Hospitals', n: 23, c: '#ef4444' },
          { label: 'Schools',   n: 5,  c: '#a855f7' },
          { label: 'Bus Stops', n: 18, c: '#3b82f6' },
          { label: 'Parks',     n: 48, c: '#22c55e' },
        ].map((item) => (
          <div key={item.label} className="text-center p-2 rounded-lg bg-background border border-border">
            <p className="text-xl font-bold" style={{ color: item.c }}>{item.n}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-background text-foreground">

      {/* ── Sticky Nav ─────────────────────────────────────── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-card/90 backdrop-blur-md border-b border-border shadow-sm' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <span
            className="font-black text-xl tracking-tight cursor-pointer"
            style={{ color: 'oklch(0.637 0.128 66.29)' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            AVENIR
          </span>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            {['problem', 'solution', 'product', 'use-cases'].map((id) => (
              <button key={id} onClick={() => scrollTo(id)} className="hover:text-foreground capitalize transition-colors">
                {id.replace('-', ' ')}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:border-primary/60 hover:text-primary transition-all"
            >
              Login
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 text-sm font-semibold rounded-lg text-background transition-all hover:opacity-90"
              style={{ background: 'oklch(0.637 0.128 66.29)' }}
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* ── 1. HERO ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <NetworkBg />
        <div className="relative z-10 text-center max-w-4xl mx-auto px-6 py-24">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-card/60 backdrop-blur-sm text-xs text-muted-foreground mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Infrastructure Intelligence Platform · v1.0
          </div>
          <h1 className="font-black text-5xl md:text-7xl tracking-tight mb-6 leading-tight">
            <span style={{ color: 'oklch(0.637 0.128 66.29)' }}>AVENIR</span>
          </h1>
          <p className="text-xl md:text-2xl font-semibold text-foreground mb-4">
            Intelligent Area Analytics for Smarter Living Decisions
          </p>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Avenir transforms scattered infrastructure data into structured, personalized area scores —
            giving buyers, investors, and planners a single source of analytical truth.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-3.5 text-sm font-bold rounded-xl text-background shadow-lg hover:opacity-90 transition-all"
              style={{ background: 'oklch(0.637 0.128 66.29)' }}
            >
              Explore Platform →
            </button>
            <button
              onClick={() => scrollTo('product')}
              className="w-full sm:w-auto px-8 py-3.5 text-sm font-semibold rounded-xl border border-border bg-card/60 backdrop-blur-sm hover:border-primary/60 transition-all"
            >
              See the Dashboard
            </button>
          </div>
          <div className="mt-16 flex items-center justify-center gap-8 text-xs text-muted-foreground">
            {['4-Provider Data Race', 'AI-Powered Scores', 'Real-Time Infrastructure', 'Personalized Weights'].map((tag) => (
              <span key={tag} className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-muted-foreground" />{tag}
              </span>
            ))}
          </div>
        </div>
        {/* subtle bottom fade */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* ── 2. PROBLEM ──────────────────────────────────────── */}
      <section id="problem" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">The Problem</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Why current decision-making fails</h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Choosing where to live or invest is one of life's largest decisions — yet data is fragmented, unquantified, and biased.
            </p>
          </FadeIn>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Scattered Data', desc: 'Infrastructure information is siloed across multiple government portals, maps, and real-estate platforms with no unified view.', icon: '⛓️' },
              { title: 'No Unified Score', desc: 'There is no standardised metric that combines healthcare, transport, education, and lifestyle into one comparable index.', icon: '📊' },
              { title: 'No Personalization', desc: 'Generic scores ignore individual priorities. Families, investors, and senior citizens have entirely different infrastructure needs.', icon: '🎯' },
              { title: 'Emotion-Driven', desc: 'Most location decisions are driven by proximity to a known landmark or word-of-mouth — not objective data analysis.', icon: '🧠' },
            ].map((c) => (
              <FadeIn key={c.title}>
                <div className="bg-card border border-border rounded-xl p-6 h-full hover:border-primary/40 transition-all hover:shadow-md">
                  <div className="text-3xl mb-4">{c.icon}</div>
                  <h3 className="font-bold text-base mb-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{c.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. SOLUTION ─────────────────────────────────────── */}
      <section id="solution" className="py-24 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Our Solution</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">A structured analytical methodology</h2>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
            {[
              { step: '01', title: 'Infrastructure Analytics', desc: 'Live data from 4 competing API providers — Geoapify Batch, Mapbox, LocationIQ, Overpass. Fastest response wins.', accent: 'border-l-primary' },
              { step: '02', title: 'Weighted Scoring', desc: 'Each category (healthcare, transport, education, lifestyle, grocery) gets profile-adjusted weights per user.', accent: 'border-l-blue-500' },
              { step: '03', title: 'Score Computation', desc: 'Normalised counts feed the scoring engine that produces a 0–100 composite index alongside category breakdowns.', accent: 'border-l-purple-500' },
              { step: '04', title: 'Intelligence Dashboard', desc: 'Visual area comparison, AI-generated recommendations, and market insights — all in one place.', accent: 'border-l-green-500' },
            ].map((s, i) => (
              <FadeIn key={s.step} className="flex">
                <div className={`bg-card border border-border border-l-4 ${s.accent} p-6 flex-1 relative ${i < 3 ? 'md:border-r-0 md:rounded-r-none' : ''} ${i > 0 ? 'md:rounded-l-none' : ''} rounded-xl`}>
                  {i < 3 && <div className="hidden md:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 text-muted-foreground">›</div>}
                  <div className="text-xs font-mono text-primary mb-3">{s.step}</div>
                  <h3 className="font-bold text-base mb-2">{s.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. PRODUCT VIS ──────────────────────────────────── */}
      <section id="product" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Product</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Real-Time Area Intelligence</h2>
            <p className="text-muted-foreground mt-4 max-w-xl mx-auto">
              Every score is computed live — no cached stale data. Select any area or pin a custom location.
            </p>
          </FadeIn>
          <FadeIn>
            <MockDashboard />
          </FadeIn>
        </div>
      </section>

      {/* ── 5. HOW IT WORKS ─────────────────────────────────── */}
      <section className="py-24 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Architecture</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How It Works</h2>
          </FadeIn>
          <FadeIn>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-0 overflow-x-auto">
              {[
                { label: 'User', sub: 'Selects area or pins custom lat/lon' },
                { label: 'Data Layer', sub: '4-provider batch race (Geoapify first)' },
                { label: 'Normalizer', sub: 'Counts → 0-100 category scores' },
                { label: 'Scoring Engine', sub: 'Profile-weighted composite index' },
                { label: 'Dashboard', sub: 'Charts · AI rec · Compare · Market data' },
              ].map((node, i) => (
                <div key={node.label} className="flex items-center flex-1 min-w-0">
                  <div className="flex-1 flex flex-col items-center text-center min-w-0 px-2">
                    <div className="w-12 h-12 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center text-primary font-bold text-lg mb-3 shrink-0">
                      {i + 1}
                    </div>
                    <p className="font-bold text-sm whitespace-nowrap">{node.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-tight max-w-[110px]">{node.sub}</p>
                  </div>
                  {i < 4 && (
                    <div className="hidden md:flex items-center shrink-0 text-primary/40 text-xl px-2">→</div>
                  )}
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── 6. USE CASES ────────────────────────────────────── */}
      <section id="use-cases" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Use Cases</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built for decision-makers</h2>
          </FadeIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                audience: 'Home Buyers',
                icon: '🏠',
                items: [
                  'Compare shortlisted neighbourhoods side-by-side',
                  'Score areas by school density for family suitability',
                  'Evaluate transport access vs. commute distance',
                  'Quantify safety infrastructure before committing',
                ],
              },
              {
                audience: 'Investors',
                icon: '📈',
                items: [
                  'Benchmark infrastructure quality across micro-markets',
                  'Correlate area scores with rental yield data',
                  'Identify undervalued areas with high infrastructure potential',
                  'Overlay future development zone data',
                ],
              },
              {
                audience: 'Municipal Planners',
                icon: '🏛️',
                items: [
                  'Identify infrastructure gaps at the ward level',
                  'Track improvement progress with score trends over time',
                  'Prioritise development spend by category score deficit',
                  'Communicate progress transparently to stakeholders',
                ],
              },
            ].map((uc) => (
              <FadeIn key={uc.audience}>
                <div className="bg-card border border-border rounded-xl p-7 h-full hover:border-primary/40 transition-all hover:shadow-md">
                  <div className="text-4xl mb-4">{uc.icon}</div>
                  <h3 className="font-bold text-lg mb-4">{uc.audience}</h3>
                  <ul className="space-y-2.5">
                    {uc.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <span className="text-primary mt-0.5 shrink-0">▸</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 7. FUTURE VISION ────────────────────────────────── */}
      <section className="py-24 px-6 bg-card/30">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-3">Roadmap</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Where Avenir is headed</h2>
          </FadeIn>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: 'Real-Time Pricing', desc: 'Live rental and property price feeds integrated directly into area score cards for instant ROI analysis.', tag: 'Q2 2026', icon: '💹' },
              { title: 'Predictive Forecasting', desc: 'ML models trained on historical infrastructure data to forecast area score trajectories 12–24 months ahead.', tag: 'Q3 2026', icon: '🔮' },
              { title: 'Safety Intelligence', desc: 'Crime index integration, incident heatmaps, and night-time visibility scoring added to the safety dimension.', tag: 'Q4 2026', icon: '🛡️' },
              { title: 'AI Planning Assistant', desc: 'Conversational AI that answers "Where should I live given X budget and Y priorities?" with ranked area recommendations.', tag: '2027', icon: '🤖' },
            ].map((v) => (
              <FadeIn key={v.title}>
                <div className="bg-card border border-border rounded-xl p-6 h-full hover:border-primary/40 transition-all hover:shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-3xl">{v.icon}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-primary/30 text-primary">{v.tag}</span>
                  </div>
                  <h3 className="font-bold text-base mb-2">{v.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. CTA ──────────────────────────────────────────── */}
      <section className="py-32 px-6 relative overflow-hidden">
        <NetworkBg />
        <FadeIn className="relative z-10 max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-6">
            Make Smarter Living Decisions<br />
            <span style={{ color: 'oklch(0.637 0.128 66.29)' }}>with AVENIR</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-10 max-w-xl mx-auto">
            Access live infrastructure scores, AI recommendations, and comparative analytics for any area.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-10 py-4 text-base font-bold rounded-xl text-background shadow-2xl hover:opacity-90 transition-all"
            style={{ background: 'oklch(0.637 0.128 66.29)' }}
          >
            Start Exploring →
          </button>
        </FadeIn>
      </section>

      {/* ── 9. FOOTER ───────────────────────────────────────── */}
      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <span className="font-black text-lg" style={{ color: 'oklch(0.637 0.128 66.29)' }}>AVENIR</span>
            <p className="text-xs text-muted-foreground mt-1">Intelligent Area Analytics · Hyderabad, India</p>
          </div>
          <div className="flex items-center gap-8 text-sm text-muted-foreground">
            <button className="hover:text-foreground transition-colors">About</button>
            <button className="hover:text-foreground transition-colors">Contact</button>
            <button className="hover:text-foreground transition-colors">LinkedIn</button>
            <button className="hover:text-foreground transition-colors">Privacy Policy</button>
          </div>
          <p className="text-xs text-muted-foreground">© 2026 Avenir. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
