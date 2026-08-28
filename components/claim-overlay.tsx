'use client'
import { ClaimResult, bandLabel, scoreColor, meterAria, clamp, sourceHref, sourceLabel } from '@/lib/scoring'
import { ExternalLink } from 'lucide-react'

interface Props {
  claim: ClaimResult
  onClose: () => void
  onOpenDetail: () => void
}

export function ClaimOverlay({ claim, onClose, onOpenDetail }: Props) {
  const color = scoreColor(claim.band)
  const pending = claim.notes === 'Searching live sources…'

  return (
    <div className="ct-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="ct-overlay-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="ct-badge" style={{ background: color, color: 'var(--card)' }}>
            {bandLabel(claim.band)}
          </span>
          <button className="ct-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="ct-ov-claim">"{claim.claim}"</p>

        {pending ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, margin: '16px 0' }}>Searching live sources…</div>
        ) : (
          <>
            <div className="ct-meter-wrap">
              <div className="ct-meter-bar" style={{ flex: 1 }}>
                <div className="ct-meter-fill" style={{ width: `${clamp(claim.score)}%`, background: color }} />
              </div>
              <span className="ct-score-num" style={{ color }}>{claim.score}</span>
            </div>
            <div className="ct-score-caption" style={{ marginBottom: 16 }}>
              Support score — sourcing, not truth
            </div>

            {claim.notes && (
              <p className="ct-ov-notes">{claim.notes}</p>
            )}

            {claim.sources.length > 0 && (
              <div className="ct-source-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {claim.sources.slice(0, 5).map((s, i) => (
                  <div className="ct-source-row" key={`${s.domain}-${i}`}>
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=16`}
                      alt=""
                      width={14}
                      height={14}
                      style={{ flex: 'none', opacity: 0.8 }}
                    />
                    <a
                      href={sourceHref(s.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--fg)', textDecoration: 'none', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {s.title || s.domain}
                    </a>
                    <span className="ct-source-meta" style={{ color: s.stance === 'disputes' ? 'var(--bad)' : s.stance === 'supports' ? 'var(--green)' : 'var(--muted)' }}>
                      {s.stance}
                    </span>
                    <ExternalLink size={11} style={{ color: 'var(--dim)', flex: 'none' }} />
                  </div>
                ))}
              </div>
            )}

            <button className="ct-full-btn" style={{ marginTop: 8 }} onClick={onOpenDetail}>
              Open full trace →
            </button>
          </>
        )}
      </div>
    </div>
  )
}
