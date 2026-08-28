'use client'
import { useReducer, useState } from 'react'
import { ClaimResult, EXAMPLES, LIMITATION, bandLabel, scoreColor, clamp, emptyMessage, inputPlaceholder, isValidUrl } from '@/lib/scoring'
import { detectPlatform } from '@/lib/segments'
import { PlatformFrame } from '@/components/platform-frame'
import { ClaimOverlay } from '@/components/claim-overlay'
import { ClaimDetail } from '@/components/claim-detail'

type Platform = 'x' | 'reddit' | 'linkedin' | 'instagram' | 'article'
type View = 'home' | 'loading' | 'results' | 'detail'
type InputTab = 'post' | 'article'

type ArticleMeta = { title: string; description: string; image: string; domain: string }

type AnalysisState = {
  claims: ClaimResult[]
  pending: boolean
  done: boolean
  id?: string
  error?: string
  empty: boolean
  fetching: boolean
  displayText: string
  sourceUrl?: string
  articleMeta?: ArticleMeta
}

const initial: AnalysisState = { claims: [], pending: false, done: false, empty: false, fetching: false, displayText: '' }

function reducer(s: AnalysisState, a: any): AnalysisState {
  if (a.type === 'start') return { ...initial, pending: true }
  if (a.type === 'fetching') return { ...s, fetching: true }
  if (a.type === 'claims') return {
    ...s, fetching: false,
    claims: a.claims.map((claim: string) => ({
      claim, score: 0, band: 'unsupported' as const,
      factors: { sourceQuality: 0, corroboration: 0, directness: 0, recency: 0, contradictionPenalty: 0 },
      sources: [], notes: 'Searching live sources…'
    })),
    empty: a.claims.length === 0
  }
  if (a.type === 'verdict') { const claims = [...s.claims]; claims[a.index] = a.result; return { ...s, claims } }
  if (a.type === 'article-meta') return { ...s, articleMeta: { title: a.title, description: a.description, image: a.image, domain: a.domain } }
  if (a.type === 'done') return { ...s, pending: false, done: true, id: a.id, displayText: a.displayText || s.displayText, sourceUrl: a.sourceUrl }
  if (a.type === 'error' && a.index === undefined) return { ...s, pending: false, fetching: false, error: a.message }
  return s
}

function bandChips(claims: ClaimResult[]) {
  const counts: Record<string, number> = {}
  for (const c of claims) counts[c.band] = (counts[c.band] || 0) + 1
  return Object.entries(counts).map(([band, n]) => ({ band: band as ClaimResult['band'], n }))
}

const PLATFORM_LABELS: Record<Platform, string> = {
  x: 'X / Twitter', reddit: 'Reddit', linkedin: 'LinkedIn', instagram: 'Instagram', article: 'Article'
}

