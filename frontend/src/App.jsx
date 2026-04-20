import { useState, useEffect, useCallback, useRef } from 'react'

// ─── API ──────────────────────────────────────────────────────────────────────
const API = '/api/v1'

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtNum   = (v, d = 2) => (v == null || isNaN(Number(v)) ? 'N/A' : Number(v).toFixed(d))
const fmtINR   = (v) => v == null ? 'N/A' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtCap   = (v) => {
  if (v == null) return 'N/A'
  const n = Number(v)
  if (n >= 1e12) return `₹${(n / 1e12).toFixed(2)}L Cr`
  if (n >= 1e9)  return `₹${(n / 1e7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} Cr`
  return `₹${n.toFixed(2)} Cr`
}
const fmtPct   = (v) => {
  if (v == null || isNaN(Number(v))) return 'N/A'
  const n = Number(v)
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
const fmtDate  = (d) => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}
const fmtLarge = (v) => v == null ? 'N/A' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

// ─── Color helpers ────────────────────────────────────────────────────────────
const positiveClass = (v) => Number(v) >= 0 ? 'text-[#00B386]' : 'text-[#EF4444]'
const positiveHex   = (v) => Number(v) >= 0 ? '#00B386' : '#EF4444'

const sentimentHex = (label) => {
  if (!label) return '#F59E0B'
  const l = label.toLowerCase()
  if (l.includes('bull')) return '#00B386'
  if (l.includes('bear')) return '#EF4444'
  return '#F59E0B'
}

const verdictHex = (v) => {
  if (!v) return '#F59E0B'
  const l = v.toLowerCase()
  if (l.includes('strong buy') || (l.includes('bull') && !l.includes('weak'))) return '#00B386'
  if (l.includes('bear') || l.includes('sell') || l.includes('negative'))      return '#EF4444'
  return '#F59E0B'
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, className = 'w-4 h-4', stroke = 2 }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={stroke} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
)
const SearchIcon = () => <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-5 h-5" />
const ArrowUp    = () => <Icon d="M5 15l7-7 7 7" className="w-3 h-3" stroke={2.5} />
const ArrowDown  = () => <Icon d="M19 9l-7 7-7-7" className="w-3 h-3" stroke={2.5} />
const BackIcon   = () => <Icon d="M15 19l-7-7 7-7" className="w-4 h-4" />
const WarnIcon   = () => <Icon d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" className="w-4 h-4 shrink-0" />
const CheckIcon  = () => <Icon d="M5 13l4 4L19 7" className="w-4 h-4 shrink-0" />
const PrintIcon  = () => <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" className="w-4 h-4" />
const ChevronDown = () => <Icon d="M19 9l-7 7-7-7" className="w-4 h-4" />
const ChevronUp   = () => <Icon d="M5 15l7-7 7 7" className="w-4 h-4" />

// ─── UI Primitives ────────────────────────────────────────────────────────────
const Card = ({ children, className = '', style }) => (
  <div
    className={`bg-white border border-[#E5E7EB] rounded-xl ${className}`}
    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)', ...style }}>
    {children}
  </div>
)

const SectionLabel = ({ children }) => (
  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1A1A2E] mb-3">{children}</p>
)

const StatRow = ({ label, value, valueColor = '#1A1A2E' }) => (
  <div className="flex justify-between items-center py-2.5 border-b border-[#F3F4F6] last:border-0">
    <span className="text-[13px] text-[#6B7280]">{label}</span>
    <span className="text-[13px] font-semibold" style={{ color: valueColor }}>{value ?? 'N/A'}</span>
  </div>
)

// ─── Plotly Light Layout ──────────────────────────────────────────────────────
const lightLayout = {
  paper_bgcolor: 'transparent',
  plot_bgcolor:  'transparent',
  font: { color: '#6B7280', family: 'Inter' },
  xaxis: {
    gridcolor: '#F3F4F6', linecolor: '#E5E7EB', zeroline: false,
    tickfont: { color: '#9CA3AF', size: 10 },
  },
  yaxis: {
    gridcolor: '#F3F4F6', linecolor: '#E5E7EB', zeroline: false,
    tickfont: { color: '#9CA3AF', size: 10 },
  },
  margin: { t: 8, b: 36, l: 56, r: 16 },
  showlegend: true,
  legend: { bgcolor: 'transparent', font: { color: '#6B7280', size: 10 } },
}

