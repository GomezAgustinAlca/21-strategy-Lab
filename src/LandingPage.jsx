import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, TrendingUp, ChevronRight, Zap,
  Target, Layers, BarChart2, RefreshCw,
} from 'lucide-react';
import './landing.css';

// ─── Scroll-triggered fade ───────────────────────────────────────────────────
function FadeIn({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVis(true); },
      { threshold: 0.08 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`lp-fade ${vis ? 'lp-fade--in' : ''} ${className}`}
      style={{ transitionDelay: vis ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

// ─── Hero animated count visualization ───────────────────────────────────────
const DEMO_SEQ = [
  { card: '5',  delta:  1 }, { card: 'K',  delta: -1 }, { card: '3',  delta:  1 },
  { card: 'A',  delta: -1 }, { card: '4',  delta:  1 }, { card: '7',  delta:  0 },
  { card: '2',  delta:  1 }, { card: '10', delta: -1 }, { card: '6',  delta:  1 },
  { card: 'Q',  delta: -1 }, { card: '5',  delta:  1 }, { card: 'J',  delta: -1 },
  { card: '3',  delta:  1 }, { card: '8',  delta:  0 }, { card: '2',  delta:  1 },
  { card: 'K',  delta: -1 }, { card: '4',  delta:  1 }, { card: '9',  delta:  0 },
];

function HeroViz() {
  const [idx, setIdx]     = useState(0);
  const [rc, setRc]       = useState(0);
  const [flash, setFlash] = useState(null);
  const [bars, setBars]   = useState([]);

  useEffect(() => {
    const t = setInterval(() => {
      setIdx(i => {
        const next = (i + 1) % DEMO_SEQ.length;
        const { delta } = DEMO_SEQ[next];
        setRc(prev => prev + delta);
        setFlash(delta ===  1 ? 'pos' : delta === -1 ? 'neg' : 'zero');
        setBars(b => [...b.slice(-5), delta]);
        setTimeout(() => setFlash(null), 260);
        return next;
      });
    }, 920);
    return () => clearInterval(t);
  }, []);

  const cur    = DEMO_SEQ[idx];
  const tc     = (rc / 4.8).toFixed(1);
  const tcNum  = parseFloat(tc);
  const rcCls  = rc > 0 ? 'pos' : rc < 0 ? 'neg' : 'zero';
  const tcCls  = tcNum > 0 ? 'pos' : tcNum < 0 ? 'neg' : 'zero';
  const curCls = cur.delta === 1 ? 'pos' : cur.delta === -1 ? 'neg' : 'zero';
  const shoeP  = Math.min(92, 10 + Math.round((idx / DEMO_SEQ.length) * 55));

  return (
    <div className="lp-viz">
      <div className="lp-viz__head">
        <div className="lp-viz__badge">
          <span className="lp-viz__dot" />
          ACTIVE SESSION
        </div>
        <span className="lp-viz__mode">RHYTHM DRILL</span>
      </div>

      <div className="lp-viz__counts">
        <div className={`lp-viz__count ${flash ? `lp-viz__count--flash-${flash}` : ''}`}>
          <div className="lp-viz__count-label">RC</div>
          <div className={`lp-viz__count-num lp-viz__count-num--${rcCls}`}>
            {rc > 0 ? `+${rc}` : rc}
          </div>
        </div>
        <div className="lp-viz__count-sep" />
        <div className="lp-viz__count">
          <div className="lp-viz__count-label">TC</div>
          <div className={`lp-viz__count-num lp-viz__count-num--${tcCls} lp-viz__count-num--sm`}>
            {tcNum > 0 ? `+${tc}` : tc}
          </div>
        </div>
      </div>

      <div className="lp-viz__tempo">
        <div className="lp-viz__tempo-label">TEMPO</div>
        <div className="lp-viz__tempo-bars">
          {bars.map((d, i) => (
            <div
              key={i}
              className={`lp-viz__tempo-bar lp-viz__tempo-bar--${d === 1 ? 'pos' : d === -1 ? 'neg' : 'zero'}`}
              style={{ opacity: 0.25 + (i / bars.length) * 0.75 }}
            />
          ))}
        </div>
      </div>

      <div className="lp-viz__last">
        <div className="lp-viz__last-label">LAST CARD</div>
        <div className="lp-viz__last-row">
          <div className={`lp-viz__last-card lp-viz__last-card--${curCls}`}>
            {cur.card}
          </div>
          <div className={`lp-viz__last-delta lp-viz__last-delta--${curCls}`}>
            {cur.delta > 0 ? '+1' : cur.delta < 0 ? '−1' : '0'}
          </div>
        </div>
      </div>

      <div className="lp-viz__shoe">
        <div className="lp-viz__shoe-label">SHOE PROGRESS</div>
        <div className="lp-viz__shoe-track">
          <div className="lp-viz__shoe-fill" style={{ width: `${shoeP}%` }} />
        </div>
        <div className="lp-viz__shoe-pct">{shoeP}% dealt</div>
      </div>
    </div>
  );
}

// ─── Training mode card ───────────────────────────────────────────────────────
function TrainingCard({ icon: Icon, title, sub, description, accent, delay = 0 }) {
  return (
    <FadeIn delay={delay}>
      <div className={`lp-tcard lp-tcard--${accent}`}>
        <div className="lp-tcard__icon">
          <Icon size={18} />
        </div>
        <div className="lp-tcard__label">{sub}</div>
        <div className="lp-tcard__title">{title}</div>
        <div className="lp-tcard__desc">{description}</div>
      </div>
    </FadeIn>
  );
}

// ─── Insight row ──────────────────────────────────────────────────────────────
function InsightRow({ icon: Icon, title, description, delay = 0 }) {
  return (
    <FadeIn delay={delay}>
      <div className="lp-insight">
        <div className="lp-insight__icon"><Icon size={15} /></div>
        <div className="lp-insight__body">
          <div className="lp-insight__title">{title}</div>
          <div className="lp-insight__desc">{description}</div>
        </div>
      </div>
    </FadeIn>
  );
}

// ─── Analytics visualization ──────────────────────────────────────────────────
const CHART_BARS = [68, 74, 71, 83, 78, 88, 81, 76, 91, 86, 94, 89];

function AnalyticsViz() {
  return (
    <div className="lp-aviz">
      <div className="lp-aviz__header">
        <span className="lp-aviz__title">ACCURACY TREND</span>
        <span className="lp-aviz__delta lp-aviz__delta--pos">+14% over 3 weeks</span>
      </div>
      <div className="lp-aviz__chart">
        {CHART_BARS.map((h, i) => (
          <div key={i} className="lp-aviz__bar" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="lp-aviz__metrics">
        <div className="lp-aviz__metric">
          <span className="lp-aviz__m-label">CONSISTENCY</span>
          <span className="lp-aviz__m-val lp-aviz__m-val--pos">94%</span>
        </div>
        <div className="lp-aviz__metric">
          <span className="lp-aviz__m-label">DRIFT SCORE</span>
          <span className="lp-aviz__m-val">±0.8</span>
        </div>
        <div className="lp-aviz__metric">
          <span className="lp-aviz__m-label">SESSIONS</span>
          <span className="lp-aviz__m-val">24</span>
        </div>
      </div>
    </div>
  );
}

// ─── Progression step ─────────────────────────────────────────────────────────
function ProgressionStep({ number, title, description, delay = 0 }) {
  return (
    <FadeIn delay={delay}>
      <div className="lp-pstep">
        <div className="lp-pstep__num">{number}</div>
        <div className="lp-pstep__title">{title}</div>
        <div className="lp-pstep__desc">{description}</div>
      </div>
    </FadeIn>
  );
}

// ─── Premium feature ──────────────────────────────────────────────────────────
function PremiumFeature({ title, description }) {
  return (
    <div className="lp-pf">
      <ChevronRight size={13} className="lp-pf__icon" />
      <div>
        <div className="lp-pf__title">{title}</div>
        <div className="lp-pf__desc">{description}</div>
      </div>
    </div>
  );
}

// ─── Eyebrow label ────────────────────────────────────────────────────────────
function Eyebrow({ color = 'blue', children }) {
  return (
    <div className="lp-eyebrow">
      <span className={`lp-eyebrow__dot lp-eyebrow__dot--${color}`} />
      {children}
    </div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────
export default function LandingPage({ onEnter }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(t);
  }, []);

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className={`lp-root ${ready ? 'lp-root--ready' : ''}`}>

      {/* ── NAV ─────────────────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="lp-nav__brand">
          <div className="lp-nav__mark">SL</div>
          <div className="lp-nav__brand-text">
            <span className="lp-nav__name">Strategy Lab</span>
            <span className="lp-nav__tag">COGNITIVE TRAINING</span>
          </div>
        </div>
        <button className="lp-nav__btn" onClick={onEnter}>
          Open App <ChevronRight size={13} />
        </button>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero__content">
          <Eyebrow color="blue">COGNITIVE PERFORMANCE SYSTEM</Eyebrow>
          <h1 className="lp-hero__headline">
            Train Real-Time<br />Cognitive Precision
          </h1>
          <p className="lp-hero__sub">
            Adaptive counting drills built for rhythm, focus, and performance under pressure.
          </p>
          <p className="lp-hero__body">
            Strategy Lab develops the mental discipline behind real-time counting —
            through rhythm-based input drills, dynamic tempo training, and performance
            analytics that track exactly where precision breaks down.
          </p>
          <div className="lp-hero__actions">
            <button className="lp-btn lp-btn--primary" onClick={onEnter}>
              Start Training <ChevronRight size={15} />
            </button>
            <button className="lp-btn lp-btn--ghost" onClick={() => scrollTo('lp-training')}>
              View Training System
            </button>
          </div>
        </div>

        <div className="lp-hero__viz">
          <HeroViz />
        </div>
      </section>

      {/* ── TRAINING MODES ──────────────────────────────────────────────────── */}
      <section className="lp-section" id="lp-training">
        <div className="lp-section__head">
          <FadeIn>
            <Eyebrow color="blue">TRAINING SYSTEM</Eyebrow>
            <h2 className="lp-section__title">
              Built Around Real Training Principles
            </h2>
            <p className="lp-section__sub">
              Four distinct modes targeting different dimensions of counting performance.
            </p>
          </FadeIn>
        </div>
        <div className="lp-tgrid">
          <TrainingCard
            icon={Target}
            title="Standard Mode"
            sub="Foundation"
            accent="blue"
            delay={0}
            description="Controlled pacing. Track every card at a consistent tempo to build baseline accuracy and mechanical precision."
          />
          <TrainingCard
            icon={Activity}
            title="Rhythm Shift"
            sub="Adaptability"
            accent="green"
            delay={80}
            description="Dynamic tempo variation mid-session. Tests whether accuracy holds when pace changes without warning."
          />
          <TrainingCard
            icon={Layers}
            title="Assist Levels"
            sub="Progressive"
            accent="amber"
            delay={160}
            description="Start with full guidance, reduce assistance systematically as accuracy improves. Structured confidence building."
          />
          <TrainingCard
            icon={Zap}
            title="Realistic Mode"
            sub="Pressure"
            accent="red"
            delay={240}
            description="Real counting conditions. Limited time windows, no safety net — pressure that mirrors actual performance demands."
          />
        </div>
      </section>

      {/* ── ANALYTICS ───────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--alt">
        <div className="lp-analytics-layout">
          <div className="lp-analytics-left">
            <FadeIn>
              <Eyebrow color="green">PERFORMANCE ANALYTICS</Eyebrow>
              <h2 className="lp-section__title">
                Performance You Can Actually See
              </h2>
              <p className="lp-section__sub">
                Track what matters: where you drift, where you stabilize, and where your tempo breaks.
              </p>
            </FadeIn>
            <div className="lp-insights">
              <InsightRow
                icon={TrendingUp}
                title="Detect counting drift under pressure"
                description="Maps running count deviation over session length to identify exactly where accuracy degrades."
                delay={0}
              />
              <InsightRow
                icon={Activity}
                title="Track consistency across tempo changes"
                description="Measures accuracy stability specifically during rhythm shifts — the hardest cognitive test."
                delay={80}
              />
              <InsightRow
                icon={RefreshCw}
                title="Identify weak recovery patterns"
                description="Flags sequences where accuracy fails to recover after errors — the real performance limiter."
                delay={160}
              />
              <InsightRow
                icon={BarChart2}
                title="Session-over-session progression"
                description="Long-term trend tracking shows whether training is building durable skill or just familiarity."
                delay={240}
              />
            </div>
          </div>
          <FadeIn className="lp-analytics-right" delay={100}>
            <AnalyticsViz />
          </FadeIn>
        </div>
      </section>

      {/* ── PROGRESSION ─────────────────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section__head">
          <FadeIn>
            <Eyebrow color="amber">PROGRESSION</Eyebrow>
            <h2 className="lp-section__title">
              Structured Improvement.<br />Not Random Practice.
            </h2>
            <p className="lp-section__sub">
              The system adapts to where you are, recommends what to train next,
              and tracks whether it's working.
            </p>
          </FadeIn>
        </div>
        <div className="lp-pgrid">
          <ProgressionStep
            number="01"
            title="Baseline Assessment"
            description="Run a standard session to establish your accuracy baseline and preferred tempo range before anything else."
            delay={0}
          />
          <ProgressionStep
            number="02"
            title="Targeted Drill Selection"
            description="Analytics surface your specific weak points — drift patterns, recovery gaps, and tempo break zones."
            delay={80}
          />
          <ProgressionStep
            number="03"
            title="Adaptive Assist Training"
            description="Work through assist levels in your problem zones. Support reduces automatically as accuracy improves."
            delay={160}
          />
          <ProgressionStep
            number="04"
            title="Pressure Confirmation"
            description="Realistic mode confirms the skill is durable under real counting conditions, not just controlled practice."
            delay={240}
          />
        </div>
      </section>

      {/* ── PREMIUM ─────────────────────────────────────────────────────────── */}
      <section className="lp-section lp-section--premium">
        <div className="lp-premium-layout">
          <FadeIn className="lp-premium-left">
            <Eyebrow color="blue">STRATEGY LAB PRO</Eyebrow>
            <h2 className="lp-premium__title">
              Advanced Training.<br />Complete Performance.
            </h2>
            <p className="lp-premium__sub">
              Deeper analytics, advanced modes, and structured programs
              for practitioners who need more than the fundamentals.
            </p>
            <button className="lp-btn lp-btn--primary" onClick={onEnter}>
              Start Training Free <ChevronRight size={15} />
            </button>
          </FadeIn>

          <FadeIn className="lp-premium-right" delay={80}>
            <div className="lp-premium-features">
              <PremiumFeature
                title="Complete Performance History"
                description="Every session tracked and compared — spot long-term drift and genuine progression."
              />
              <PremiumFeature
                title="Advanced Drift Analysis"
                description="Session-level comparison showing exactly when and how accuracy degraded."
              />
              <PremiumFeature
                title="Configurable Realistic Mode"
                description="Custom pressure levels, window sizes, and difficulty curves for advanced practitioners."
              />
              <PremiumFeature
                title="Stealth Interface"
                description="Minimal, discreet training mode designed for real-environment practice."
              />
              <PremiumFeature
                title="Structured Training Programs"
                description="Multi-week progressive programs built around measured skill acquisition."
              />
              <PremiumFeature
                title="Full Data Export"
                description="Export complete performance data for external analysis and long-term tracking."
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer__brand">
          <div className="lp-footer__mark">SL</div>
          <div>
            <div className="lp-footer__name">Strategy Lab</div>
            <div className="lp-footer__sub">Cognitive Performance Training</div>
          </div>
        </div>
        <div className="lp-footer__copy">© 2025 Strategy Lab — Built for precision training.</div>
      </footer>

    </div>
  );
}
