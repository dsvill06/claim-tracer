'use client'
import { ClaimResult, scoreColor, bandLabel } from '@/lib/scoring'
import { segmentText } from '@/lib/segments'

interface Props {
  text: string
  claims: ClaimResult[]
  onClaimClick: (index: number) => void
}

export function HighlightedText({ text, claims, onClaimClick }: Props) {
  const claimStrings = claims.map(c => c.claim)
  const segments = segmentText(text, claimStrings)

  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--fg-body)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {segments.map((seg, i) => {
        if (seg.claimIndex === null) {
          return <span key={i} className="ct-seg-plain">{seg.text}</span>
        }
        const claim = claims[seg.claimIndex]
        const pending = claim.score === 0 && !claim.notes.startsWith('Unverifiable') && claim.notes === 'Searching live sources…'
        const color = scoreColor(claim.band)
        return (
          <span
            key={i}
            className="ct-seg-claim"
            style={{ borderBottomColor: color, background: `${color}18` }}
            onClick={() => onClaimClick(seg.claimIndex!)}
            title={bandLabel(claim.band)}
          >
            {seg.text}
            <span
              className={`ct-chip${pending ? ' ct-chip-loading' : ''}`}
              style={{ background: color }}
            >
              {pending ? '···' : claim.score}
            </span>
          </span>
        )
      })}
    </p>
  )
}
