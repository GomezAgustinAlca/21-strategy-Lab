import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, ArrowUp, ArrowDown, ArrowRight,
  ArrowUpRight, ArrowDownRight, Minus, RotateCcw, RefreshCw,
  Check, Activity, Zap, AlertCircle, CircleDot, ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Hi-Lo system
// ---------------------------------------------------------------------------
const CARD_VALUES = [
  { v: '2', delta: 1 }, { v: '3', delta: 1 }, { v: '4', delta: 1 }, { v: '5', delta: 1 }, { v: '6', delta: 1 },
  { v: '7', delta: 0 }, { v: '8', delta: 0 }, { v: '9', delta: 0 },
  { v: '10', delta: -1 }, { v: 'J', delta: -1 }, { v: 'Q', delta: -1 }, { v: 'K', delta: -1 }, { v: 'A', delta: -1 },
];
const DECK_OPTIONS = [1, 2, 6, 8];
const STORAGE_KEY = 'strategy-lab-session-v4';
const TRAINING_STORAGE_KEY = 'strategy-lab-training-v1';
const DRILL_HISTORY_KEY    = 'strategy-lab-drill-history-v1';

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
  return _audioCtx;
}
function playSound(type) {
  try {
    const ac = getAudioCtx();
    const now = ac.currentTime;
    const g = ac.createGain();
    g.connect(ac.destination);
    const o = ac.createOscillator();
    o.connect(g);
    if (type === 'pos') {
      o.type = 'sine';
      o.frequency.setValueAtTime(880, now);
      o.frequency.exponentialRampToValueAtTime(1100, now + 0.05);
      g.gain.setValueAtTime(0.055, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      o.start(now); o.stop(now + 0.11);
    } else if (type === 'neg') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(440, now);
      o.frequency.exponentialRampToValueAtTime(330, now + 0.1);
      g.gain.setValueAtTime(0.045, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      o.start(now); o.stop(now + 0.14);
    } else if (type === 'mid') {
      o.type = 'sine';
      o.frequency.setValueAtTime(660, now);
      g.gain.setValueAtTime(0.035, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      o.start(now); o.stop(now + 0.09);
    } else if (type === 'undo') {
      o.type = 'sine';
      o.frequency.setValueAtTime(660, now);
      o.frequency.exponentialRampToValueAtTime(440, now + 0.15);
      g.gain.setValueAtTime(0.045, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      o.start(now); o.stop(now + 0.19);
    } else if (type === 'reset') {
      o.type = 'sine';
      o.frequency.setValueAtTime(550, now);
      o.frequency.exponentialRampToValueAtTime(275, now + 0.2);
      g.gain.setValueAtTime(0.05, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      o.start(now); o.stop(now + 0.25);
    } else if (type === 'tick') {
      o.type = 'sine';
      o.frequency.setValueAtTime(1400, now);
      o.frequency.exponentialRampToValueAtTime(900, now + 0.03);
      g.gain.setValueAtTime(0.018, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      o.start(now); o.stop(now + 0.055);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Recommendation tiers
// ---------------------------------------------------------------------------
const RECOS = [
  { test: tc => tc >= 4,  tier: 'strong',    Icon: TrendingUp,      label: 'Strong Advantage Window',   text: 'Shoe composition currently favors high-efficiency decision-making.', tone: 'green-strong' },
  { test: tc => tc >= 2,  tier: 'favorable', Icon: ArrowUpRight,    label: 'Favorable Distribution',    text: 'Conditions are above baseline. Maintain disciplined strategy.',       tone: 'green-soft' },
  { test: tc => tc >= 0,  tier: 'neutral',   Icon: Minus,           label: 'Neutral Probability State', text: 'No significant composition edge detected.',                          tone: 'neutral' },
  { test: tc => tc >= -2, tier: 'low-eff',   Icon: ArrowDownRight,  label: 'Low Efficiency Shoe',       text: 'Current distribution is below baseline efficiency.',                 tone: 'amber' },
  { test: () => true,     tier: 'unfav',     Icon: TrendingDown,    label: 'Unfavorable Composition',   text: 'Shoe composition is strongly unfavorable.',                          tone: 'red' },
];
const getRecommendation = (tc) => RECOS.find(r => r.test(tc));

const getMood = (tc) => {
  if (tc >= 3)  return 'mood-strong';
  if (tc >= 1)  return 'mood-favor';
  if (tc >= -1) return 'mood-neutral';
  if (tc >= -3) return 'mood-low';
  return 'mood-unfav';
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (e) { return null; }
};
const saveState = (s) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {} };

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------
function Panel({ children, accent, className = '', tone = 'default', style }) {
  return (
    <div className={`panel panel--${tone} ${accent ? 'panel--accent' : ''} ${className}`} style={style}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero count
// ---------------------------------------------------------------------------
function HeroCount({ runningCount, trueCount, decksRemaining, totalCards, prevRC }) {
  const [pulse, setPulse] = useState(false);
  const [delta, setDelta] = useState(0);

  useEffect(() => {
    if (prevRC == null || prevRC === runningCount) return;
    setDelta(runningCount - prevRC);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 700);
    return () => clearTimeout(t);
  }, [runningCount, prevRC]);

  const tone = runningCount > 0 ? 'pos' : runningCount < 0 ? 'neg' : 'zero';
  const TrendIcon = runningCount > 0 ? ArrowUp : runningCount < 0 ? ArrowDown : Minus;
  const trendLabel = runningCount > 0 ? 'Player edge' : runningCount < 0 ? 'House edge' : 'Balanced';

  const totalShoe = decksRemaining > 0 ? (totalCards + decksRemaining * 52) : 1;
  const pen = Math.min(100, (totalCards / totalShoe) * 100);

  return (
    <div className={`hero hero--${tone} ${pulse ? `hero--pulse hero--pulse-${tone}` : ''}`}>
      <div className="hero__bg" aria-hidden />
      <div className="hero__grid" aria-hidden />

      <div className="hero__col hero__col--rc">
        <div className="hero__eyebrow">
          <span className="hero__eyebrow-dot" />
          Running Count
          <span className={`hero__trend hero__trend--${tone}`}>
            <TrendIcon size={10} />
            <span className="hero__trend-lbl">{trendLabel}</span>
          </span>
        </div>
        <div className="hero__num-wrap">
          <div className={`hero__num hero__num--${tone}`} key={runningCount}>
            <span className="hero__sign">{runningCount > 0 ? '+' : runningCount < 0 ? '-' : ''}</span>
            <span className="hero__digits">{Math.abs(runningCount)}</span>
          </div>
          {pulse && delta !== 0 && (
            <div className={`hero__delta hero__delta--${delta > 0 ? 'pos' : 'neg'}`} key={`d${runningCount}`}>
              {delta > 0 ? '+' : '-'}{Math.abs(delta)}
            </div>
          )}
        </div>
      </div>

      <div className="hero__vsep" aria-hidden />

      <div className="hero__col hero__col--tc">
        <HeroMetric
          label="True Count"
          big
          value={trueCount.toFixed(2)}
          accent={trueCount >= 2 ? 'green' : trueCount <= -2 ? 'red' : 'gold'}
          sub={trueCount >= 0 ? 'above baseline' : 'below baseline'}
        />
      </div>

      <div className="hero__vsep" aria-hidden />

      <div className="hero__col hero__col--sub">
        <HeroMetric label="Decks Rem." value={decksRemaining.toFixed(2)} />
        <HeroMetric label="Cards Seen" value={totalCards} />
      </div>

      <div className="hero__vsep" aria-hidden />

      <div className="hero__col hero__col--pen">
        <div className="hero__pen-row">
          <span>Shoe Penetration</span>
          <span className="hero__pen-val">{pen.toFixed(0)}%</span>
        </div>
        <div className="hero__pen-bar">
          <div className="hero__pen-fill" style={{ width: `${pen}%` }} />
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ label, value, accent, sub, big }) {
  return (
    <div className={`hmetric ${big ? 'hmetric--big' : ''}`}>
      <div className="hmetric__label">{label}</div>
      <div className={`hmetric__value ${accent ? 'hmetric__value--' + accent : ''}`} key={String(value)}>{value}</div>
      {sub && <div className="hmetric__sub">{sub}</div>}
    </div>
  );
}

function RecommendationBar({ trueCount }) {
  const r = getRecommendation(trueCount);
  return (
    <div className={`reco reco--${r.tone}`} key={r.tier}>
      <div className="reco__icon" aria-hidden>
        <r.Icon size={16} />
      </div>
      <div className="reco__body">
        <div className="reco__label">{r.label}</div>
        <div className="reco__advice">{r.text}</div>
      </div>
      <div className="reco__tc">
        <span className="reco__tc-label">TC</span>
        <span className="reco__tc-num">{trueCount >= 0 ? '+' : ''}{trueCount.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode switch
// ---------------------------------------------------------------------------
const MODES = [
  { id: 'quick', label: 'Quick Count', sub: 'Speed',     icon: <Activity size={15} /> },
  { id: 'full',  label: 'Full Tracking', sub: 'Precision', icon: <CircleDot size={15} /> },
];

function ModeSwitch({ mode, onChange }) {
  return (
    <div className="modeswitch" role="tablist" aria-label="Counting mode">
      <div className="modeswitch__head">
        <div className="modeswitch__title">Mode</div>
        <div className="modeswitch__sub">
          {mode === 'quick'
            ? 'Category input only — optimized for speed'
            : 'Exact ranks tracked — full composition analysis'}
        </div>
      </div>
      <div className="modeswitch__seg">
        {MODES.map(m => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            type="button"
            className={`modeswitch__btn ${mode === m.id ? 'modeswitch__btn--on' : ''}`}
            onClick={() => onChange(m.id)}
          >
            <span className="modeswitch__icon">{m.icon}</span>
            <span className="modeswitch__lbl">{m.label}</span>
            <span className="modeswitch__pill">{m.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Count — three large buttons
// ---------------------------------------------------------------------------
function QuickInput({ onRapid, keyFlash, disabled }) {
  const buttons = [
    { delta: 1,  sym: '+1', tone: 'green',   label: 'LOW',  range: '2 - 6',  hint: 'favors player' },
    { delta: 0,  sym: '0',  tone: 'neutral', label: 'MID',  range: '7 - 9',  hint: 'neutral' },
    { delta: -1, sym: '-1', tone: 'red',     label: 'HIGH', range: '10 - A', hint: 'favors house' },
  ];
  const [pressed, setPressed] = useState(null);

  const handle = (b) => {
    if (disabled) return;
    setPressed(b.delta);
    setTimeout(() => setPressed(null), 200);
    onRapid(b.delta);
  };

  return (
    <div className="qci">
      {disabled && (
        <div className="shoe-banner">
          Shoe complete — reset or start a new session.
        </div>
      )}
      <div className="qci__row">
        {buttons.map(b => {
          const isActive = !disabled && (pressed === b.delta || keyFlash === b.delta);
          return (
            <button
              key={b.label}
              type="button"
              disabled={disabled}
              className={`qci-btn qci-btn--${b.tone} ${isActive ? 'qci-btn--press' : ''} ${disabled ? 'qci-btn--shoe-full' : ''}`}
              onClick={() => handle(b)}
            >
              <span className="qci-btn__pulse" aria-hidden />
              <span className="qci-btn__top">
                <span className="qci-btn__lbl">{b.label}</span>
                <span className="qci-btn__range">{b.range}</span>
              </span>
              <span className="qci-btn__sym">{b.sym}</span>
              <span className="qci-btn__hint">{b.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full Shoe Tracking — analytical card chips
// ---------------------------------------------------------------------------
function CardChip({ value, delta, dealt, totalInShoe, onDeal, flash }) {
  const ref = useRef(null);
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (flash) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 240);
      return () => clearTimeout(t);
    }
  }, [flash]);

  const handleMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    el.style.setProperty('--tilt-x', `${(0.5 - y) * 6}deg`);
    el.style.setProperty('--tilt-y', `${(x - 0.5) * 8}deg`);
    el.style.setProperty('--shine-x', `${x * 100}%`);
    el.style.setProperty('--shine-y', `${y * 100}%`);
  };
  const handleLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };

  const handle = () => {
    if (depleted) return;
    setBump(true);
    setTimeout(() => setBump(false), 220);
    onDeal(value, delta);
  };

  const tone = delta === 1 ? 'low' : delta === -1 ? 'high' : 'mid';
  const remaining = Math.max(0, totalInShoe - dealt);
  const pct = totalInShoe > 0 ? Math.min(100, (dealt / totalInShoe) * 100) : 0;
  const depleted = remaining === 0;

  return (
    <button
      ref={ref}
      className={`chip chip--${tone} ${bump ? 'chip--bump' : ''} ${depleted ? 'chip--depleted' : ''}`}
      onClick={handle}
      onMouseMove={!depleted ? handleMove : undefined}
      onMouseLeave={handleLeave}
      type="button"
      disabled={depleted}
      aria-label={`Track ${value}`}
    >
      <span className="chip__shine" aria-hidden />
      <span className="chip__top">
        <span className="chip__rank">{value}</span>
        <span className={`chip__delta chip__delta--${tone}`}>{delta === 1 ? '+1' : delta === -1 ? '-1' : '0'}</span>
      </span>

      <span className="chip__mid">
        <span className="chip__remaining" key={remaining}>{remaining}</span>
        <span className="chip__remaining-lbl">left</span>
      </span>

      <span className="chip__bar">
        <span className={`chip__bar-fill chip__bar-fill--${tone}`} style={{ width: `${pct}%` }} />
      </span>

      <span className="chip__foot">
        <span>dealt</span>
        <span className="chip__dealt">{dealt}/{totalInShoe}</span>
      </span>
    </button>
  );
}

function ChipGroup({ title, sub, cards, cardCounts, onDeal, lastValue, accent, decks }) {
  const totalDealt = cards.reduce((acc, c) => acc + (cardCounts[c.v] || 0), 0);
  const totalInShoe = cards.length * decks * 4;

  return (
    <div className={`chipgroup chipgroup--${accent}`}>
      <div className="chipgroup__head">
        <div className="chipgroup__rail" />
        <div className="chipgroup__title">
          <span className={`grouptag grouptag--${accent}`}>{sub}</span>
          <span>{title}</span>
        </div>
        <div className="chipgroup__meta">
          <span>{totalDealt}</span>
          <span className="chipgroup__meta-div">/</span>
          <span className="chipgroup__meta-total">{totalInShoe}</span>
          <span className="chipgroup__meta-lbl">dealt</span>
        </div>
      </div>
      <div className="chipgroup__row">
        {cards.map(c => (
          <CardChip
            key={c.v}
            value={c.v}
            delta={c.delta}
            dealt={cardCounts[c.v] || 0}
            totalInShoe={decks * 4}
            onDeal={onDeal}
            flash={lastValue === c.v}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick Add Strip (Full Shoe mode — count only)
// ---------------------------------------------------------------------------
function QuickAddStrip({ onRapid, disabled }) {
  const [pressed, setPressed] = useState(null);
  const buttons = [
    { delta: 1,  label: 'LOW',  sym: '+1', tone: 'green' },
    { delta: 0,  label: 'MID',  sym: '0',  tone: 'neutral' },
    { delta: -1, label: 'HIGH', sym: '-1', tone: 'red' },
  ];
  const handle = (delta) => {
    if (disabled) return;
    setPressed(delta);
    setTimeout(() => setPressed(null), 180);
    onRapid(delta);
  };
  return (
    <div className="quick-add-strip">
      <div className="quick-add-strip__hd">
        <span className="quick-add-strip__title">Quick Add</span>
        <span className="quick-add-strip__note">count only — does not update chip composition</span>
      </div>
      {disabled && (
        <div className="shoe-banner shoe-banner--strip">
          Shoe complete — reset or start a new session.
        </div>
      )}
      <div className="quick-add-strip__row">
        {buttons.map(b => (
          <button
            key={b.label}
            type="button"
            disabled={disabled}
            className={`qa-btn qa-btn--${b.tone} ${pressed === b.delta ? 'qa-btn--press' : ''} ${disabled ? 'qa-btn--shoe-full' : ''}`}
            onClick={() => handle(b.delta)}
          >
            <span className="qa-btn__lbl">{b.label}</span>
            <span className="qa-btn__sym">{b.sym}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composition Panel
// ---------------------------------------------------------------------------
function CompositionPanel({ cardCounts, decks, totalCards }) {
  const totalShoe = decks * 52;
  const remainingTotal = Math.max(0, totalShoe - totalCards);

  const dealtFor = (ranks) => ranks.reduce((acc, r) => acc + (cardCounts[r] || 0), 0);
  const startFor = (rankCount) => decks * 4 * rankCount;

  const lowDealt  = dealtFor(['2','3','4','5','6']);
  const midDealt  = dealtFor(['7','8','9']);
  const tenDealt  = dealtFor(['10','J','Q','K']);
  const aceDealt  = dealtFor(['A']);
  const highDealt = tenDealt + aceDealt;

  const lowRem  = startFor(5) - lowDealt;
  const midRem  = startFor(3) - midDealt;
  const tenRem  = startFor(4) - tenDealt;
  const aceRem  = startFor(1) - aceDealt;
  const highRem = tenRem + aceRem;

  const safeRem = remainingTotal || 1;
  const lowDensity  = (lowRem / safeRem) * 100;
  const midDensity  = (midRem / safeRem) * 100;
  const tenDensity  = (tenRem / safeRem) * 100;
  const aceDensity  = (aceRem / safeRem) * 100;
  const highDensity = (highRem / safeRem) * 100;

  const baseline = { low: 5/13*100, mid: 3/13*100, ten: 4/13*100, ace: 1/13*100, high: 5/13*100 };
  const pen = totalShoe > 0 ? (totalCards / totalShoe) * 100 : 0;

  const alerts = useMemo(() => {
    const arr = [];
    if (totalCards < 8) return arr;
    const tenDelta  = tenDensity  - baseline.ten;
    const aceDelta  = aceDensity  - baseline.ace;
    const highDelta = highDensity - baseline.high;
    const lowDelta  = lowDensity  - baseline.low;

    if (tenDelta >= 4)        arr.push({ tone: 'green', Icon: TrendingUp,    text: 'High concentration of 10-value cards remaining', sub: `${tenDensity.toFixed(1)}% vs ${baseline.ten.toFixed(1)}% baseline` });
    else if (tenDelta <= -4)  arr.push({ tone: 'red',   Icon: TrendingDown,  text: '10-value density below baseline',                sub: `${tenDensity.toFixed(1)}% vs ${baseline.ten.toFixed(1)}% baseline` });

    if (aceDelta >= 1.5)      arr.push({ tone: 'green', Icon: Zap,           text: 'Elevated ace density — favors player',           sub: `${aceDensity.toFixed(1)}% vs ${baseline.ace.toFixed(1)}% baseline` });
    else if (aceDelta <= -1.5) arr.push({ tone: 'amber', Icon: AlertCircle,  text: 'Ace density below expected baseline',            sub: `${aceDensity.toFixed(1)}% vs ${baseline.ace.toFixed(1)}% baseline` });

    if (lowDelta >= 4)               arr.push({ tone: 'red',   Icon: ArrowDown, text: 'Low cards over-represented — fewer naturals ahead', sub: `${lowDensity.toFixed(1)}% vs ${baseline.low.toFixed(1)}% baseline` });
    else if (highDelta >= 4 && tenDelta < 4) arr.push({ tone: 'green', Icon: ArrowUp, text: 'High cards over-represented in remaining shoe', sub: `${highDensity.toFixed(1)}% vs ${baseline.high.toFixed(1)}% baseline` });

    if (pen >= 75 && pen < 100) arr.push({ tone: 'amber', Icon: Activity, text: 'Deep penetration — true count weight is amplified', sub: `${pen.toFixed(0)}% of shoe dealt` });

    return arr.slice(0, 3);
  }, [totalCards, tenDensity, aceDensity, highDensity, lowDensity, pen]);

  const rows = [
    { key: 'high', label: 'High (10-A)',     remaining: highRem, density: highDensity, baseline: baseline.high, tone: 'red' },
    { key: 'ten',  label: '10-Value (10-K)', remaining: tenRem,  density: tenDensity,  baseline: baseline.ten,  tone: 'red' },
    { key: 'ace',  label: 'Aces',            remaining: aceRem,  density: aceDensity,  baseline: baseline.ace,  tone: 'gold' },
    { key: 'mid',  label: 'Mid (7-9)',        remaining: midRem,  density: midDensity,  baseline: baseline.mid,  tone: 'neutral' },
    { key: 'low',  label: 'Low (2-6)',        remaining: lowRem,  density: lowDensity,  baseline: baseline.low,  tone: 'green' },
  ];

  return (
    <Panel tone="composition" className="comp-panel">
      <div className="panel__title-row">
        <div>
          <div className="panel__title">Shoe Composition</div>
          <div className="panel__sub">Density vs baseline &middot; {remainingTotal} cards remaining in {decks}-deck shoe</div>
        </div>
        <div className="comp-pen">
          <div className="comp-pen__num">{pen.toFixed(0)}<span>%</span></div>
          <div className="comp-pen__lbl">penetration</div>
        </div>
      </div>

      <div className="comp-rows">
        {rows.map(r => (
          <CompositionRow key={r.key} {...r} />
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="comp-alerts">
          {alerts.map((a, i) => (
            <div className={`comp-alert comp-alert--${a.tone}`} key={i}>
              <span className="comp-alert__icon"><a.Icon size={14} /></span>
              <div className="comp-alert__body">
                <div className="comp-alert__text">{a.text}</div>
                <div className="comp-alert__sub">{a.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CompositionRow({ label, remaining, density, baseline, tone }) {
  const delta = density - baseline;
  const deltaTone = delta >= 1.5 ? 'pos' : delta <= -1.5 ? 'neg' : 'zero';
  const barMax = 50;
  const w = Math.min(100, (density / barMax) * 100);
  const baselineW = Math.min(100, (baseline / barMax) * 100);

  return (
    <div className={`comp-row comp-row--${tone}`}>
      <div className="comp-row__label">
        <span>{label}</span>
        <span className="comp-row__remaining">{remaining}</span>
      </div>
      <div className="comp-row__bar">
        <div className={`comp-row__fill comp-row__fill--${tone}`} style={{ width: `${w}%` }} />
        <div className="comp-row__baseline" style={{ left: `${baselineW}%` }} title="baseline" />
      </div>
      <div className="comp-row__density">
        <span className="comp-row__pct">{density.toFixed(1)}%</span>
        <span className={`comp-row__delta comp-row__delta--${deltaTone}`}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar panels
// ---------------------------------------------------------------------------
function SettingsPanel({ decks, onDeckChange, soundEnabled, setSoundEnabled }) {
  return (
    <Panel tone="muted" className="settings-panel">
      <div className="panel__title">Shoe Configuration</div>
      <div className="settings__decks">
        {DECK_OPTIONS.map(n => (
          <button
            key={n}
            className={`deck-btn ${decks === n ? 'deck-btn--on' : ''}`}
            onClick={() => onDeckChange(n)}
            type="button"
          >
            <div className="deck-btn__num">{n}</div>
            <div className="deck-btn__lbl">{n === 1 ? 'deck' : 'decks'}</div>
          </button>
        ))}
      </div>
      <div className="settings__row">
        <span className="settings__label">Sound effects</span>
        <button
          className={`toggle-btn ${soundEnabled ? 'toggle-btn--on' : ''}`}
          onClick={() => setSoundEnabled(v => !v)}
          type="button"
          title="Toggle UI sounds"
        >
          {soundEnabled ? 'On' : 'Off'}
        </button>
      </div>
    </Panel>
  );
}

function ProToolsPanel({ onUpgrade }) {
  const features = [
    'Saved session history',
    'Advanced analytics',
    'Training drills',
    'Data export',
    'Stealth mode',
    'Cloud sync',
  ];
  return (
    <Panel tone="pro" className="pro-panel">
      <div className="pro-panel__head">
        <div>
          <div className="pro-panel__eyebrow">Pro Tools</div>
          <div className="panel__title">Unlock the full lab</div>
        </div>
        <div className="pro-panel__badge">PRO</div>
      </div>
      <ul className="pro-list">
        {features.map(f => (
          <li className="pro-list__item" key={f}>
            <span className="pro-list__dot"><Check size={10} /></span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button className="upgrade-btn" onClick={onUpgrade} type="button">
        <span>Upgrade to Pro</span>
        <ArrowRight size={14} />
      </button>
    </Panel>
  );
}

function StatsPanel({ stats }) {
  const total = stats.total || 1;
  const lowPct  = (stats.low  / total) * 100;
  const midPct  = (stats.mid  / total) * 100;
  const highPct = (stats.high / total) * 100;
  return (
    <Panel tone="muted" className="stats-panel">
      <div className="panel__title-row">
        <div className="panel__title">Distribution</div>
        <div className="panel__sub">{stats.total} cards</div>
      </div>
      <div className="dist-bar">
        <div className="dist-bar__seg dist-bar__seg--low"  style={{ width: stats.total ? `${lowPct}%`  : '33.33%' }} />
        <div className="dist-bar__seg dist-bar__seg--mid"  style={{ width: stats.total ? `${midPct}%`  : '33.33%' }} />
        <div className="dist-bar__seg dist-bar__seg--high" style={{ width: stats.total ? `${highPct}%` : '33.34%' }} />
      </div>
      <div className="stats-grid">
        <StatTile label="Low (+1)"  value={stats.low}  pct={lowPct}  tone="green" />
        <StatTile label="Mid (0)"   value={stats.mid}  pct={midPct}  tone="neutral" />
        <StatTile label="High (-1)" value={stats.high} pct={highPct} tone="red" />
      </div>
    </Panel>
  );
}

function StatTile({ label, value, pct, tone }) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      <div className="stat-tile__val">{value}</div>
      <div className="stat-tile__row">
        <span className="stat-tile__lbl">{label}</span>
        <span className="stat-tile__pct">{(pct || 0).toFixed(0)}%</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session timeline
// ---------------------------------------------------------------------------
function LogPanel({ log }) {
  return (
    <Panel tone="muted" className="log-panel">
      <div className="panel__title-row">
        <div className="panel__title">Session Log</div>
        <div className="panel__sub">{log.length} {log.length === 1 ? 'event' : 'events'}</div>
      </div>
      <div className="log">
        {log.length === 0 && (
          <div className="log__empty">
            <div className="log__empty-icon"><Activity size={22} /></div>
            <div className="log__empty-text">Awaiting first card</div>
            <div className="log__empty-sub">Tap a rank chip or use Quick Count to begin.</div>
          </div>
        )}
        {log.slice(0, 80).map((entry) => {
          const tone = entry.delta === 1 ? 'pos' : entry.delta === -1 ? 'neg' : 'zero';
          return (
            <div className={`tl-row tl-row--${tone}`} key={entry.id}>
              <div className="tl-row__rail">
                <div className="tl-row__node" />
              </div>
              <div className="tl-row__pill">
                <span className="tl-row__val">{entry.value}</span>
              </div>
              <div className="tl-row__main">
                <div className="tl-row__delta">{entry.delta === 1 ? '+1' : entry.delta === -1 ? '-1' : '0'}</div>
                <div className="tl-row__sub">#{entry.idx}</div>
              </div>
              <div className="tl-row__rc">
                <div className="tl-row__rc-num">{entry.rc >= 0 ? '+' : ''}{entry.rc}</div>
                <div className="tl-row__rc-lbl">RC</div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Deck change confirmation modal
// ---------------------------------------------------------------------------
function DeckChangeModal({ targetDecks, onCancel, onConfirm }) {
  if (!targetDecks) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal--confirm" onClick={e => e.stopPropagation()}>
        <div className="modal__title modal__title--sm">
          Change to {targetDecks} {targetDecks === 1 ? 'deck' : 'decks'}?
        </div>
        <div className="modal__sub modal__sub--confirm">
          Changing to {targetDecks} {targetDecks === 1 ? 'deck' : 'decks'} will reset the current session because the current shoe exceeds that limit.
        </div>
        <div className="modal__btn-row">
          <button className="modal__cancel-btn" onClick={onCancel} type="button">Cancel</button>
          <button className="modal__confirm-btn" onClick={onConfirm} type="button">Change deck and reset</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pro modal
// ---------------------------------------------------------------------------
function ProModal({ open, onClose }) {
  if (!open) return null;
  const features = [
    { t: 'Saved session history', s: 'Revisit and compare past shoes anytime.' },
    { t: 'Advanced analytics',    s: 'Count history, EV curves, deviation charts.' },
    { t: 'Training drills',       s: 'Speed reps, deck-end accuracy, basic strategy.' },
    { t: 'Export & cloud sync',   s: 'CSV / PDF export and cross-device sync.' },
    { t: 'Stealth mode',          s: 'Minimal interface for discreet practice.' },
  ];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__crown">
          <svg viewBox="0 0 22 18" aria-hidden="true" fill="currentColor" style={{width:22,height:18}}>
            <rect x="0" y="10" width="5" height="8" rx="1.5" opacity="0.45"/>
            <rect x="8.5" y="5" width="5" height="13" rx="1.5" opacity="0.70"/>
            <rect x="17" y="0" width="5" height="18" rx="1.5" opacity="1"/>
          </svg>
        </div>
        <div className="modal__title">Strategy Lab <span>Pro</span></div>
        <div className="modal__sub">Unlock the full simulator suite.</div>
        <div className="modal__features">
          {features.map((f, i) => (
            <div className="modal__feature" key={i}>
              <div className="modal__check"><Check size={12} /></div>
              <div>
                <div className="modal__feat-t">{f.t}</div>
                <div className="modal__feat-s">{f.s}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="modal__price-row">
          <div>
            <div className="modal__price">$7.99<span>/month</span></div>
            <div className="modal__price-sub">Cancel anytime &middot; 7-day trial</div>
          </div>
          <button className="modal__cta" type="button">Upgrade to Pro</button>
        </div>
        <button className="modal__dismiss" onClick={onClose} type="button">Maybe later</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nav tabs
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'live',      label: 'Live Session', dot: true },
  { id: 'training',  label: 'Training' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'stealth',   label: 'Stealth',      locked: true },
];

function NavTabs({ active, onChange }) {
  return (
    <nav className="tabs">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          className={`tab ${active === t.id ? 'tab--on' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.dot && <span className="tab__dot" />}
          <span>{t.label}</span>
          {t.locked && <span className="tab__lock">PRO</span>}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcut bar — redesigned
// ---------------------------------------------------------------------------
function KbdKey({ k, accent }) {
  return <span className={`kbd-key ${accent ? `kbd-key--${accent}` : ''}`}>{k}</span>;
}

function ShortcutBar({ mode }) {
  if (mode === 'quick') {
    return (
      <div className="kbd-bar">
        <div className="kbd-bar__label">Keyboard</div>
        <div className="kbd-bar__rows">
          <div className="kbd-row">
            <div className="kbd-row__group">
              <KbdKey k="Q" accent="green" />
              <span className="kbd-row__desc kbd-row__desc--green">Low +1</span>
            </div>
            <div className="kbd-row__sep" />
            <div className="kbd-row__group">
              <KbdKey k="W" />
              <span className="kbd-row__desc">Mid 0</span>
            </div>
            <div className="kbd-row__sep" />
            <div className="kbd-row__group">
              <KbdKey k="E" accent="red" />
              <span className="kbd-row__desc kbd-row__desc--red">High -1</span>
            </div>
          </div>
          <div className="kbd-row kbd-row--actions">
            <div className="kbd-row__group">
              <KbdKey k="U" />
              <span className="kbd-row__desc">Undo</span>
            </div>
            <div className="kbd-row__group">
              <KbdKey k="R" />
              <span className="kbd-row__desc">Reset</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="kbd-bar">
      <div className="kbd-bar__label">Keyboard</div>
      <div className="kbd-bar__rows">
        <div className="kbd-row">
          <div className="kbd-row__keys">
            {['2','3','4','5','6','7','8','9'].map(k => <KbdKey key={k} k={k} />)}
          </div>
          <span className="kbd-row__group-label">Card Ranks</span>
        </div>
        <div className="kbd-row">
          <div className="kbd-row__keys">
            {['T','J','Q','K','A'].map(k => <KbdKey key={k} k={k} accent="red" />)}
          </div>
          <span className="kbd-row__group-label kbd-row__group-label--red">High Values (-1)</span>
        </div>
        <div className="kbd-row kbd-row--actions">
          <div className="kbd-row__group">
            <KbdKey k="U" />
            <span className="kbd-row__desc">Undo</span>
          </div>
          <div className="kbd-row__group">
            <KbdKey k="R" />
            <span className="kbd-row__desc">Reset</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Locked tab previews
// ---------------------------------------------------------------------------
function Sparkline({ points, color = '#4fa8cc', filled = true, height = 60, width = 320, dashed = false }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - ((p - min) / range) * (height - 6) - 3).toFixed(1)}`).join(' ');
  const fill = `${path} L${width},${height} L0,${height} Z`;
  const gradId = `sg-${color.replace('#','')}`;
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled && <path d={fill} fill={`url(#${gradId})`} />}
      <path d={path} stroke={color} fill="none" strokeWidth="1.6" strokeDasharray={dashed ? '3 3' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrainingPreview() {
  const drills = [
    { t: 'Speed Shoe',     s: '6 decks &middot; 90 BPM',  acc: 96, streak: 14, color: '#10b981' },
    { t: 'Deck-End',       s: 'Hidden count test', acc: 88, streak: 7,  color: '#4fa8cc' },
    { t: 'Basic Strategy', s: 'Hand decisions',    acc: 92, streak: 22, color: '#6ee7b7' },
  ];
  return (
    <div className="lp-grid">
      <div className="lp-card lp-card--hero">
        <div className="lp-card__badge">DAILY DRILL</div>
        <div className="lp-card__title">Sprint — Six-Deck Shoe</div>
        <div className="lp-card__sub">Track every card before the cut card. Maintain 95%+ accuracy at 110 BPM.</div>
        <div className="lp-meters">
          <Meter label="Accuracy" value="96%" pct={96} color="#10b981" />
          <Meter label="Tempo" value="110 bpm" pct={78} color="#4fa8cc" />
          <Meter label="Streak" value="14 days" pct={64} color="#6ee7b7" />
        </div>
        <div className="lp-spark">
          <Sparkline points={[40,52,49,58,66,61,72,75,71,80,86,84,92]} color="#10b981" width={420} height={72} />
        </div>
      </div>

      {drills.map(d => (
        <div className="lp-card" key={d.t}>
          <div className="lp-card__row">
            <div>
              <div className="lp-card__title-sm">{d.t}</div>
              <div className="lp-card__sub">{d.s}</div>
            </div>
            <div className="lp-pill" style={{ color: d.color, borderColor: `${d.color}55` }}>{d.acc}%</div>
          </div>
          <div className="lp-bar"><div className="lp-bar__fill" style={{ width: `${d.acc}%`, background: d.color }} /></div>
          <div className="lp-card__foot">
            <span>{d.streak}-day streak</span>
            <span className="lp-card__cta">Begin <ChevronRight size={11} style={{display:'inline-block',verticalAlign:'middle'}} /></span>
          </div>
        </div>
      ))}

      <div className="lp-card lp-card--wide">
        <div className="lp-card__row">
          <div>
            <div className="lp-card__title-sm">Reaction Map — Last 7 Sessions</div>
            <div className="lp-card__sub">Avg time to identify each rank, in milliseconds.</div>
          </div>
          <div className="lp-pill lp-pill--gold">412ms avg</div>
        </div>
        <div className="lp-rxn">
          {['2','3','4','5','6','7','8','9','10','J','Q','K','A'].map((c, i) => {
            const v = [380, 365, 410, 395, 420, 460, 470, 455, 350, 360, 348, 342, 318][i];
            const pct = ((520 - v) / 220) * 100;
            return (
              <div className="lp-rxn__col" key={c}>
                <div className="lp-rxn__bar"><div className="lp-rxn__fill" style={{ height: `${pct}%` }} /></div>
                <div className="lp-rxn__lbl">{c}</div>
                <div className="lp-rxn__ms">{v}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPreview() {
  return (
    <div className="lp-grid">
      <div className="lp-card lp-card--hero">
        <div className="lp-card__badge">SESSION TRAJECTORY</div>
        <div className="lp-card__title">True Count over time</div>
        <div className="lp-card__sub">6-deck shoe &middot; 312 cards &middot; last Saturday 11:42 PM</div>
        <div className="lp-spark lp-spark--tall">
          <Sparkline points={[0,1,2,1,3,2,4,3,5,4,3,2,4,5,6,4,3,2,1,0,-1,-2,-1,0,1,2,3,5,6,7,5,4]} color="#4fa8cc" width={520} height={140} />
        </div>
        <div className="lp-axis">
          <span>Cut Card</span>
          <span>Mid Shoe</span>
          <span>Final Quarter</span>
        </div>
      </div>

      <div className="lp-card">
        <div className="lp-card__title-sm">EV Distribution</div>
        <div className="lp-card__sub">By true-count bucket</div>
        <div className="lp-ev">
          {[-3,-2,-1,0,1,2,3,4,5].map(tc => {
            const h = Math.min(100, Math.abs(tc * 12) + 16);
            const pos = tc > 0;
            return (
              <div className="lp-ev__col" key={tc}>
                <div className="lp-ev__bar-wrap">
                  <div className={`lp-ev__bar lp-ev__bar--${pos ? 'pos' : tc === 0 ? 'zero' : 'neg'}`} style={{ height: `${h}%` }} />
                </div>
                <div className="lp-ev__lbl">{tc > 0 ? `+${tc}` : tc}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lp-card">
        <div className="lp-card__title-sm">Composition Heatmap</div>
        <div className="lp-card__sub">Rank deviation from expected</div>
        <div className="lp-heat">
          {[0.92,1.04,0.88,1.15,1.21,0.78,0.81,1.03,1.18,0.96,1.07,1.11,0.84].map((v, i) => {
            const r = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'][i];
            const intensity = Math.min(1, Math.abs(v - 1) * 4);
            const tone = v > 1 ? '16, 185, 129' : '244, 63, 94';
            return (
              <div className="lp-heat__cell" key={r} style={{ background: `rgba(${tone}, ${intensity * 0.7})` }}>
                <div className="lp-heat__r">{r}</div>
                <div className="lp-heat__v">{v.toFixed(2)}x</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="lp-card lp-card--wide lp-stats">
        <LpStat label="Sessions" value="42" delta="+6 this week" />
        <LpStat label="Avg True" value="+1.84" delta="+0.3" tone="green" />
        <LpStat label="Decision" value="94.2%" delta="+1.1%" tone="green" />
        <LpStat label="Best Shoe" value="+9.6 TC" delta="May 2" />
      </div>
    </div>
  );
}

function LpStat({ label, value, delta, tone }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat__lbl">{label}</div>
      <div className="lp-stat__v">{value}</div>
      <div className={`lp-stat__d lp-stat__d--${tone || 'mute'}`}>{delta}</div>
    </div>
  );
}

function Meter({ label, value, pct, color }) {
  return (
    <div className="meter">
      <div className="meter__row"><span>{label}</span><span className="meter__v">{value}</span></div>
      <div className="meter__bar"><div className="meter__fill" style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

function StealthPreview() {
  return (
    <div className="lp-grid">
      <div className="lp-card lp-card--hero stealth-hero">
        <div className="lp-card__badge">STEALTH MODE</div>
        <div className="lp-card__title">A discreet companion view</div>
        <div className="lp-card__sub">Single glance. Single tap. Nothing identifying. Mirrors your live count silently in the background.</div>
        <div className="stealth-phone">
          <div className="stealth-phone__screen">
            <div className="stealth-phone__num">+4</div>
            <div className="stealth-phone__lbl">running</div>
            <div className="stealth-phone__zones">
              <div className="stealth-phone__z stealth-phone__z--l">-</div>
              <div className="stealth-phone__z stealth-phone__z--m">·</div>
              <div className="stealth-phone__z stealth-phone__z--r">+</div>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-card">
        <div className="lp-card__title-sm">Glance Mode</div>
        <div className="lp-card__sub">Single-tap zones for thumb input. No labels. No chrome.</div>
        <ul className="lp-checklist">
          <li>Three large hit zones</li>
          <li>Haptic feedback on every tap</li>
          <li>One-finger reset</li>
        </ul>
      </div>
      <div className="lp-card">
        <div className="lp-card__title-sm">Quick Hide</div>
        <div className="lp-card__sub">Three-finger tap returns to a neutral home screen instantly.</div>
        <ul className="lp-checklist">
          <li>Decoy clock face</li>
          <li>Auto-hide on app switch</li>
          <li>Privacy-respecting telemetry</li>
        </ul>
      </div>
      <div className="lp-card">
        <div className="lp-card__title-sm">Auto-Dim</div>
        <div className="lp-card__sub">Adapts to ambient light and pauses on lift.</div>
        <ul className="lp-checklist">
          <li>OLED-friendly black UI</li>
          <li>Low-light contrast tuning</li>
          <li>Pause-on-lift via accelerometer</li>
        </ul>
      </div>
    </div>
  );
}

const TAB_INFO = {
  training:  { title: 'Training',  tagline: 'Drills, streaks, and reaction telemetry — calibrated to your skill curve.' },
  analytics: { title: 'Analytics', tagline: 'Trajectories, deviations, and EV bands across every shoe you\'ve played.' },
  stealth:   { title: 'Stealth',   tagline: 'A pared-down, low-profile companion view designed for discreet practice.' },
};

function LockedTab({ tabId, onUpgrade }) {
  const info = TAB_INFO[tabId];
  return (
    <div className="locked-wrap">
      <div className="locked-head">
        <div className="locked-badge">PRO · COMING SOON</div>
        <h2 className="locked-title">{info.title}</h2>
        <p className="locked-tagline">{info.tagline}</p>
      </div>
      <div className="locked-stage">
        <div className="locked-veil" aria-hidden />
        <div className="locked-content">
          {tabId === 'training' && <TrainingPreview />}
          {tabId === 'analytics' && <AnalyticsPreview />}
          {tabId === 'stealth' && <StealthPreview />}
        </div>
        <div className="locked-cta-card">
          <div className="locked-cta-card__icon">
            <svg viewBox="0 0 22 18" fill="currentColor" style={{width:24,height:20,opacity:0.7}}>
              <rect x="0" y="10" width="5" height="8" rx="1.5" opacity="0.45"/>
              <rect x="8.5" y="5" width="5" height="13" rx="1.5" opacity="0.70"/>
              <rect x="17" y="0" width="5" height="18" rx="1.5" opacity="1"/>
            </svg>
          </div>
          <div className="locked-cta-card__title">This is a Pro feature</div>
          <div className="locked-cta-card__sub">Get early access plus saved sessions, analytics, drills, exports and stealth mode.</div>
          <button className="upgrade-btn locked-cta" onClick={onUpgrade} type="button">
            <span>Get early access with Pro</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — utilities
// ---------------------------------------------------------------------------
function loadTrainingStats() {
  try {
    const raw = localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!raw) return { drillsCompleted: 0, bestStreak: 0, bestAccuracy: 0, currentStreak: 0 };
    const p = JSON.parse(raw);
    return {
      drillsCompleted: p.drillsCompleted ?? 0,
      bestStreak:      p.bestStreak      ?? 0,
      bestAccuracy:    p.bestAccuracy    ?? 0,
      currentStreak:   p.currentStreak   ?? 0,
    };
  } catch { return { drillsCompleted: 0, bestStreak: 0, bestAccuracy: 0, currentStreak: 0 }; }
}
function saveTrainingStats(s) {
  try { localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify(s)); } catch {}
}

function loadDrillHistory() {
  try {
    const raw = localStorage.getItem(DRILL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function appendDrillHistory(entry) {
  try {
    const history = loadDrillHistory();
    history.unshift(entry);
    localStorage.setItem(DRILL_HISTORY_KEY, JSON.stringify(history.slice(0, 200)));
  } catch {}
}

function computeInsights(history) {
  if (history.length < 3) {
    return [{ text: 'Complete a few more drills to generate personalized insights.', tone: 'muted' }];
  }

  const insights = [];

  // Speed weakness detection
  const bySpeed = {};
  for (const d of history) {
    if (!bySpeed[d.speed]) bySpeed[d.speed] = [];
    bySpeed[d.speed].push(d.accuracy);
  }
  const speedAvgs = Object.entries(bySpeed)
    .filter(([, arr]) => arr.length >= 2)
    .map(([speed, arr]) => ({ speed, avg: arr.reduce((s, v) => s + v, 0) / arr.length }));
  if (speedAvgs.length >= 2) {
    const sorted = [...speedAvgs].sort((a, b) => b.avg - a.avg);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const gap = best.avg - worst.avg;
    const wLabel = worst.speed.charAt(0).toUpperCase() + worst.speed.slice(1);
    const bLabel = best.speed.charAt(0).toUpperCase() + best.speed.slice(1);
    if (gap >= 12) {
      insights.push({ text: `Accuracy drops significantly in ${wLabel} mode (${Math.round(worst.avg)}% avg vs ${Math.round(best.avg)}% in ${bLabel}).`, tone: 'amber' });
    } else if (gap <= 5) {
      insights.push({ text: `Strong consistency across speeds — performance is stable regardless of tempo.`, tone: 'green' });
    } else {
      insights.push({ text: `You perform best on ${bLabel} speed — ${Math.round(best.avg)}% average accuracy.`, tone: 'green' });
    }
  }

  // Card count weakness
  const byCount = {};
  for (const d of history) {
    if (!byCount[d.cardCount]) byCount[d.cardCount] = [];
    byCount[d.cardCount].push(d.accuracy);
  }
  const countAvgs = Object.entries(byCount)
    .filter(([, arr]) => arr.length >= 2)
    .map(([count, arr]) => ({ count: parseInt(count), avg: arr.reduce((s, v) => s + v, 0) / arr.length }))
    .sort((a, b) => a.count - b.count);
  if (countAvgs.length >= 2) {
    const smallest = countAvgs[0];
    const largest  = countAvgs[countAvgs.length - 1];
    const drop = smallest.avg - largest.avg;
    if (drop >= 10) {
      insights.push({ text: `Performance decreases after ${smallest.count} cards — accuracy falls ${drop.toFixed(0)}% in longer drills.`, tone: 'amber' });
    } else if (drop < 5 && countAvgs.length >= 2) {
      insights.push({ text: `Drill length has minimal impact — accuracy holds steady up to ${largest.count} cards.`, tone: 'green' });
    }
  }

  // Accuracy trend: recent 5 vs prior 5
  if (history.length >= 8) {
    const recent = history.slice(0, 5);
    const prior  = history.slice(5, 10);
    if (prior.length >= 3) {
      const rAvg = recent.reduce((s, d) => s + d.accuracy, 0) / recent.length;
      const pAvg = prior.reduce((s, d) => s + d.accuracy, 0) / prior.length;
      const diff = rAvg - pAvg;
      if (diff >= 5) {
        insights.push({ text: `Improving — accuracy up ${diff.toFixed(0)}% over your last 10 drills.`, tone: 'green' });
      } else if (diff <= -5) {
        insights.push({ text: `Recent dip — accuracy down ${Math.abs(diff).toFixed(0)}% compared to prior session. Focus on precision.`, tone: 'amber' });
      }
    }
  }

  // Medium consistency
  if (insights.length < 3) {
    const medDrills = history.filter(d => d.speed === 'medium');
    if (medDrills.length >= 3) {
      const medAccs = medDrills.map(d => d.accuracy);
      const medAvg  = medAccs.reduce((s, v) => s + v, 0) / medAccs.length;
      const medVar  = medAccs.reduce((s, v) => s + Math.pow(v - medAvg, 2), 0) / medAccs.length;
      if (Math.sqrt(medVar) < 8 && medAvg > 75) {
        insights.push({ text: `Strong consistency in Medium drills — ${Math.round(medAvg)}% avg with low variance.`, tone: 'green' });
      }
    }
  }

  // Exceptional precision
  if (insights.length < 3) {
    const avgErr = history.reduce((s, d) => s + d.error, 0) / history.length;
    if (history.length >= 5 && avgErr <= 0.5) {
      insights.push({ text: `Exceptional precision — average drift of only ±${avgErr.toFixed(1)} across ${history.length} drills.`, tone: 'green' });
    }
  }

  if (insights.length === 0) {
    insights.push({ text: 'Keep drilling across different settings to unlock personalized insights.', tone: 'muted' });
  }

  return insights.slice(0, 4);
}

function computePerformanceMatrix(history) {
  const speeds = ['slow', 'medium', 'fast'];
  const sizes  = [20, 40, 60];
  const cells  = {};
  for (const speed of speeds) {
    for (const size of sizes) {
      const drills = history.filter(d => d.speed === speed && d.cardCount === size);
      cells[`${speed}-${size}`] = drills.length === 0
        ? { count: 0, avgAccuracy: null }
        : { count: drills.length, avgAccuracy: Math.round(drills.reduce((s, d) => s + d.accuracy, 0) / drills.length) };
    }
  }
  return { cells, speeds, sizes };
}

function computeDriftAnalysis(history) {
  const valid = history.filter(d => typeof d.answer === 'number' && typeof d.correctCount === 'number');
  if (valid.length < 3) return null;
  const deltas   = valid.map(d => d.answer - d.correctCount);
  const avgDrift = deltas.reduce((s, v) => s + v, 0) / deltas.length;
  const bySpeed  = {};
  for (const sp of ['slow', 'medium', 'fast']) {
    const sps = valid.filter(d => d.speed === sp);
    if (sps.length >= 2) {
      const sd = sps.map(d => d.answer - d.correctCount);
      bySpeed[sp] = { count: sps.length, avgDrift: sd.reduce((s, v) => s + v, 0) / sd.length };
    }
  }
  return {
    avgDrift,
    count: valid.length,
    direction: avgDrift > 0.35 ? 'over' : avgDrift < -0.35 ? 'under' : 'balanced',
    bySpeed,
  };
}

function computeConsistencyScore(history) {
  if (history.length < 3) return null;
  const accs    = history.map(d => d.accuracy);
  const mean    = accs.reduce((s, v) => s + v, 0) / accs.length;
  const variance = accs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / accs.length;
  const stdDev  = Math.sqrt(variance);
  const score   = Math.max(0, Math.round(100 - stdDev * 2.8));
  const label   = score >= 80 ? 'High' : score >= 55 ? 'Moderate' : 'Low';
  const tone    = score >= 80 ? 'green' : score >= 55 ? 'gold' : 'red';
  return { score, stdDev: stdDev.toFixed(1), label, tone };
}

function buildShoe(decks) {
  const shoe = [];
  for (let d = 0; d < decks; d++) {
    for (const cv of CARD_VALUES) {
      for (let suit = 0; suit < 4; suit++) {
        shoe.push({ rank: cv.v, delta: cv.delta });
      }
    }
  }
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

const DRILL_SPEEDS = [
  { id: 'slow',   label: 'Slow',   sub: '2.2s / card', ms: 2200 },
  { id: 'medium', label: 'Medium', sub: '1.2s / card', ms: 1200 },
  { id: 'fast',   label: 'Fast',   sub: '0.6s / card', ms: 600  },
];
const DRILL_COUNTS = [20, 40, 60];

// ---------------------------------------------------------------------------
// Training — card chip (large, display-only)
// ---------------------------------------------------------------------------
function DrillChip({ rank, delta }) {
  const tone = delta === 1 ? 'low' : delta === -1 ? 'high' : 'mid';
  return (
    <div className={`drill-chip drill-chip--${tone}`}>
      <div className="drill-chip__glow" aria-hidden />
      <div className="drill-chip__rank">{rank}</div>
      <div className={`drill-chip__cat drill-chip__cat--${tone}`}>
        {delta === 1 ? '2 – 6' : delta === -1 ? '10 – A' : '7 – 9'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — setup screen
// ---------------------------------------------------------------------------
function DrillStatTile({ label, value, suffix, tone }) {
  return (
    <div className={`drill-stat-tile ${tone ? `drill-stat-tile--${tone}` : ''}`}>
      <div className="drill-stat-tile__val">
        {value}{suffix && <span className="drill-stat-tile__sfx">{suffix}</span>}
      </div>
      <div className="drill-stat-tile__lbl">{label}</div>
    </div>
  );
}

function DrillSetup({ stats, onStart }) {
  const [speed, setSpeed]         = useState('medium');
  const [deckCount, setDeckCount] = useState(6);
  const [cardCount, setCardCount] = useState(20);

  return (
    <div className="drill-setup">
      <div className="drill-setup__header">
        <div className="drill-setup__eyebrow">Running Count Sprint</div>
        <div className="drill-setup__title">Configure Drill</div>
        <div className="drill-setup__sub">
          Cards appear automatically one at a time. Track the running count mentally.
          Submit your answer when the drill ends.
        </div>
      </div>

      {stats.drillsCompleted > 0 && (
        <div className="drill-stats-row">
          <DrillStatTile label="Drills" value={stats.drillsCompleted} />
          <DrillStatTile label="Best Streak" value={stats.bestStreak} suffix=" ✓" />
          <DrillStatTile label="Best Accuracy" value={`${stats.bestAccuracy}%`} />
          {stats.currentStreak > 0 && (
            <DrillStatTile label="Streak" value={stats.currentStreak} tone="green" />
          )}
        </div>
      )}

      <div className="drill-config">
        <div className="drill-config__group">
          <div className="drill-config__label">Speed</div>
          <div className="drill-config__opts">
            {DRILL_SPEEDS.map(s => (
              <button
                key={s.id}
                type="button"
                className={`drill-opt-btn ${speed === s.id ? 'drill-opt-btn--on' : ''}`}
                onClick={() => setSpeed(s.id)}
              >
                <span className="drill-opt-btn__lbl">{s.label}</span>
                <span className="drill-opt-btn__sub">{s.sub}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="drill-config__group">
          <div className="drill-config__label">Deck Count</div>
          <div className="drill-config__opts">
            {DECK_OPTIONS.map(n => (
              <button
                key={n}
                type="button"
                className={`drill-opt-btn ${deckCount === n ? 'drill-opt-btn--on' : ''}`}
                onClick={() => setDeckCount(n)}
              >
                <span className="drill-opt-btn__lbl">{n}</span>
                <span className="drill-opt-btn__sub">{n === 1 ? 'deck' : 'decks'}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="drill-config__group">
          <div className="drill-config__label">Cards per Drill</div>
          <div className="drill-config__opts">
            {DRILL_COUNTS.map(n => (
              <button
                key={n}
                type="button"
                className={`drill-opt-btn ${cardCount === n ? 'drill-opt-btn--on' : ''}`}
                onClick={() => setCardCount(n)}
              >
                <span className="drill-opt-btn__lbl">{n}</span>
                <span className="drill-opt-btn__sub">cards</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        className="drill-start-btn"
        onClick={() => onStart({ speed, deckCount, cardCount })}
        type="button"
      >
        <Zap size={16} />
        <span>Start Drill</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — running drill
// ---------------------------------------------------------------------------
function DrillRunner({ cards, currentIdx }) {
  if (!cards.length) return null;
  const card = cards[currentIdx];
  const progress = ((currentIdx + 1) / cards.length) * 100;
  return (
    <div className="drill-runner">
      <div className="drill-runner__badge">
        <span className="drill-runner__badge-dot" aria-hidden />
        Counting in progress — do not show count
      </div>

      <div className="drill-runner__stage">
        <div key={currentIdx} className="drill-runner__card-wrap">
          <DrillChip rank={card.rank} delta={card.delta} />
        </div>
      </div>

      <div className="drill-runner__footer">
        <div className="drill-runner__counter">
          <span className="drill-runner__counter-num">{currentIdx + 1}</span>
          <span className="drill-runner__counter-sep">/</span>
          <span className="drill-runner__counter-total">{cards.length}</span>
        </div>
        <div className="drill-runner__pbar">
          <div className="drill-runner__pfill" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — input phase
// ---------------------------------------------------------------------------
function DrillInputPhase({ cardCount, onSubmit }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const adjust = (delta) => {
    setValue(prev => String((parseInt(prev || '0', 10)) + delta));
  };

  const handleChange = (e) => {
    const v = e.target.value;
    if (v === '' || v === '-' || /^-?\d+$/.test(v)) setValue(v);
  };

  const canSubmit = value !== '' && value !== '-';

  return (
    <div className="drill-inputphase">
      <div className="drill-inputphase__badge">
        <Check size={14} />
        {cardCount} cards dealt
      </div>
      <div className="drill-inputphase__prompt">What was the final running count?</div>
      <div className="drill-inputphase__sub">Hi-Lo system · enter the integer value</div>
      <div className="drill-inputphase__field-row">
        <button className="drill-stepper" onClick={() => adjust(-1)} type="button">−</button>
        <input
          ref={inputRef}
          className="drill-inputphase__field"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) onSubmit(value); }}
          placeholder="0"
          autoComplete="off"
        />
        <button className="drill-stepper" onClick={() => adjust(1)} type="button">+</button>
      </div>
      <button
        className="drill-submit-btn"
        onClick={() => onSubmit(value)}
        disabled={!canSubmit}
        type="button"
      >
        Submit Answer
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — result screen
// ---------------------------------------------------------------------------
function DrillResultMetric({ label, value, accent }) {
  return (
    <div className="drm">
      <div className={`drm__val ${accent ? `drm__val--${accent}` : ''}`}>{value}</div>
      <div className="drm__lbl">{label}</div>
    </div>
  );
}

function DrillResult({ result, onRetry, onReset }) {
  const { answer, correctCount, accuracy, isExact, elapsedMs, cardCount, deckCount } = result;
  const secs = (elapsedMs / 1000).toFixed(1);
  const absDiff = Math.abs(answer - correctCount);

  const decksRemaining = Math.max(0.01, (deckCount * 52 - cardCount) / 52);
  const trueCount = correctCount / decksRemaining;
  const trueCountStr = (trueCount >= 0 ? '+' : '') + trueCount.toFixed(2);

  const explanation =
    absDiff === 0 ? 'Perfect tracking.' :
    absDiff === 1 ? 'Very close — minor tracking drift.' :
    absDiff <= 3  ? 'Close, but the count drifted.' :
                    'Significant drift — slow down or reduce card count.';

  const fmtRC = n => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div className="drill-result">
      <div className={`drill-result__hero drill-result__hero--${isExact ? 'pass' : 'fail'}`}>
        <div className="drill-result__hero-icon">
          {isExact ? <Check size={26} /> : <span className="drill-result__x">✕</span>}
        </div>
        <div className="drill-result__hero-label">{isExact ? 'Perfect Count!' : `Off by ${absDiff}`}</div>
        <div className="drill-result__explanation">{explanation}</div>
      </div>

      <div className="drill-count-summary">
        <div className="drill-count-summary__main">
          <div className="drill-count-summary__eyebrow">Correct Running Count</div>
          <div className={`drill-count-summary__rc ${correctCount > 0 ? 'drill-count-summary__rc--pos' : correctCount < 0 ? 'drill-count-summary__rc--neg' : ''}`}>
            {fmtRC(correctCount)}
          </div>
        </div>
        <div className="drill-count-summary__row">
          <div className="drill-count-summary__cell">
            <div className="drill-count-summary__cell-lbl">Your Answer</div>
            <div className={`drill-count-summary__cell-val ${isExact ? 'drill-count-summary__cell-val--green' : 'drill-count-summary__cell-val--red'}`}>
              {fmtRC(answer)}
            </div>
          </div>
          <div className="drill-count-summary__divider" aria-hidden />
          <div className="drill-count-summary__cell">
            <div className="drill-count-summary__cell-lbl">Off by</div>
            <div className={`drill-count-summary__cell-val ${absDiff === 0 ? 'drill-count-summary__cell-val--green' : absDiff === 1 ? 'drill-count-summary__cell-val--gold' : 'drill-count-summary__cell-val--red'}`}>
              {absDiff}
            </div>
          </div>
          <div className="drill-count-summary__divider" aria-hidden />
          <div className="drill-count-summary__cell">
            <div className="drill-count-summary__cell-lbl">True Count</div>
            <div className={`drill-count-summary__cell-val ${trueCount >= 2 ? 'drill-count-summary__cell-val--green' : trueCount <= -2 ? 'drill-count-summary__cell-val--red' : 'drill-count-summary__cell-val--gold'}`}>
              {trueCountStr}
            </div>
          </div>
        </div>
      </div>

      <div className="drill-result__metrics">
        <DrillResultMetric
          label="Accuracy"
          value={`${accuracy}%`}
          accent={accuracy === 100 ? 'green' : accuracy >= 80 ? 'gold' : 'red'}
        />
        <DrillResultMetric label="Cards Tracked" value={cardCount} />
        <DrillResultMetric label="Time" value={`${secs}s`} />
      </div>

      <div className="drill-result__actions">
        <button className="drill-retry-btn" onClick={onRetry} type="button">
          <RefreshCw size={14} />
          <span>Try Again</span>
        </button>
        <button className="ghost-btn" onClick={onReset} type="button">
          Change Settings
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training — main tab
// ---------------------------------------------------------------------------
function TrainingTab({ soundEnabled }) {
  const [phase, setPhase]           = useState('setup');
  const [config, setConfig]         = useState(null);
  const [drillCards, setDrillCards] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [startTime, setStartTime]   = useState(0);
  const [elapsedMs, setElapsedMs]   = useState(0);
  const [result, setResult]         = useState(null);
  const [stats, setStats]           = useState(loadTrainingStats);
  const soundRef = useRef(soundEnabled);
  useEffect(() => { soundRef.current = soundEnabled; }, [soundEnabled]);

  const correctCount = useMemo(
    () => drillCards.reduce((s, c) => s + c.delta, 0),
    [drillCards]
  );

  const handleStart = useCallback((cfg) => {
    const shoe = buildShoe(cfg.deckCount);
    const cards = shoe.slice(0, cfg.cardCount);
    setConfig(cfg);
    setDrillCards(cards);
    setCurrentIdx(0);
    setStartTime(Date.now());
    setElapsedMs(0);
    setResult(null);
    setPhase('running');
  }, []);

  // Play tick sound when a new card appears
  useEffect(() => {
    if (phase !== 'running') return;
    if (soundRef.current) playSound('tick');
  }, [phase, currentIdx]);

  // Auto-advance cards
  useEffect(() => {
    if (phase !== 'running' || !config) return;
    const ms = DRILL_SPEEDS.find(s => s.id === config.speed)?.ms ?? 1200;
    const timer = setTimeout(() => {
      const next = currentIdx + 1;
      if (next >= drillCards.length) {
        setElapsedMs(Date.now() - startTime);
        setPhase('input');
      } else {
        setCurrentIdx(next);
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [phase, currentIdx, config, drillCards.length, startTime]);

  const handleSubmit = useCallback((raw) => {
    const answer = parseInt(raw, 10);
    if (isNaN(answer)) return;
    const isExact = answer === correctCount;
    const diff = Math.abs(answer - correctCount);
    const accuracy = Math.max(0, Math.round(100 - diff * 5));

    setStats(prev => {
      const newStreak = isExact ? prev.currentStreak + 1 : 0;
      const next = {
        drillsCompleted: prev.drillsCompleted + 1,
        bestStreak:      Math.max(prev.bestStreak, newStreak),
        bestAccuracy:    Math.max(prev.bestAccuracy, accuracy),
        currentStreak:   newStreak,
      };
      saveTrainingStats(next);
      return next;
    });

    appendDrillHistory({
      id:           Date.now(),
      date:         new Date().toISOString(),
      speed:        config.speed,
      deckCount:    config.deckCount,
      cardCount:    drillCards.length,
      correctCount,
      answer,
      error:        diff,
      accuracy,
      elapsedMs,
      isExact,
    });

    setResult({ answer, correctCount, accuracy, isExact, elapsedMs, cardCount: drillCards.length, deckCount: config.deckCount });
    setPhase('result');
  }, [correctCount, elapsedMs, drillCards.length]);

  if (phase === 'setup') {
    return (
      <div className="training-wrap">
        <DrillSetup stats={stats} onStart={handleStart} />
      </div>
    );
  }

  if (phase === 'running') {
    return (
      <div className="training-wrap training-wrap--running">
        <DrillRunner cards={drillCards} currentIdx={currentIdx} />
      </div>
    );
  }

  if (phase === 'input') {
    return (
      <div className="training-wrap">
        <DrillInputPhase cardCount={drillCards.length} onSubmit={handleSubmit} />
      </div>
    );
  }

  if (phase === 'result' && result) {
    return (
      <div className="training-wrap">
        <DrillResult
          result={result}
          onRetry={() => handleStart(config)}
          onReset={() => setPhase('setup')}
        />
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Analytics — components
// ---------------------------------------------------------------------------
function AnalyticsMetric({ label, value, suffix = '', tone = 'default' }) {
  return (
    <div className={`an-metric an-metric--${tone}`}>
      <div className="an-metric__val">
        {value}
        {suffix && <span className="an-metric__sfx">{suffix}</span>}
      </div>
      <div className="an-metric__lbl">{label}</div>
    </div>
  );
}

function PerformanceTrend({ accuracyPoints, errorPoints, count }) {
  const safePts = (pts) => (pts.length < 2 ? [...pts, ...pts] : pts);
  return (
    <div className="an-trend panel">
      <div className="panel__title-row">
        <div className="panel__title">Performance Trend</div>
        <div className="panel__sub">Last {count} drills · oldest → newest</div>
      </div>
      <div className="an-trend__charts">
        <div className="an-trend__chart">
          <div className="an-trend__chart-hd">
            <span className="an-trend__chart-lbl an-trend__chart-lbl--green">Accuracy</span>
            <span className="an-trend__chart-range">
              {Math.min(...accuracyPoints)}% – {Math.max(...accuracyPoints)}%
            </span>
          </div>
          <div className="an-trend__spark">
            <Sparkline points={safePts(accuracyPoints)} color="#10b981" width={400} height={72} />
          </div>
        </div>
        <div className="an-trend__chart">
          <div className="an-trend__chart-hd">
            <span className="an-trend__chart-lbl an-trend__chart-lbl--amber">Error (drift)</span>
            <span className="an-trend__chart-range">
              ±{Math.min(...errorPoints)} – ±{Math.max(...errorPoints)} pts
            </span>
          </div>
          <div className="an-trend__spark">
            <Sparkline
              points={safePts(errorPoints.map(v => Math.max(v, 0)))}
              color="#f59e0b"
              width={400}
              height={72}
              filled={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightSection({ insights }) {
  return (
    <div className="an-insights">
      <div className="an-insights__hd">Insights</div>
      <div className="an-insights__list">
        {insights.map((ins, i) => (
          <div className={`an-insight an-insight--${ins.tone}`} key={i}>
            <div className="an-insight__dot" />
            <div className="an-insight__text">{ins.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrillHistoryTable({ history }) {
  const fmtDate = (iso) => {
    try {
      const d = new Date(iso);
      return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      );
    } catch { return '—'; }
  };
  const fmtRC = (n) => (n >= 0 ? `+${n}` : `${n}`);

  return (
    <div className="an-hist panel">
      <div className="panel__title-row">
        <div className="panel__title">Recent Drills</div>
        <div className="panel__sub">{history.length} entries</div>
      </div>
      <div className="an-hist__scroll">
        <table className="an-hist-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Speed</th>
              <th>Decks</th>
              <th>Cards</th>
              <th>Correct RC</th>
              <th>Your Answer</th>
              <th>Error</th>
              <th>Accuracy</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {history.map((d, i) => {
              const accTone = d.accuracy === 100 ? 'green' : d.accuracy >= 80 ? 'gold' : 'red';
              const errTone = d.error === 0 ? 'green' : d.error <= 2 ? 'gold' : 'red';
              return (
                <tr key={d.id || i} className={d.isExact ? 'an-hist-row--exact' : ''}>
                  <td className="an-hist__date">{fmtDate(d.date)}</td>
                  <td className="an-hist__speed">
                    {d.speed ? d.speed.charAt(0).toUpperCase() + d.speed.slice(1) : '—'}
                  </td>
                  <td>{d.deckCount}</td>
                  <td>{d.cardCount}</td>
                  <td className="an-hist__rc">{fmtRC(d.correctCount)}</td>
                  <td className={`an-hist__ans ${d.isExact ? 'an-hist__ans--exact' : ''}`}>
                    {fmtRC(d.answer)}
                  </td>
                  <td className={`an-hist__err an-hist__err--${errTone}`}>±{d.error}</td>
                  <td className={`an-hist__acc an-hist__acc--${accTone}`}>{d.accuracy}%</td>
                  <td className="an-hist__time">{(d.elapsedMs / 1000).toFixed(1)}s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics — Performance Matrix
// ---------------------------------------------------------------------------
function PerformanceMatrix({ matrix }) {
  const { cells, speeds, sizes } = matrix;
  const getCellTone = (acc) => {
    if (acc === null) return 'empty';
    if (acc >= 85) return 'green';
    if (acc >= 65) return 'gold';
    return 'red';
  };
  return (
    <div className="perf-matrix panel">
      <div className="panel__title-row">
        <div>
          <div className="panel__title">Performance Matrix</div>
          <div className="panel__sub">Avg accuracy · Speed × Cards</div>
        </div>
      </div>
      <div className="perf-matrix__grid">
        <div className="perf-matrix__corner" />
        {sizes.map(sz => (
          <div key={sz} className="perf-matrix__col-hd">{sz} cards</div>
        ))}
        {speeds.map(sp => (
          <React.Fragment key={sp}>
            <div className="perf-matrix__row-hd">{sp.charAt(0).toUpperCase() + sp.slice(1)}</div>
            {sizes.map(sz => {
              const cell = cells[`${sp}-${sz}`];
              const tone = getCellTone(cell.avgAccuracy);
              return (
                <div key={`${sp}-${sz}`} className={`perf-matrix__cell perf-matrix__cell--${tone}`}>
                  {cell.avgAccuracy !== null ? (
                    <>
                      <div className="perf-matrix__cell-acc">{cell.avgAccuracy}%</div>
                      <div className="perf-matrix__cell-n">{cell.count}×</div>
                    </>
                  ) : (
                    <div className="perf-matrix__cell-dash">—</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics — Drift Analysis
// ---------------------------------------------------------------------------
function DriftPanel({ drift }) {
  if (!drift) {
    return (
      <div className="drift-panel panel">
        <div className="panel__title-row">
          <div className="panel__title">Drift Analysis</div>
          <div className="panel__sub">Signed error pattern</div>
        </div>
        <div className="drift-panel__need-data">Complete 3+ drills to unlock.</div>
      </div>
    );
  }
  const { avgDrift, direction, bySpeed } = drift;
  const tone = direction === 'balanced' ? 'green' : 'amber';
  const dirLabel = direction === 'over'
    ? 'Overcounting'
    : direction === 'under'
    ? 'Undercounting'
    : 'Balanced';
  const desc = direction === 'over'
    ? `You tend to overcount by +${avgDrift.toFixed(1)} on average.`
    : direction === 'under'
    ? `You tend to undercount by ${Math.abs(avgDrift).toFixed(1)} on average.`
    : 'Your drift is minimal — well-balanced counting.';
  const speedKeys = ['slow', 'medium', 'fast'].filter(s => bySpeed[s]);
  return (
    <div className="drift-panel panel">
      <div className="panel__title-row">
        <div className="panel__title">Drift Analysis</div>
        <div className={`drift-panel__badge drift-panel__badge--${tone}`}>{dirLabel}</div>
      </div>
      <div className={`drift-panel__main drift-panel__main--${tone}`}>
        <div className="drift-panel__num">
          {avgDrift >= 0 ? '+' : ''}{avgDrift.toFixed(1)}
        </div>
        <div className="drift-panel__desc">{desc}</div>
      </div>
      {speedKeys.length >= 2 && (
        <div className="drift-panel__breakdown">
          {speedKeys.map(sp => {
            const d = bySpeed[sp].avgDrift;
            const dTone = Math.abs(d) > 0.5 ? 'warn' : 'ok';
            return (
              <div key={sp} className="drift-panel__item">
                <span className="drift-panel__item-speed">{sp.charAt(0).toUpperCase() + sp.slice(1)}</span>
                <span className={`drift-panel__item-val drift-panel__item-val--${dTone}`}>
                  {d >= 0 ? '+' : ''}{d.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics — Consistency Score
// ---------------------------------------------------------------------------
function ConsistencyPanel({ consistency }) {
  if (!consistency) {
    return (
      <div className="consistency-panel panel">
        <div className="panel__title-row">
          <div className="panel__title">Consistency</div>
        </div>
        <div className="consistency-panel__need-data">Complete 3+ drills to unlock.</div>
      </div>
    );
  }
  const { score, stdDev, label, tone } = consistency;
  return (
    <div className="consistency-panel panel">
      <div className="panel__title-row">
        <div className="panel__title">Consistency</div>
        <div className={`consistency-panel__badge consistency-panel__badge--${tone}`}>{label}</div>
      </div>
      <div className="consistency-panel__score-row">
        <span className={`consistency-panel__score consistency-panel__score--${tone}`}>{score}</span>
        <span className="consistency-panel__denom">/100</span>
      </div>
      <div className="consistency-panel__track">
        <div
          className={`consistency-panel__fill consistency-panel__fill--${tone}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="consistency-panel__meta">σ {stdDev} — stability across all drills</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics — Recent Trend
// ---------------------------------------------------------------------------
function RecentTrendRow({ history }) {
  if (history.length < 2) return null;
  const recent = history.slice(0, Math.min(8, history.length));
  const points = [...recent].reverse().map(d => d.accuracy);
  const recentAvg = history.slice(0, 5).reduce((s, d) => s + d.accuracy, 0) / Math.min(5, history.length);
  const priorAvg  = history.length >= 6
    ? history.slice(5, 10).reduce((s, d) => s + d.accuracy, 0) / Math.min(5, history.length - 5)
    : null;
  const diff = priorAvg !== null ? recentAvg - priorAvg : null;
  const trendDir = diff === null ? 'neutral' : diff >= 3 ? 'up' : diff <= -3 ? 'down' : 'neutral';
  const trendColor = trendDir === 'up' ? '#10b981' : trendDir === 'down' ? '#f43f5e' : '#4fa8cc';

  const recentDrifts = history
    .slice(0, 5)
    .filter(d => typeof d.answer === 'number' && typeof d.correctCount === 'number')
    .map(d => d.answer - d.correctCount);
  const recentDrift = recentDrifts.length > 0
    ? recentDrifts.reduce((s, v) => s + v, 0) / recentDrifts.length
    : null;

  return (
    <div className="recent-trend panel">
      <div className="panel__title-row">
        <div className="panel__title">Recent Trend</div>
        <div className="panel__sub">Last {recent.length} drills</div>
      </div>
      <div className="recent-trend__body">
        <div className="recent-trend__spark">
          <Sparkline points={points} color={trendColor} height={52} width={260} />
        </div>
        <div className="recent-trend__stats">
          <div className="recent-trend__stat">
            <div className={`recent-trend__stat-val recent-trend__stat-val--${trendDir === 'up' ? 'green' : trendDir === 'down' ? 'red' : 'gold'}`}>
              {Math.round(recentAvg)}%
            </div>
            <div className="recent-trend__stat-lbl">
              {trendDir === 'up' && diff !== null ? `↑ ${diff.toFixed(0)}% vs prior` : trendDir === 'down' && diff !== null ? `↓ ${Math.abs(diff).toFixed(0)}% vs prior` : 'Rolling accuracy'}
            </div>
          </div>
          {recentDrift !== null && (
            <div className="recent-trend__stat">
              <div className={`recent-trend__stat-val ${Math.abs(recentDrift) > 0.5 ? 'recent-trend__stat-val--amber' : 'recent-trend__stat-val--green'}`}>
                {recentDrift >= 0 ? '+' : ''}{recentDrift.toFixed(1)}
              </div>
              <div className="recent-trend__stat-lbl">Recent drift</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalyticsTab({ onGoToTraining }) {
  const [history, setHistory]           = useState([]);
  const [summaryStats, setSummaryStats] = useState(null);

  useEffect(() => {
    setHistory(loadDrillHistory());
    setSummaryStats(loadTrainingStats());
  }, []);

  if (history.length === 0) {
    return (
      <div className="analytics-empty">
        <div className="analytics-empty__icon"><Activity size={36} /></div>
        <div className="analytics-empty__title">No drill data yet</div>
        <div className="analytics-empty__sub">
          Complete a Running Count Sprint to unlock analytics.
        </div>
        <button className="drill-start-btn" onClick={onGoToTraining} type="button">
          <Zap size={16} />
          <span>Start Training</span>
        </button>
      </div>
    );
  }

  const totalDrills   = history.length;
  const bestAccuracy  = Math.max(...history.map(d => d.accuracy));
  const avgAccuracy   = Math.round(history.reduce((s, d) => s + d.accuracy, 0) / totalDrills);
  const avgError      = (history.reduce((s, d) => s + d.error, 0) / totalDrills).toFixed(1);
  const fastestMs     = Math.min(...history.map(d => d.elapsedMs));
  const totalCards    = history.reduce((s, d) => s + d.cardCount, 0);
  const currentStreak = summaryStats?.currentStreak ?? 0;
  const bestStreak    = summaryStats?.bestStreak ?? 0;

  const recentForChart  = history.slice(0, 20).reverse();
  const accuracyPoints  = recentForChart.map(d => d.accuracy);
  const errorPoints     = recentForChart.map(d => d.error);

  const insights     = computeInsights(history);
  const matrix       = computePerformanceMatrix(history);
  const drift        = computeDriftAnalysis(history);
  const consistency  = computeConsistencyScore(history);

  return (
    <div className="analytics-wrap">
      <div className="analytics-hd">
        <div className="analytics-hd__eyebrow">Performance Dashboard</div>
        <div className="analytics-hd__title">Training Analytics</div>
        <div className="analytics-hd__sub">
          {totalDrills} {totalDrills === 1 ? 'drill' : 'drills'} completed &middot;{' '}
          {totalCards.toLocaleString()} cards tracked
        </div>
      </div>

      <div className="analytics-metrics-grid">
        <AnalyticsMetric label="Drills Completed" value={totalDrills} />
        <AnalyticsMetric
          label="Best Accuracy"
          value={`${bestAccuracy}%`}
          tone={bestAccuracy === 100 ? 'green' : bestAccuracy >= 80 ? 'gold' : 'default'}
        />
        <AnalyticsMetric
          label="Avg Accuracy"
          value={`${avgAccuracy}%`}
          tone={avgAccuracy >= 80 ? 'green' : avgAccuracy >= 60 ? 'gold' : 'red'}
        />
        <AnalyticsMetric
          label="Current Streak"
          value={currentStreak}
          suffix=" ✓"
          tone={currentStreak > 0 ? 'green' : 'default'}
        />
        <AnalyticsMetric label="Best Streak" value={bestStreak} suffix=" ✓" />
        <AnalyticsMetric
          label="Avg Error"
          value={`±${avgError}`}
          tone={parseFloat(avgError) <= 1 ? 'green' : parseFloat(avgError) <= 3 ? 'gold' : 'red'}
        />
        <AnalyticsMetric
          label="Fastest Time"
          value={fastestMs > 0 ? `${(fastestMs / 1000).toFixed(1)}s` : '—'}
        />
        <AnalyticsMetric label="Total Cards" value={totalCards.toLocaleString()} />
      </div>

      <div className="analytics-intel-row">
        <PerformanceMatrix matrix={matrix} />
        <div className="analytics-intel-side">
          <ConsistencyPanel consistency={consistency} />
          <DriftPanel drift={drift} />
        </div>
      </div>

      <RecentTrendRow history={history} />

      {accuracyPoints.length >= 2 && (
        <PerformanceTrend
          accuracyPoints={accuracyPoints}
          errorPoints={errorPoints}
          count={recentForChart.length}
        />
      )}

      <InsightSection insights={insights} />

      <DrillHistoryTable history={history.slice(0, 20)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
function App() {
  const initial = loadState();
  const [decks, setDecks]           = useState(initial?.decks ?? 6);
  const [log, setLog]               = useState(initial?.log ?? []);
  const [cardCounts, setCardCounts] = useState(initial?.cardCounts ?? {});
  const [activeTab, setActiveTab]   = useState('live');
  const [mode, setMode]             = useState(initial?.mode ?? 'full');
  const [showPro, setShowPro]       = useState(false);
  const [lastValue, setLastValue]   = useState(null);
  const [keyFlash, setKeyFlash]     = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(initial?.soundEnabled ?? false);

  const [deckConfirm, setDeckConfirm] = useState(null);

  const idRef = useRef(initial?.lastId ?? 0);
  const prevRCRef = useRef(initial?.log?.[0]?.rc ?? 0);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const decksRef = useRef(decks);
  const cardCountsRef = useRef(cardCounts);
  const totalCardsRef = useRef(log.length);
  const activeTabRef = useRef(activeTab);
  useEffect(() => { decksRef.current = decks; }, [decks]);
  useEffect(() => { cardCountsRef.current = cardCounts; }, [cardCounts]);
  useEffect(() => { totalCardsRef.current = log.length; }, [log.length]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const totalCards = log.length;
  const runningCount = log.length ? log[0].rc : 0;
  const totalShoeCards = decks * 52;
  const isShoeComplete = totalCards >= totalShoeCards;
  const decksRemaining = Math.max(0.01, (totalShoeCards - totalCards) / 52);
  const trueCount = runningCount / decksRemaining;
  const mood = getMood(trueCount);

  useEffect(() => {
    saveState({ decks, log, cardCounts, mode, lastId: idRef.current, soundEnabled });
  }, [decks, log, cardCounts, mode, soundEnabled]);

  const stats = useMemo(() => {
    let high = 0, low = 0, mid = 0;
    for (const e of log) {
      if (e.delta === 1) low++;
      else if (e.delta === -1) high++;
      else mid++;
    }
    return { total: log.length, high, low, mid };
  }, [log]);

  const handleDeal = useCallback((value, delta) => {
    if ((cardCountsRef.current[value] || 0) >= decksRef.current * 4) return;
    if (totalCardsRef.current >= decksRef.current * 52) return;
    if (soundEnabledRef.current) playSound(delta === 1 ? 'pos' : delta === -1 ? 'neg' : 'mid');
    setLastValue(value);
    setTimeout(() => setLastValue(null), 260);
    setLog(prevLog => {
      const prevRC = prevLog.length ? prevLog[0].rc : 0;
      prevRCRef.current = prevRC;
      idRef.current += 1;
      return [{ id: idRef.current, idx: prevLog.length + 1, value, delta, rc: prevRC + delta }, ...prevLog];
    });
    setCardCounts(c => ({ ...c, [value]: (c[value] || 0) + 1 }));
  }, []);

  const handleRapid = useCallback((delta) => {
    if (totalCardsRef.current >= decksRef.current * 52) return;
    if (soundEnabledRef.current) playSound(delta === 1 ? 'pos' : delta === -1 ? 'neg' : 'mid');
    const label = delta === 1 ? 'L' : delta === -1 ? 'H' : 'M';
    setLog(prevLog => {
      const prevRC = prevLog.length ? prevLog[0].rc : 0;
      prevRCRef.current = prevRC;
      idRef.current += 1;
      return [{ id: idRef.current, idx: prevLog.length + 1, value: label, delta, rc: prevRC + delta }, ...prevLog];
    });
  }, []);

  const handleUndo = useCallback(() => {
    setLog(prevLog => {
      if (!prevLog.length) return prevLog;
      const removed = prevLog[0];
      prevRCRef.current = prevLog.length > 1 ? prevLog[1].rc : 0;
      const isRankEntry = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].includes(removed.value);
      if (isRankEntry) {
        setCardCounts(c => {
          const n = { ...c };
          n[removed.value] = Math.max(0, (n[removed.value] || 0) - 1);
          if (n[removed.value] === 0) delete n[removed.value];
          return n;
        });
      }
      return prevLog.slice(1);
    });
    if (soundEnabledRef.current) playSound('undo');
  }, []);

  const handleReset = useCallback(() => {
    setLog([]);
    setCardCounts({});
    prevRCRef.current = 0;
    idRef.current = 0;
    if (soundEnabledRef.current) playSound('reset');
  }, []);

  const handleDeckChange = useCallback((n) => {
    if (n === decksRef.current) return;
    const cur = totalCardsRef.current;
    if (cur === 0) { setDecks(n); return; }
    const invalid =
      cur > n * 52 ||
      Object.entries(cardCountsRef.current).some(([, count]) => count > n * 4);
    if (invalid) {
      setDeckConfirm(n);
    } else {
      setDecks(n);
    }
  }, []);

  const confirmDeckChange = useCallback(() => {
    const n = deckConfirm;
    if (n == null) return;
    setDeckConfirm(null);
    setLog([]);
    setCardCounts({});
    prevRCRef.current = 0;
    idRef.current = 0;
    setDecks(n);
    if (soundEnabledRef.current) playSound('reset');
  }, [deckConfirm]);

  useEffect(() => {
    const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown']);
    const onKey = (e) => {
      if (activeTabRef.current !== 'live') return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const upper = typeof k === 'string' ? k.toUpperCase() : '';

      if (SCROLL_KEYS.has(k)) e.preventDefault();
      if (upper === 'U') { handleUndo(); return; }
      if (upper === 'R') { handleReset(); return; }
      if (k === 'Escape') { setShowPro(false); setDeckConfirm(null); return; }

      if (mode === 'quick') {
        if (upper === 'Q') { handleRapid(1);  setKeyFlash(1);  setTimeout(() => setKeyFlash(null), 200); return; }
        if (upper === 'W') { handleRapid(0);  setKeyFlash(0);  setTimeout(() => setKeyFlash(null), 200); return; }
        if (upper === 'E') { handleRapid(-1); setKeyFlash(-1); setTimeout(() => setKeyFlash(null), 200); return; }
        return;
      }

      if (/^[2-9]$/.test(k)) {
        const card = CARD_VALUES.find(c => c.v === k);
        if (card) handleDeal(card.v, card.delta);
        return;
      }
      if (upper === 'T') { handleDeal('10', -1); return; }
      if (upper === 'J') { handleDeal('J', -1);  return; }
      if (upper === 'Q') { handleDeal('Q', -1);  return; }
      if (upper === 'K') { handleDeal('K', -1);  return; }
      if (upper === 'A') { handleDeal('A', -1);  return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleDeal, handleRapid, handleUndo, handleReset, mode]);

  const lowCards  = CARD_VALUES.slice(0, 5);
  const midCards  = CARD_VALUES.slice(5, 8);
  const highCards = CARD_VALUES.slice(8);

  return (
    <div className={`app ${mood} app--${mode}`}>
      <div className="app__atmosphere" aria-hidden />

      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">
            <svg className="brand__icon" viewBox="0 0 22 18" aria-hidden="true" fill="currentColor">
              <rect x="0" y="10" width="5" height="8" rx="1.5" opacity="0.45"/>
              <rect x="8.5" y="5" width="5" height="13" rx="1.5" opacity="0.70"/>
              <rect x="17" y="0" width="5" height="18" rx="1.5" opacity="1"/>
            </svg>
          </div>
          <div className="brand__text">
            <div className="brand__name">Strategy Lab</div>
            <div className="brand__sub">Analytical Training Platform</div>
          </div>
        </div>
        <div className="topbar__actions">
          <div className="status-pill">
            <span className="status-pill__dot" />
            <span>{mode === 'quick' ? 'Quick Count' : 'Full Tracking'}</span>
          </div>
          <button className="ghost-btn" onClick={handleReset} type="button">
            <RefreshCw size={13} />
            <span>Reset Session</span>
          </button>
        </div>
      </header>

      <NavTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'live' && (
        <main className="grid">
          <section className="col col--main">
            <ModeSwitch mode={mode} onChange={setMode} />

            <HeroCount
              runningCount={runningCount}
              trueCount={trueCount}
              decksRemaining={decksRemaining}
              totalCards={totalCards}
              prevRC={prevRCRef.current}
            />
            <RecommendationBar trueCount={trueCount} />

            {mode === 'quick' ? (
              <Panel tone="quick" className="quick-panel">
                <div className="quick-panel__head">
                  <div>
                    <div className="panel__title">Quick Count</div>
                    <div className="panel__sub">Tap as cards are dealt — category input only</div>
                  </div>
                  <button
                    className={`undo-btn ${log.length === 0 ? 'undo-btn--disabled' : ''}`}
                    onClick={handleUndo}
                    disabled={log.length === 0}
                    type="button"
                  >
                    <RotateCcw size={12} />
                    <span>Undo</span>
                  </button>
                </div>
                <div className="qci-sticky">
                  <QuickInput onRapid={handleRapid} keyFlash={keyFlash} disabled={isShoeComplete} />
                </div>
                <ShortcutBar mode="quick" />
              </Panel>
            ) : (
              <Panel tone="primary" className="grid-panel">
                <div className="grid-panel__head">
                  <div>
                    <div className="panel__title">Card Tracker</div>
                    <div className="panel__sub">Tap each rank as it is dealt from the shoe</div>
                  </div>
                  <button
                    className={`undo-btn ${log.length === 0 ? 'undo-btn--disabled' : ''}`}
                    onClick={handleUndo}
                    disabled={log.length === 0}
                    type="button"
                  >
                    <RotateCcw size={12} />
                    <span>Undo</span>
                  </button>
                </div>

                <ChipGroup
                  title="Low Cards" sub="+1" accent="green" decks={decks}
                  cards={lowCards} cardCounts={cardCounts}
                  onDeal={handleDeal} lastValue={lastValue}
                />
                <ChipGroup
                  title="Mid Cards" sub="0" accent="neutral" decks={decks}
                  cards={midCards} cardCounts={cardCounts}
                  onDeal={handleDeal} lastValue={lastValue}
                />
                <ChipGroup
                  title="High Cards" sub="-1" accent="red" decks={decks}
                  cards={highCards} cardCounts={cardCounts}
                  onDeal={handleDeal} lastValue={lastValue}
                />

                <QuickAddStrip onRapid={handleRapid} disabled={isShoeComplete} />
                <ShortcutBar mode="full" />
              </Panel>
            )}

            {mode === 'full' && (
              <CompositionPanel
                cardCounts={cardCounts}
                decks={decks}
                totalCards={totalCards}
              />
            )}
          </section>

          <aside className="col col--side">
            <SettingsPanel
              decks={decks} onDeckChange={handleDeckChange}
              soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
            />
            <StatsPanel stats={stats} />
            <ProToolsPanel onUpgrade={() => setShowPro(true)} />
            <LogPanel log={log} />
          </aside>
        </main>
      )}

      {activeTab === 'training' && (
        <main className="grid grid--single">
          <TrainingTab soundEnabled={soundEnabled} />
        </main>
      )}

      {activeTab === 'analytics' && (
        <main className="grid grid--single">
          <AnalyticsTab onGoToTraining={() => setActiveTab('training')} />
        </main>
      )}

      {activeTab !== 'live' && activeTab !== 'training' && activeTab !== 'analytics' && (
        <main className="grid grid--single">
          <LockedTab tabId={activeTab} onUpgrade={() => setShowPro(true)} />
        </main>
      )}

      <DeckChangeModal
        targetDecks={deckConfirm}
        onCancel={() => setDeckConfirm(null)}
        onConfirm={confirmDeckChange}
      />
      <ProModal open={showPro} onClose={() => setShowPro(false)} />
    </div>
  );
}

export default App;