export default function Page() {
  const [text, setText] = useState('')
  const [inputTab, setInputTab] = useState<InputTab>('post')
  const [state, dispatch] = useReducer(reducer, initial)
  const [view, setView] = useState<View>('home')
  const [platform, setPlatform] = useState<Platform>('x')
  const [lockedPlatform, setLockedPlatform] = useState<Platform | null>(null)
  const [overlay, setOverlay] = useState<number | null>(null)
  const [detailIndex, setDetailIndex] = useState(0)

  async function trace(value = text) {
    if (!value.trim()) return
    dispatch({ type: 'start' })
    setOverlay(null)

    // Detect platform from URL immediately and lock it
    const trimmed = value.trim()
    if (isValidUrl(trimmed)) {
      const detected = detectPlatform(trimmed)
      setPlatform(detected)
      setLockedPlatform(detected)
    } else {
      setLockedPlatform(null)
      setPlatform('x')
    }

    setView('loading')
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: value }) })
      if (!res.ok) throw new Error('Enter some text to trace.')
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream returned.')
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          const msg = JSON.parse(line)
          dispatch(msg)
          if (msg.type === 'claims') setView(msg.claims.length > 0 ? 'results' : 'loading')
          if (msg.type === 'done') setView('results')
          if (msg.type === 'error' && msg.index === undefined) setView('home')
        }
      }
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong.' })
      setView('home')
    }
  }

  function openDetail(index: number) {
    setDetailIndex(index)
    setOverlay(null)
    setView('detail')
  }

  const resolvedText = state.displayText || text

  // ── Loading view ─────────────────────────────────────────────────────────
  if (view === 'loading') {
    const verdictsDone = state.claims.filter(c => c.notes !== 'Searching live sources…').length
    const stage = state.fetching
      ? { label: 'Fetching page', sub: resolvedText.slice(0, 80) }
      : state.claims.length === 0
        ? { label: 'Extracting claims', sub: 'Breaking text into checkable facts…' }
        : { label: `Scoring ${state.claims.length} claims`, sub: `${verdictsDone} of ${state.claims.length} verdicts returned` }

    return (
      <div className="ct-shell">
        <div className="ct-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ct-topbar">
            <button className="ct-brand" onClick={() => setView('home')}>
              Claim Tracer <span className="ct-brand-badge">CT</span>
            </button>
            <span className="ct-status">Working…</span>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '60vh', maxWidth: 560 }}>
            {/* Steps */}
            {[
              { key: 'fetch', label: 'Fetch', done: !state.fetching && (state.claims.length > 0 || !state.fetching), active: state.fetching },
              { key: 'extract', label: 'Extract claims', done: state.claims.length > 0, active: !state.fetching && state.claims.length === 0 },
              { key: 'score', label: `Score sources`, done: state.done, active: state.claims.length > 0 && !state.done },
            ].map((step, i) => (
              <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <div style={{
                  width: 28, height: 28, border: `2px solid ${step.done ? 'var(--green)' : step.active ? 'var(--red)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: '600 11px var(--mono)', color: step.done ? 'var(--green)' : step.active ? 'var(--red)' : 'var(--dim)',
                  flexShrink: 0,
                  animation: step.active ? 'pulse 1.1s ease-in-out infinite' : 'none',
                }}>
                  {step.done ? '✓' : `0${i + 1}`}
                </div>
                <div>
                  <div style={{ font: `600 13px var(--mono)`, color: step.done ? 'var(--green)' : step.active ? 'var(--fg)' : 'var(--dim)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                    {step.label}
                  </div>
                  {step.active && (
                    <div style={{ font: '12px var(--mono)', color: 'var(--muted)', marginTop: 3 }}>
                      {step.key === 'fetch' ? (resolvedText.slice(0, 72) || '…') : step.key === 'extract' ? 'Breaking text into checkable facts…' : `${verdictsDone} of ${state.claims.length} verdicts returned`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Detail view ──────────────────────────────────────────────────────────
  if (view === 'detail') {
    const claim = state.claims[detailIndex]
    return (
      <div className="ct-shell">
        <div className="ct-card">
          <div className="ct-topbar">
            <button className="ct-brand" onClick={() => setView('home')}>
              Claim Tracer <span className="ct-brand-badge">CT</span>
            </button>
            <span className="ct-status">Done</span>
          </div>
          {claim && (
            <div style={{ paddingTop: 28 }}>
              <ClaimDetail claim={claim} onBack={() => setView('results')} />
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Results view ─────────────────────────────────────────────────────────
  if (view === 'results') {
    const chips = bandChips(state.claims)
    const isFromUrl = !!lockedPlatform
    const statusText = state.pending ? 'Scoring…' : 'Done'

    return (
      <div className="ct-shell">
        <div className="ct-card">
          <div className="ct-topbar">
            <button className="ct-brand" onClick={() => setView('home')}>
              Claim Tracer <span className="ct-brand-badge">CT</span>
            </button>
            <span className="ct-status">{statusText}</span>
          </div>

          <div className="ct-results-bar">
            <button className="ct-back-btn" onClick={() => setView('home')}>← New trace</button>
            <div className="ct-band-chips">
              {chips.map(({ band, n }) => (
                <span key={band} className="ct-band-chip" style={{ background: scoreColor(band), color: 'var(--card)' }}>
                  {n} {bandLabel(band)}
                </span>
              ))}
            </div>
          </div>

          <h2 className="ct-results-title">Where did the claims come from?</h2>
          {state.sourceUrl && (
            state.articleMeta ? (
              <a
                href={state.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', gap: 14, padding: '12px 14px', border: '1px solid var(--border)', marginBottom: 16, textDecoration: 'none', color: 'inherit', background: 'var(--panel)', transition: 'opacity .15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {state.articleMeta.image && (
                  <img
                    src={state.articleMeta.image}
                    alt=""
                    style={{ width: 80, height: 60, objectFit: 'cover', flexShrink: 0, background: 'var(--border)' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: '600 13px/1.4 var(--sans)', color: 'var(--fg)', marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {state.articleMeta.title || state.sourceUrl}
                  </div>
                  {state.articleMeta.description && (
                    <div style={{ font: '12px/1.4 var(--sans)', color: 'var(--muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: 4 }}>
                      {state.articleMeta.description}
                    </div>
                  )}
                  <div style={{ font: '11px var(--mono)', color: 'var(--dim)', letterSpacing: '.04em' }}>
                    {state.articleMeta.domain} · via Claim Tracer
                  </div>
                </div>
              </a>
            ) : (
              <div style={{ display: 'flex', gap: 14, padding: '12px 14px', border: '1px solid var(--border)', marginBottom: 16, background: 'var(--panel)' }}>
                <div style={{ width: 80, height: 60, background: 'var(--border)', flexShrink: 0, animation: 'pulse 1.1s ease-in-out infinite' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                  <div style={{ height: 13, background: 'var(--border)', borderRadius: 2, width: '70%', animation: 'pulse 1.1s ease-in-out infinite' }} />
                  <div style={{ height: 11, background: 'var(--border)', borderRadius: 2, width: '90%', animation: 'pulse 1.1s ease-in-out infinite' }} />
                  <div style={{ height: 10, background: 'var(--border)', borderRadius: 2, width: '40%', animation: 'pulse 1.1s ease-in-out infinite' }} />
                </div>
              </div>
            )
          )}

          {/* Platform tabs — only shown for plain text input */}
          {!isFromUrl && !state.empty && (
            <div className="ct-platform-tabs">
              {(Object.keys(PLATFORM_LABELS) as Platform[]).map(p => (
                <button
                  key={p}
                  className={`ct-platform-tab${platform === p ? ' active' : ''}`}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          )}

          {/* Platform label pill for URL-sourced content */}
          {isFromUrl && !state.empty && (
            <div style={{ marginBottom: 14 }}>
              <span className="ct-band-chip" style={{ background: 'var(--border)', color: 'var(--fg)', font: '600 11px var(--mono)', letterSpacing: '.06em' }}>
                {PLATFORM_LABELS[platform]}
              </span>
            </div>
          )}

          {state.empty ? (
            <div className="ct-empty">{emptyMessage}</div>
          ) : (
            <PlatformFrame
              platform={platform}
              displayText={resolvedText}
              sourceUrl={state.sourceUrl}
              claims={state.claims}
              onClaimClick={i => setOverlay(i)}
            />
          )}

          {/* Claims list */}
          {state.claims.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <p className="ct-method-label" style={{ marginBottom: 14 }}>All claims</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {state.claims.map((claim, i) => {
                  const color = scoreColor(claim.band)
                  const pending = claim.notes === 'Searching live sources…'
                  return (
                    <button
                      key={`claim-${i}`}
                      onClick={() => setOverlay(i)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 14px',
                        background: 'transparent', border: '1px solid var(--border-inner)',
                        borderLeft: `3px solid ${color}`, textAlign: 'left', cursor: 'pointer',
                        transition: 'background .12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--panel)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span
                        className={pending ? 'ct-chip-loading' : ''}
                        style={{
                          background: color, color: 'var(--card)', font: '600 11px var(--mono)',
                          padding: '2px 7px', flexShrink: 0, minWidth: 32, textAlign: 'center',
                        }}
                      >
                        {pending ? '···' : claim.score}
                      </span>
                      <span style={{ font: '13px/1.5 var(--sans)', color: 'var(--fg-body)', flex: 1 }}>
                        {claim.claim}
                      </span>
                      <span style={{ font: '10px var(--mono)', color, textTransform: 'uppercase', letterSpacing: '.06em', flexShrink: 0, paddingTop: 3 }}>
                        {pending ? '…' : bandLabel(claim.band)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="ct-legend" style={{ marginTop: 24 }}>
            {(['well-supported', 'partially-supported', 'disputed', 'unsupported'] as const).map(band => (
              <div key={band} className="ct-legend-item">
                <div className="ct-legend-dot" style={{ background: scoreColor(band) }} />
                <span>{bandLabel(band)}</span>
              </div>
            ))}
          </div>

          <div className="ct-aside" style={{ marginTop: 20 }}>
            <strong>What this measures</strong>
            {LIMITATION.replace('What this measures. ', '')}
          </div>

          {state.error && (
            <div className="ct-error" style={{ marginTop: 16 }}>{state.error}</div>
          )}

          {state.done && state.id && (
            <div className="ct-footer">
              <button className="ct-link-btn" onClick={() => navigator.clipboard?.writeText(`${location.origin}/r/${state.id}`)}>
                Copy shareable link
              </button>
            </div>
          )}
        </div>

        {overlay !== null && state.claims[overlay] && (
          <ClaimOverlay
            claim={state.claims[overlay]}
            onClose={() => setOverlay(null)}
            onOpenDetail={() => openDetail(overlay)}
          />
        )}
      </div>
    )
  }

  // ── Home view ─────────────────────────────────────────────────────────────
  return (
    <div className="ct-shell">
      <div className="ct-card">
        <div className="ct-topbar">
          <button className="ct-brand">
            Claim Tracer <span className="ct-brand-badge">CT</span>
          </button>
          <span className="ct-status">Ready to trace</span>
        </div>

        <h1 className="ct-h1" style={{ marginTop: 32 }}>
          Trace where<br /><span>claims come from.</span>
        </h1>
        <div className="ct-divider" />
        <p className="ct-intro">
          Paste a social post URL or text. Claim Tracer extracts checkable facts,
          searches live sources, and scores how well-sourced each claim is.
        </p>

        <div className="ct-tabs">
          <button className={`ct-tab${inputTab === 'post' ? ' active' : ''}`} onClick={() => setInputTab('post')}>
            Post / Text
          </button>
          <button className={`ct-tab${inputTab === 'article' ? ' active' : ''}`} onClick={() => setInputTab('article')}>
            Article URL
          </button>
        </div>

        <div className="ct-input-panel">
          {inputTab === 'article' ? (
            <input
              className="ct-url-input"
              type="url"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="https://…"
              onKeyDown={e => e.key === 'Enter' && trace()}
              autoFocus
            />
          ) : (
            <textarea
              className="ct-textarea"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={inputPlaceholder}
              maxLength={12000}
              autoFocus
            />
          )}

          <div className="ct-input-footer">
            <span className="ct-input-hint">
              {inputTab === 'post' ? `${text.length.toLocaleString()} / 12,000` : 'Supports X, Reddit, LinkedIn, and article URLs'}
            </span>
            <div className="ct-input-actions">
              {text && (
                <button className="ct-link-btn" onClick={() => setText('')}>Clear</button>
              )}
              <button className="ct-primary-btn" disabled={!text.trim()} onClick={() => trace()}>
                Trace claims
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          {EXAMPLES.map(ex => (
            <button
              key={ex.label}
              className="ct-link-btn"
              onClick={() => { setText(ex.value); if (ex.isUrl) setInputTab('article') }}
              style={{ border: '1px solid var(--border)', padding: '6px 12px' }}
            >
              {ex.isUrl ? '🔗 ' : ''}{ex.label}
            </button>
          ))}
        </div>

        {state.error && (
          <div className="ct-error" style={{ marginTop: 20 }}>
            {state.error} <button onClick={() => trace(text)}>Try again</button>
          </div>
        )}

        <div className="ct-method">
          <p className="ct-method-label">The method</p>
          <div className="ct-method-grid">
            {[['01', 'Split', 'Find atomic, checkable claims — not opinions, rhetoric, or vibes.'],
              ['02', 'Search', 'Look for independent origins via live Google Search grounding.'],
              ['03', 'Score', 'Show how well-sourced, not how true. Sourcing ≠ truth.']].map(([num, h, p]) => (
              <div key={num} className="ct-method-item">
                <div className="ct-method-num">{num}</div>
                <h2 className="ct-method-h2">{h}</h2>
                <p className="ct-method-p">{p}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ct-footer" style={{ marginTop: 44 }}>
          Claim Tracer · built for skeptical reading · scores sourcing, not truth.
        </div>
      </div>
    </div>
  )
}
