'use client'
import { ClaimResult, bandLabel, scoreColor, clamp, factorMax, factorName, factorValue, sourceHref, sourceLabel, Source } from '@/lib/scoring'
import { ExternalLink } from 'lucide-react'

interface Props {
  claim: ClaimResult
  onBack: () => void
}

function SourceGroup({ title, sources, color }: { title: string; sources: Source[]; color: string }) {
  return (
    <div className="ct-source-group">
      <p className="ct-group-title" style={{ color }}>{title}</p>
      {sources.length === 0 ? (
        <p className="ct-no-sources">None found.</p>
      ) : (
        sources.map((s, i) => (
          <a
            key={`${s.domain}-${i}`}
            className="ct-source-link"
            href={sourceHref(s.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=16`}
              alt=""
              width={14}
              height={14}
              style={{ flex: 'none', opacity: 0.8 }}
            />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.title || s.domain}
            </span>
            <span className="ct-source-type-tag">{sourceLabel(s.type)}</span>
            <ExternalLink size={11} style={{ color: 'var(--dim)', flex: 'none' }} />
          </a>
        ))
      )}
    </div>
  )
}

export function ClaimDetail({ claim, onBack }: Props) {
  const color = scoreColor(claim.band)
  const supporting = claim.sources.filter(s => s.stance === 'supports')
  const disputing = claim.sources.filter(s => s.stance === 'disputes')
  const mentioning = claim.sources.filter(s => s.stance === 'mentions')

  return (
    <div>
      <button className="ct-back-btn" onClick={onBack} style={{ marginBottom: 20 }}>
        ← Back to results
      </button>

      <h2 style={{ font: '400 clamp(20px,3.5vw,28px)/1.3 var(--display)', textTransform: 'uppercase', color: 'var(--fg)', margin: '0 0 24px' }}>
        "{claim.claim}"
      </h2>

      <div className="ct-detail-grid">
        {/* Origin trail */}
        <div className="ct-detail-main">
          <p className="ct-trail-label">Origin Trail</p>
          <div className="ct-trail">
            {claim.sources.length === 0 ? (
              <p style={{ color: 'var(--dim)', fontSize: 13, marginLeft: 18 }}>No sources surfaced.</p>
            ) : (
              claim.sources.slice(0, 8).map((s, i) => (
                <div className="ct-trail-item" key={`trail-${i}`}>
                  <div
                    className="ct-trail-dot"
                    style={{
                      background: s.stance === 'supports' ? 'var(--green)' : s.stance === 'disputes' ? 'var(--bad)' : 'var(--border)'
                    }}
                  />
                  <div>
                    <div>
                      <span className="ct-trail-year">Source</span>
                      <span className="ct-trail-kind">{sourceLabel(s.type)}</span>
                    </div>
                    <div className="ct-trail-text">
                      <a href={sourceHref(s.url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--fg-body)', textDecoration: 'none' }}>
                        {s.title || s.domain}
                      </a>
                      {s.snippet && (
                        <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                          {s.snippet}
                        </span>
                      )}
                    </div>
                    <div className="ct-trail-domain">{s.domain} · {s.stance}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          {claim.notes && (
            <div className="ct-aside" style={{ marginTop: 24 }}>
              <strong>Analyst note</strong>
              {claim.notes}
            </div>
          )}
        </div>

        {/* Score panel */}
        <div className="ct-detail-score-panel">
          <div style={{ marginBottom: 8, font: '600 11px var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Support Score
          </div>
          <div className="ct-score-big" style={{ color }}>
            {claim.score}
            <span style={{ font: '400 28px/1 var(--display)', color: 'var(--dim)' }}>/100</span>
          </div>
          <div className="ct-big-meter">
            <div className="ct-big-fill" style={{ width: `${clamp(claim.score)}%`, background: color }} />
          </div>
          <div style={{ font: '600 11px var(--mono)', color, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 16 }}>
            {bandLabel(claim.band)}
          </div>

          <div className="ct-factors">
            {Object.entries(claim.factors).map(([key, val]) => {
              const max = factorMax[key as keyof typeof factorMax] || 30
              const pct = max > 0 ? Math.min(100, Math.abs(val) / max * 100) : 0
              return (
                <div key={key}>
                  <div className="ct-factor-row">
                    <span>{factorName[key as keyof typeof factorName]}</span>
                    <span className="ct-factor-val">{factorValue(key, val)}</span>
                  </div>
                  <div className="ct-factor-bar">
                    <span className="ct-factor-fill" style={{
                      width: `${pct}%`,
                      background: key === 'contradictionPenalty' && val < 0 ? 'var(--bad)' : 'var(--fg)'
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Source groups */}
      <div className="ct-source-groups">
        <SourceGroup title="Supports" sources={supporting} color="var(--green)" />
        <SourceGroup title="Disputes" sources={disputing} color="var(--bad)" />
        <SourceGroup title="Mentions" sources={mentioning} color="var(--muted)" />
      </div>
    </div>
  )
}