// ─── Candlestick Chart ────────────────────────────────────────────────────────
function CandlestickChart({ ticker }) {
  const ref = useRef(null)
  const [raw, setRaw]     = useState(null)
  const [range, setRange] = useState('6M')

  useEffect(() => {
    if (!ticker) return
    fetch(`${API}/chart/${ticker}`)
      .then(r => r.json())
      .then(setRaw)
      .catch(console.error)
  }, [ticker])

  useEffect(() => {
    if (!raw || !ref.current) return

    const allDates = raw.dates || []
    const cutoff   = new Date()
    if      (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1)
    else if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3)
    else                      cutoff.setMonth(cutoff.getMonth() - 6)

    const mask = allDates.map(d => new Date(d) >= cutoff)
    const filt = (arr) => (arr || []).filter((_, i) => mask[i])

    const dates  = filt(raw.dates)
    const traces = [
      {
        type: 'candlestick',
        x: dates,
        open: filt(raw.open), high: filt(raw.high), low: filt(raw.low), close: filt(raw.close),
        name: ticker,
        increasing: { line: { color: '#00B386', width: 1 }, fillcolor: '#00B386' },
        decreasing: { line: { color: '#EF4444', width: 1 }, fillcolor: '#EF4444' },
        whiskerwidth: 0.3,
        hoverinfo: 'x+y',
      },
      {
        type: 'scatter', mode: 'lines',
        x: dates, y: filt(raw.ma20),
        name: 'MA 20', connectgaps: true,
        line: { color: '#F59E0B', width: 1.5 },
        hoverinfo: 'skip',
      },
      {
        type: 'scatter', mode: 'lines',
        x: dates, y: filt(raw.ma50),
        name: 'MA 50', connectgaps: true,
        line: { color: '#5367FF', width: 1.5 },
        hoverinfo: 'skip',
      },
    ]

    const layout = {
      ...lightLayout,
      height: 310,
      xaxis: { ...lightLayout.xaxis, rangeslider: { visible: false }, type: 'category', nticks: 6 },
      yaxis: { ...lightLayout.yaxis, side: 'right', tickprefix: '₹', autorange: true },
      legend: { ...lightLayout.legend, x: 0, y: 1.06, orientation: 'h' },
    }

    import('plotly.js-dist-min').then(P => {
      P.react(ref.current, traces, layout, { displayModeBar: false, responsive: true })
    })
  }, [raw, range, ticker])

  return (
    <div>
      {/* Segmented range control */}
      <div className="inline-flex items-center bg-[#F3F4F6] rounded-lg p-0.5 mb-4">
        {['1M', '3M', '6M'].map(r => (
          <button key={r} onClick={() => setRange(r)}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 ${
              range === r
                ? 'bg-white text-[#1A1A2E] shadow-sm'
                : 'text-[#6B7280] hover:text-[#1A1A2E]'
            }`}>
            {r}
          </button>
        ))}
      </div>
      <div ref={ref} style={{ width: '100%' }} />
    </div>
  )
}

// ─── Shareholding Chart ───────────────────────────────────────────────────────
function ShareholdingChart({ data }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!data || !ref.current) return
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4']
    const traces = [
      { type: 'bar', name: 'Promoters', x: quarters, y: data.Promoters || [], marker: { color: '#5367FF' } },
      { type: 'bar', name: 'FII',       x: quarters, y: data.FIIs      || [], marker: { color: '#00B386' } },
      { type: 'bar', name: 'DII',       x: quarters, y: data.DIIs      || [], marker: { color: '#F59E0B' } },
    ]
    const layout = {
      ...lightLayout,
      barmode: 'group',
      height: 185,
      margin: { t: 8, b: 28, l: 38, r: 8 },
      showlegend: true,
      legend: { ...lightLayout.legend, orientation: 'h', y: -0.38, x: 0.5, xanchor: 'center', font: { color: '#9CA3AF', size: 9 } },
      yaxis: { ...lightLayout.yaxis, ticksuffix: '%', dtick: 10 },
    }
    import('plotly.js-dist-min').then(P => {
      P.react(ref.current, traces, layout, { displayModeBar: false, responsive: true })
    })
  }, [data])

  return <div ref={ref} style={{ width: '100%' }} />
}

// ─── Growth Bar Chart ─────────────────────────────────────────────────────────
function GrowthBarChart({ title, values }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!values || !ref.current) return
    const labels = ['2 Yrs Ago', 'Last Year', 'This Year']
    const colors = values.map(v => (v == null || isNaN(v) ? '#D1D5DB' : v >= 0 ? '#00B386' : '#EF4444'))

    const traces = [{
      type: 'bar',
      x: labels, y: values,
      width: 0.4,
      marker: { color: colors, line: { width: 0 } },
      text: values.map(v => v == null || isNaN(v) ? 'N/A' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`),
      textposition: 'outside',
      textfont: { color: '#6B7280', size: 10, family: 'Inter' },
      cliponaxis: false,
    }]

    const layout = {
      ...lightLayout,
      height: 300,
      margin: { t: 40, b: 48, l: 52, r: 20 },
      title: { text: title, font: { color: '#1A1A2E', size: 12, family: 'Inter' }, x: 0.5 },
      yaxis: { ...lightLayout.yaxis, ticksuffix: '%', gridcolor: 'transparent', range: [null, null] },
      xaxis: { ...lightLayout.xaxis, gridcolor: 'transparent' },
      showlegend: false,
    }

    import('plotly.js-dist-min').then(P => {
      P.react(ref.current, traces, layout, { displayModeBar: false, responsive: true })
    })
  }, [values, title])

  return <div ref={ref} style={{ width: '100%' }} />
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────
function LoadingOverlay({ ticker, message }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm no-print">
      <div className="relative mb-7">
        <div className="w-14 h-14 rounded-full border-2 border-[#E5E7EB]" />
        <div className="absolute inset-0 w-14 h-14 rounded-full border-2 border-transparent border-t-[#5367FF] spinner" />
        <div className="absolute inset-2 flex items-center justify-center text-[#5367FF] text-base font-bold">
          {ticker?.[0]}
        </div>
      </div>
      <p className="text-[#1A1A2E] font-semibold text-lg mb-1.5 tracking-tight">{message}</p>
      <p className="text-[#9CA3AF] text-sm mb-7">Analyzing {ticker}</p>
      <div className="flex gap-1.5">
        <div className="w-2 h-2 rounded-full bg-[#5367FF] dot-pulse-1" />
        <div className="w-2 h-2 rounded-full bg-[#5367FF] dot-pulse-2" />
        <div className="w-2 h-2 rounded-full bg-[#5367FF] dot-pulse-3" />
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function Navbar({ onLogoClick }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b border-[#E5E7EB] no-print">
      <div className="max-w-screen-2xl mx-auto px-5 h-full flex items-center justify-between">
        <button onClick={onLogoClick} className="group">
          <span className="text-[20px] font-bold text-[#5367FF] group-hover:opacity-80 transition-opacity">
            FinSight AI
          </span>
        </button>
        <span className="text-[13px] text-[#9CA3AF] hidden sm:block">
          Institutional research. Any NSE stock. 10 seconds.
        </span>
      </div>
    </nav>
  )
}

// ─── Index Card ───────────────────────────────────────────────────────────────
function IndexCard({ idx }) {
  const pct   = idx.change_pct ?? 0
  const isPos = Number(pct) >= 0
  return (
    <div
      className="bg-white rounded-xl p-4 border border-[#E5E7EB] flex-1 min-w-[160px] max-w-[220px]
                 hover:shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-all duration-200 fade-up cursor-default"
      style={{ borderLeft: `3px solid ${isPos ? '#00B386' : '#EF4444'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider truncate mb-1.5">{idx.name}</p>
      <p className="text-[18px] font-bold text-[#1A1A2E] leading-none mb-1">{fmtLarge(idx.last)}</p>
      <div className={`flex items-center gap-1 text-[13px] font-semibold ${isPos ? 'text-[#00B386]' : 'text-[#EF4444]'}`}>
        {isPos ? <ArrowUp /> : <ArrowDown />}
        {fmtPct(pct)}
      </div>
      <div className="flex justify-between mt-2.5 pt-2 border-t border-[#F3F4F6]">
        <span className="text-[10px] text-[#9CA3AF]">H: {fmtLarge(idx.year_high)}</span>
        <span className="text-[10px] text-[#9CA3AF]">L: {fmtLarge(idx.year_low)}</span>
      </div>
    </div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
function LandingPage({ onSearch, indices, history }) {
  const [q, setQ] = useState('')

  const submit = (val) => {
    const t = (val || q).trim().toUpperCase()
    if (t) onSearch(t)
  }

  const features = [
    { icon: '📡', title: 'Live NSE Data',     sub: 'Real-time prices & NSE feeds' },
    { icon: '🤖', title: 'AI Analyst Verdict', sub: 'Gemini-powered research brief' },
    { icon: '⚖️', title: 'Peer Comparison',   sub: 'Sector & industry benchmarking' },
    { icon: '📄', title: 'PDF Export',         sub: 'Professional research report' },
  ]

  return (
    <div className="min-h-screen bg-[#F0F2F5] pt-14">
      <div className="max-w-screen-lg mx-auto px-5 pt-16 pb-14 text-center">

        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-[#EEF2FF] border border-[#C7D2FE] rounded-full px-4 py-1.5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#5367FF]" style={{ animation: 'dotPulse 2s infinite' }} />
          <span className="text-[11px] font-semibold text-[#5367FF] uppercase tracking-widest">
            NSE Stock Intelligence
          </span>
        </div>

        {/* Hero */}
        <h1 className="text-[42px] sm:text-5xl font-bold text-[#1A1A2E] leading-[1.15] mb-4 tracking-tight">
          NSE Stock Research,<br />
          <span className="text-[#5367FF]">Powered by AI</span>
        </h1>
        <p className="text-[16px] text-[#6B7280] max-w-md mx-auto mb-12 leading-relaxed">
          Fundamentals, technicals, peer comparison, and an AI analyst verdict —
          on any NSE stock, in seconds.
        </p>

        {/* Indices */}
        {indices.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            {indices.map((idx, i) => <IndexCard key={i} idx={idx} />)}
          </div>
        )}

        {/* Search bar */}
        <div className="max-w-xl mx-auto mb-6">
          <div
            className="flex items-center bg-white border border-[#E5E7EB] rounded-2xl transition-all duration-200"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
            onFocusCapture={e => e.currentTarget.style.boxShadow = '0 0 0 3px rgba(83,103,255,0.15), 0 1px 3px rgba(0,0,0,0.08)'}
            onBlurCapture={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'}>
            <div className="pl-4 text-[#9CA3AF] pointer-events-none"><SearchIcon /></div>
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="Enter NSE symbol — INFY, RELIANCE, HDFCBANK"
              autoFocus
              className="flex-1 bg-transparent px-4 py-3.5 text-[#1A1A2E] placeholder-[#9CA3AF] outline-none text-[14px] font-medium"
            />
            <button
              onClick={() => submit()}
              disabled={!q.trim()}
              className="m-1.5 px-6 py-2.5 bg-[#5367FF] hover:bg-[#4355E8] disabled:opacity-40 disabled:cursor-not-allowed
                         text-white font-semibold rounded-xl transition-all duration-150 text-[13px] whitespace-nowrap"
              style={{ boxShadow: '0 1px 3px rgba(83,103,255,0.3)' }}>
              Research
            </button>
          </div>
        </div>

        {/* Recent searches */}
        {history.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
            <span className="text-[12px] text-[#9CA3AF]">Recent:</span>
            {history.slice(0, 5).map((h, i) => (
              <button key={i} onClick={() => submit(h.ticker)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E5E7EB]
                           hover:border-[#5367FF]/40 hover:bg-[#EEF2FF]
                           text-[#5367FF] rounded-full text-[12px] font-medium transition-all duration-150"
                style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                {h.ticker}
                {h.verdict_label && (
                  <span className="text-[9px] font-bold opacity-60" style={{ color: sentimentHex(h.verdict_label) }}>
                    {h.verdict_label.slice(0, 4).toUpperCase()}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Feature cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-xl mx-auto">
          {features.map(({ icon, title, sub }) => (
            <div key={title}
              className="bg-white border border-[#E5E7EB] rounded-xl p-4 text-center
                         hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#C7D2FE] transition-all duration-200"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div className="text-2xl mb-2">{icon}</div>
              <p className="text-[13px] font-semibold text-[#1A1A2E] mb-0.5">{title}</p>
              <p className="text-[11px] text-[#9CA3AF] leading-snug">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Stock Header ─────────────────────────────────────────────────────────────
function StockHeader({ data, ticker }) {
  const f    = data.fundamentals || {}
  const nse  = f.nse             || {}
  const tech = f.technicals      || {}
  const isPos = Number(f.change_pct) >= 0

  const quickStats = [
    { label: 'Market Cap',      value: fmtCap(f.market_cap) },
    { label: 'P/E Ratio',       value: fmtNum(f.pe_ratio) },
    { label: 'EPS',             value: fmtINR(f.eps) },
    { label: '52W High',        value: fmtINR(f.week_52_high) },
    { label: '52W Low',         value: fmtINR(f.week_52_low) },
    { label: 'Ann. Volatility', value: nse.annual_volatility ? `${fmtNum(nse.annual_volatility)}%` : 'N/A' },
  ]

  const vHex = verdictHex(tech.verdict)

  return (
    <Card className="mb-4 p-6 fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        {/* Left */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h1 className="text-[28px] font-bold text-[#1A1A2E] tracking-tight leading-none">
              {f.company_name || ticker}
            </h1>
            <span className="px-2.5 py-1 bg-[#5367FF] text-white rounded-lg text-[11px] font-bold tracking-wide">
              {ticker}
            </span>
            {nse.sector && (
              <span className="px-2.5 py-1 bg-[#F3F4F6] text-[#6B7280] rounded-lg text-[11px] font-medium">
                {nse.sector}
              </span>
            )}
            {nse.industry && (
              <span className="px-2.5 py-1 bg-[#F3F4F6] text-[#9CA3AF] rounded-lg text-[11px]">
                {nse.industry}
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            <span className="text-[36px] font-bold text-[#1A1A2E] leading-none tracking-tight">
              {fmtINR(f.current_price)}
            </span>
            <div className={`flex items-center gap-1.5 text-[16px] font-semibold mb-0.5 ${isPos ? 'text-[#00B386]' : 'text-[#EF4444]'}`}>
              {isPos ? <ArrowUp /> : <ArrowDown />}
              {fmtPct(f.change_pct)}
            </div>
          </div>
          <p className="text-[12px] text-[#9CA3AF] mt-1.5">
            Prev close: {fmtINR(f.previous_close)}
            {data.cached && <span className="ml-3 text-[#F59E0B]">· Cached</span>}
          </p>
        </div>

        {/* Right: verdict */}
        {tech.verdict && (
          <div className="flex flex-col items-end gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9CA3AF]">Technical Signal</p>
            <span
              className="px-4 py-2 rounded-xl text-[13px] font-bold border tracking-wide"
              style={{
                color: vHex,
                borderColor: vHex + '30',
                background:  vHex + '10',
              }}>
              {tech.verdict.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {quickStats.map(({ label, value }) => (
          <div key={label} className="bg-[#F8F9FB] rounded-lg p-3 border border-[#F3F4F6] text-center">
            <p className="text-[10px] font-medium text-[#9CA3AF] uppercase tracking-wide mb-1">{label}</p>
            <p className="text-[13px] font-semibold text-[#1A1A2E]">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Fundamentals Card ────────────────────────────────────────────────────────
function FundamentalsCard({ data }) {
  const f   = data.fundamentals || {}
  const nse = f.nse             || {}
  const t   = f.technicals      || {}

  const rsiHex = t.rsi > 70 ? '#EF4444' : t.rsi < 30 ? '#00B386' : '#F59E0B'

  return (
    <Card className="mb-3 p-5">
      <SectionLabel>Fundamentals</SectionLabel>
      <StatRow label="ROE"       value={f.roe  ? `${fmtNum(f.roe)}%`  : 'N/A'} valueColor={f.roe  > 15 ? '#00B386' : '#1A1A2E'} />
      <StatRow label="ROCE"      value={f.roce ? `${fmtNum(f.roce)}%` : 'N/A'} valueColor={f.roce > 15 ? '#00B386' : '#1A1A2E'} />
      <StatRow label="Sector P/E" value={fmtNum(nse.sector_pe)} />
      <StatRow label="Stock P/E"
        value={fmtNum(nse.symbol_pe)}
        valueColor={nse.symbol_pe < nse.sector_pe ? '#00B386' : nse.symbol_pe > nse.sector_pe ? '#F59E0B' : '#1A1A2E'}
      />
      <StatRow label="Delivery %"
        value={nse.delivery_pct ? `${fmtNum(nse.delivery_pct)}%` : 'N/A'}
        valueColor={nse.delivery_pct > 50 ? '#00B386' : '#1A1A2E'}
      />
      <StatRow label="RSI (14)"
        value={t.rsi ? fmtNum(t.rsi) : 'N/A'}
        valueColor={rsiHex}
      />
      {t.volume_ratio && (
        <StatRow label="Vol. Ratio"
          value={`${fmtNum(t.volume_ratio, 2)}x`}
          valueColor={t.volume_spike ? '#F59E0B' : '#1A1A2E'}
        />
      )}
    </Card>
  )
}

// ─── Performance Table ────────────────────────────────────────────────────────
function PerformanceTable({ data }) {
  const nse       = data.fundamentals?.nse || {}
  const ret       = nse.returns            || {}
  const idxRet    = nse.index_returns      || {}
  const indexName = nse.index_name         || 'Nifty 50'

  const rows = [
    { period: '1 Month', stock: ret.one_month,   index: idxRet.one_month },
    { period: '3 Month', stock: ret.three_month, index: idxRet.three_month },
    { period: '1 Year',  stock: ret.one_year,    index: idxRet.one_year },
  ]

  return (
    <Card className="p-5">
      <SectionLabel>Performance vs {indexName}</SectionLabel>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#F3F4F6]">
            {['Period', 'Stock', 'Index', 'Diff'].map(h => (
              <th key={h} className="pb-2 text-right first:text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ period, stock, index }) => {
            const diff = stock != null && index != null ? Number(stock) - Number(index) : null
            return (
              <tr key={period} className="border-b border-[#F3F4F6] last:border-0">
                <td className="py-2.5 text-[13px] text-[#6B7280] font-medium">{period}</td>
                <td className="py-2.5 text-right text-[13px] font-semibold"
                  style={{ color: stock != null ? positiveHex(stock) : '#9CA3AF' }}>
                  {fmtPct(stock)}
                </td>
                <td className="py-2.5 text-right text-[13px] font-semibold"
                  style={{ color: index != null ? positiveHex(index) : '#9CA3AF' }}>
                  {fmtPct(index)}
                </td>
                <td className="py-2.5 text-right text-[13px] font-semibold"
                  style={{ color: diff != null ? positiveHex(diff) : '#9CA3AF' }}>
                  {fmtPct(diff)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

// ─── Sentiment Card ───────────────────────────────────────────────────────────
function SentimentCard({ sentiment }) {
  if (!sentiment) return null
  const color = sentimentHex(sentiment.label)

  const bgMap = { '#00B386': '#F0FDF4', '#EF4444': '#FEF2F2', '#F59E0B': '#FFFBEB' }
  const bg    = bgMap[color] || '#F8F9FB'

  return (
    <Card className="mb-3 p-5">
      <SectionLabel>News Sentiment</SectionLabel>
      <div className="sentiment-label-box rounded-xl p-3 mb-3 text-center" style={{ background: bg, border: `1px solid ${color}20` }}>
        <span className="text-[22px] font-bold tracking-wider" style={{ color }}>
          {sentiment.label?.toUpperCase()}
        </span>
      </div>
      <p className="text-[12px] text-[#6B7280] leading-relaxed">{sentiment.reasoning}</p>
    </Card>
  )
}

// ─── Research Page ────────────────────────────────────────────────────────────
function ResearchPage({ data, ticker, onBack }) {
  const f   = data.fundamentals || {}
  const nse = f.nse             || {}
  const [showAllAnn, setShowAllAnn] = useState(false)

  const companyName = (f.company_name || '').toLowerCase()
  const isPeerMatch = (p) => {
    if (!p?.name) return false
    const n = p.name.toLowerCase()
    return n.includes(companyName.split(' ')[0]) || companyName.includes(n.split(' ')[0])
  }

  const announcements   = nse.announcements || []
  const visibleAnn      = showAllAnn ? announcements : announcements.slice(0, 3)

  return (
    <div className="min-h-screen bg-[#F0F2F5] pt-14 pb-24">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">

        {/* Back */}
        <button onClick={onBack}
          className="no-print flex items-center gap-1.5 text-[#5367FF] hover:opacity-75 mb-5 transition-opacity text-[13px] font-medium">
          <BackIcon />
          Back to search
        </button>

        {/* ── Section 1: Header ─────────────────────────────── */}
        <StockHeader data={data} ticker={ticker} />

        {/* ── Section 2: Three columns ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

          {/* Left col */}
          <div className="lg:col-span-3">
            <FundamentalsCard data={data} />
            <PerformanceTable data={data} />
          </div>

          {/* Center col */}
          <div className="lg:col-span-6">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-1">
                <SectionLabel>Price Chart</SectionLabel>
                {f.technicals?.rsi != null && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#F8F9FB] border border-[#E5E7EB] rounded-lg mb-3">
                    <span className="text-[11px] text-[#9CA3AF] font-medium">RSI</span>
                    <span className="text-[13px] font-bold"
                      style={{ color: f.technicals.rsi > 70 ? '#EF4444' : f.technicals.rsi < 30 ? '#00B386' : '#F59E0B' }}>
                      {fmtNum(f.technicals.rsi)}
                    </span>
                  </div>
                )}
              </div>
              <CandlestickChart ticker={ticker} />
              {f.technicals?.reasoning && (
                <p className="text-[12px] text-[#9CA3AF] mt-3 leading-relaxed border-t border-[#F3F4F6] pt-3">
                  {f.technicals.reasoning}
                </p>
              )}
            </Card>
          </div>

          {/* Right col */}
          <div className="lg:col-span-3">
            <SentimentCard sentiment={data.news_sentiment} />
            {f.shareholding_pattern && (
              <Card className="p-5">
                <SectionLabel>Shareholding Trend</SectionLabel>
                <ShareholdingChart data={f.shareholding_pattern} />
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[
                    { label: 'Promoters', key: 'Promoters', color: '#5367FF' },
                    { label: 'FII',       key: 'FIIs',      color: '#00B386' },
                    { label: 'DII',       key: 'DIIs',      color: '#F59E0B' },
                  ].map(({ label, key, color }) => {
                    const arr    = f.shareholding_pattern[key] || []
                    const latest = arr[arr.length - 1]
                    return (
                      <div key={key} className="text-center rounded-lg p-2"
                        style={{ background: color + '12', border: `1px solid ${color}20` }}>
                        <p className="text-[9px] font-semibold uppercase tracking-wide mb-0.5" style={{ color }}>{label}</p>
                        <p className="text-[13px] font-bold" style={{ color }}>
                          {latest != null ? `${fmtNum(latest)}%` : 'N/A'}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* ── Section 3: Risks & Opportunities ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="p-5">
            <SectionLabel>Key Risks</SectionLabel>
            <div className="space-y-2">
              {(data.key_risks || []).map((r, i) => (
                <div key={i}
                  className="flex gap-3 px-3 py-2.5 rounded-lg bg-white hover:bg-[#FEF2F2] transition-colors"
                  style={{ borderLeft: '3px solid #EF4444', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <span className="text-[#EF4444] mt-0.5 shrink-0"><WarnIcon /></span>
                  <p className="text-[13px] text-[#1A1A2E] leading-relaxed">{r}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionLabel>Key Opportunities</SectionLabel>
            <div className="space-y-2">
              {(data.key_opportunities || []).map((o, i) => (
                <div key={i}
                  className="flex gap-3 px-3 py-2.5 rounded-lg bg-white hover:bg-[#F0FDF4] transition-colors"
                  style={{ borderLeft: '3px solid #00B386', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                  <span className="text-[#00B386] mt-0.5 shrink-0"><CheckIcon /></span>
                  <p className="text-[13px] text-[#1A1A2E] leading-relaxed">{o}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Section 4: Analyst Verdict ───────────────────── */}
        <Card className="mb-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#1A1A2E] mb-1">
                FinSight AI Research Brief
              </p>
              <p className="text-[12px] text-[#6B7280]">
                {ticker} &nbsp;·&nbsp; {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <span className="px-3 py-1.5 text-[11px] font-bold tracking-widest text-[#5367FF]
                             bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg">
              ANALYST VERDICT
            </span>
          </div>
          <div className="border-l-4 border-[#5367FF] pl-5">
            <p className="text-[15px] text-[#1A1A2E] leading-[1.75] font-normal">{data.analyst_verdict}</p>
          </div>
          <p className="text-[11px] text-[#9CA3AF] mt-5 pt-4 border-t border-[#F3F4F6] leading-relaxed">
            This report is AI-generated for informational purposes only. Not financial advice.
            Past performance does not guarantee future results. Consult a SEBI-registered advisor before investing.
          </p>
        </Card>

        {/* ── Section 5: Peer Comparison ───────────────────── */}
        {f.peers && f.peers.length > 0 && (
          <Card className="mb-4 p-5">
            <SectionLabel>Peer Comparison</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-[#F3F4F6]">
                    {['Company', 'CMP', 'P/E', 'Mkt Cap', 'ROCE', 'Qtr Profit Gr.', 'Qtr Sales Gr.'].map(h => (
                      <th key={h}
                        className="pb-2.5 pr-4 text-right first:text-left text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.peers.map((p, i) => {
                    const hi   = isPeerMatch(p)
                    const roce = Number(p.roce)
                    const roceColor = isNaN(roce) ? '#9CA3AF' : roce > 20 ? '#00B386' : roce > 10 ? '#F59E0B' : '#EF4444'
                    return (
                      <tr key={i}
                        className="border-b border-[#F3F4F6] last:border-0 transition-colors"
                        style={hi ? { background: '#EEF2FF', borderLeft: '3px solid #5367FF' } : {}}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] font-semibold ${hi ? 'text-[#5367FF]' : 'text-[#1A1A2E]'}`}>
                              {p.name || 'N/A'}
                            </span>
                            {hi && (
                              <span className="text-[9px] bg-[#5367FF] text-white px-1.5 py-0.5 rounded font-bold tracking-wide">
                                ▶ YOU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right text-[13px] text-[#6B7280]">{fmtINR(p.cmp)}</td>
                        <td className="py-3 pr-4 text-right text-[13px] text-[#6B7280]">{fmtNum(p.pe)}</td>
                        <td className="py-3 pr-4 text-right text-[13px] text-[#6B7280]">{fmtCap(p.market_cap)}</td>
                        <td className="py-3 pr-4 text-right text-[13px] font-semibold" style={{ color: roceColor }}>
                          {p.roce != null ? `${fmtNum(p.roce)}%` : 'N/A'}
                        </td>
                        <td className="py-3 pr-4 text-right text-[13px] font-semibold"
                          style={{ color: p.qtr_profit_growth != null ? positiveHex(p.qtr_profit_growth) : '#9CA3AF' }}>
                          {fmtPct(p.qtr_profit_growth)}
                        </td>
                        <td className="py-3 text-right text-[13px] font-semibold"
                          style={{ color: p.qtr_sales_growth != null ? positiveHex(p.qtr_sales_growth) : '#9CA3AF' }}>
                          {fmtPct(p.qtr_sales_growth)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── Section 6: News Headlines ─────────────────────── */}
        {data.news && data.news.length > 0 && (
          <Card className="mb-4 p-5">
            <SectionLabel>Recent News</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.news.slice(0, 10).map((n, i) => (
                <div key={i}
                  className="p-3.5 rounded-xl border border-[#F3F4F6] bg-[#F8F9FB]
                             hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:bg-white hover:border-[#E5E7EB]
                             transition-all duration-200">
                  <p className="text-[13px] text-[#1A1A2E] leading-snug mb-2 font-medium">{n.headline}</p>
                  <p className="text-[11px] text-[#9CA3AF]">{fmtDate(n.date)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Section 7: NSE Announcements (accordion) ─────── */}
        {announcements.length > 0 && (
          <Card className="mb-4 p-5">
            <SectionLabel>NSE Corporate Announcements</SectionLabel>
            <div className="divide-y divide-[#F3F4F6]">
              {visibleAnn.map((ann, i) => (
                <div key={i} className="flex flex-wrap items-start gap-3 py-3 hover:bg-[#F8F9FB] -mx-1 px-1 rounded-lg transition-colors">
                  <span className="shrink-0 text-[11px] bg-[#F3F4F6] text-[#6B7280] px-2.5 py-1 rounded-md font-medium whitespace-nowrap">
                    {fmtDate(ann.date)}
                  </span>
                  {ann.type && (
                    <span className="shrink-0 text-[11px] bg-[#FFFBEB] text-[#F59E0B] border border-[#FDE68A] px-2 py-1 rounded-md font-semibold whitespace-nowrap">
                      {ann.type.length > 28 ? ann.type.slice(0, 28) + '…' : ann.type}
                    </span>
                  )}
                  <p className="text-[12px] text-[#6B7280] leading-relaxed flex-1 min-w-[180px]">{ann.summary}</p>
                </div>
              ))}
            </div>
            {announcements.length > 3 && (
              <button
                onClick={() => setShowAllAnn(v => !v)}
                className="mt-3 flex items-center gap-1.5 text-[12px] font-semibold text-[#5367FF] hover:opacity-75 transition-opacity">
                {showAllAnn ? <><ChevronUp /> Show less</> : <><ChevronDown /> Show all {announcements.length} announcements</>}
              </button>
            )}
          </Card>
        )}

        {/* ── Section 8: Growth Trends ──────────────────────── */}
        {(f.revenue_growth?.length || f.profit_growth?.length) && (
          <Card className="mb-4 p-5">
            <SectionLabel>Growth Trends</SectionLabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {f.revenue_growth?.length > 0 && (
                <GrowthBarChart title="Revenue Growth %" values={f.revenue_growth} />
              )}
              {f.profit_growth?.length > 0 && (
                <GrowthBarChart title="Profit Growth %" values={f.profit_growth} />
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Export PDF */}
      <button onClick={() => window.print()}
        className="no-print fixed bottom-6 right-6 flex items-center gap-2 px-5 py-3
                   bg-[#5367FF] hover:bg-[#4355E8] text-white font-semibold rounded-2xl
                   transition-all duration-200 text-[13px] z-30"
        style={{ boxShadow: '0 4px 14px rgba(83,103,255,0.35)' }}>
        <PrintIcon />
        Export PDF
      </button>
    </div>
  )
}

// ─── App Root ─────────────────────────────────────────────────────────────────
const LOAD_MSGS = [
  'Fetching live market data…',
  'Analysing fundamentals…',
  'Running AI analysis…',
  'Building research brief…',
]

export default function App() {
  const [view,    setView]    = useState('landing')
  const [ticker,  setTicker]  = useState('')
  const [resData, setResData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState(LOAD_MSGS[0])
  const [error,   setError]   = useState(null)
  const [indices, setIndices] = useState([])
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetch(`${API}/indices`)
      .then(r => r.json())
      .then(d => setIndices(Array.isArray(d) ? d : []))
      .catch(console.error)

    fetch(`${API}/history`)
      .then(r => r.json())
      .then(d => setHistory(Array.isArray(d) ? d : []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!loading) return
    let idx = 0
    const iv = setInterval(() => {
      idx = (idx + 1) % LOAD_MSGS.length
      setLoadMsg(LOAD_MSGS[idx])
    }, 2000)
    return () => clearInterval(iv)
  }, [loading])

  const handleSearch = useCallback(async (sym) => {
    setTicker(sym)
    setError(null)
    setLoading(true)
    setLoadMsg(LOAD_MSGS[0])
    try {
      const res = await fetch(`${API}/research/${sym}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail || `${res.status} — ${res.statusText}`)
      }
      const d = await res.json()
      setResData(d)
      setView('research')
      fetch(`${API}/history`).then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {})
    } catch (e) {
      setError(e.message || 'Failed to fetch research data')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleBack = () => {
    setView('landing')
    setResData(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-[#1A1A2E] font-sans">
      <Navbar onLogoClick={handleBack} />

      {loading && <LoadingOverlay ticker={ticker} message={loadMsg} />}

      {/* Error modal */}
      {error && !loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 no-print">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-8 max-w-md w-full text-center"
            style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div className="w-14 h-14 rounded-full bg-[#FEF2F2] border border-[#FCA5A5]/30 flex items-center justify-center mx-auto mb-5">
              <span className="text-2xl">⚠️</span>
            </div>
            <h3 className="text-[#1A1A2E] font-bold text-[18px] mb-2 tracking-tight">Research Failed</h3>
            <p className="text-[#6B7280] text-[14px] mb-6 leading-relaxed">{error}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setError(null)}
                className="px-5 py-2.5 border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F8F9FB] rounded-xl font-medium text-[13px] transition-all">
                Dismiss
              </button>
              <button onClick={() => { setError(null); if (ticker) handleSearch(ticker) }}
                className="px-5 py-2.5 bg-[#5367FF] hover:bg-[#4355E8] text-white rounded-xl font-semibold text-[13px] transition-all"
                style={{ boxShadow: '0 1px 3px rgba(83,103,255,0.3)' }}>
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'landing' && (
        <LandingPage onSearch={handleSearch} indices={indices} history={history} />
      )}
      {view === 'research' && resData && (
        <ResearchPage data={resData} ticker={ticker} onBack={handleBack} />
      )}
    </div>
  )
}
