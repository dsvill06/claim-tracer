import { ClaimResult } from '@/lib/scoring'
import { HighlightedText } from './highlighted-text'

interface Props {
  platform: 'x' | 'reddit' | 'linkedin' | 'instagram' | 'article'
  displayText: string
  sourceUrl?: string
  claims: ClaimResult[]
  onClaimClick: (index: number) => void
}

function domainOf(url?: string) {
  try { return new URL(url!).hostname.replace(/^www\./, '') } catch { return 'source' }
}

function AvatarCircle({ size = 38, letter = 'U', color = 'var(--red)' }: { size?: number; letter?: string; color?: string }) {
  return (
    <div className="ct-avatar-circle" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {letter}
    </div>
  )
}

export function PlatformFrame({ platform, displayText, sourceUrl, claims, onClaimClick }: Props) {
  const domain = domainOf(sourceUrl)
  const text = displayText || ''

  if (platform === 'reddit') {
    const subreddit = sourceUrl?.match(/reddit\.com\/r\/([^/]+)/i)?.[1] || 'discussion'
    return (
      <div className="ct-post ct-post-reddit">
        <div className="ct-post-reddit-votes">
          <span style={{ fontSize: 18, lineHeight: 1 }}>▲</span>
          <span>—</span>
          <span style={{ fontSize: 18, lineHeight: 1 }}>▼</span>
        </div>
        <div className="ct-post-reddit-body">
          <div className="ct-post-reddit-meta">r/{subreddit} · u/op · {domain}</div>
          <HighlightedText text={text} claims={claims} onClaimClick={onClaimClick} />
          <div className="ct-post-stats">
            <span>💬 comments</span>
            <span>⬆ share</span>
            <span>🔗 {domain}</span>
          </div>
        </div>
      </div>
    )
  }

  if (platform === 'linkedin') {
    return (
      <div className="ct-post ct-post-linkedin">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px 14px' }}>
          <AvatarCircle color="#0077b5" letter="L" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>{domain}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Company · 1st</div>
          </div>
          <button style={{ marginLeft: 'auto', border: '1px solid #0077b5', background: 'transparent', color: '#0077b5', padding: '6px 16px', borderRadius: 20, font: '600 13px var(--sans)', cursor: 'pointer' }}>Follow</button>
        </div>
        <div style={{ padding: '0 20px 18px' }}>
          <HighlightedText text={text} claims={claims} onClaimClick={onClaimClick} />
        </div>
        <div className="ct-post-stats" style={{ padding: '10px 20px 16px', borderTop: '1px solid var(--border)' }}>
          <span>👍 reactions</span>
          <span>💬 comments</span>
          <span>↗ repost</span>
        </div>
      </div>
    )
  }

  if (platform === 'instagram') {
    return (
      <div className="ct-post ct-post-instagram">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px' }}>
          <AvatarCircle size={34} color="linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)" letter="@" />
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>{domain}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--red)', font: '600 13px var(--sans)', cursor: 'pointer' }}>Follow</span>
        </div>
        <div style={{ background: '#0b0d10', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 13 }}>
          [image]
        </div>
        <div style={{ padding: '14px 16px' }}>
          <HighlightedText text={text} claims={claims} onClaimClick={onClaimClick} />
        </div>
        <div className="ct-post-stats" style={{ padding: '0 16px 14px' }}>
          <span>❤️ likes</span>
          <span>💬 comments</span>
        </div>
      </div>
    )
  }

  if (platform === 'article') {
    const lines = text.split('\n').filter(Boolean)
    const headline = lines[0]?.slice(0, 120) || 'Article'
    const body = lines.slice(1).join('\n') || text
    return (
      <div className="ct-article">
        <div className="ct-article-url">{sourceUrl ? domain : 'pasted text'}</div>
        <div className="ct-article-kicker">Analysis</div>
        <h2 className="ct-article-headline">{headline}</h2>
        <div className="ct-article-byline">{domain} · via Claim Tracer</div>
        <HighlightedText text={body || text} claims={claims} onClaimClick={onClaimClick} />
      </div>
    )
  }

  // Default: X / Twitter
  const handle = sourceUrl?.match(/x\.com\/([^/]+)/i)?.[1] || domain || 'source'
  return (
    <div className="ct-post ct-post-x">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <AvatarCircle size={42} letter={handle[0]?.toUpperCase() || 'X'} color="var(--red)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--fg)' }}>{handle}</span>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>@{handle.toLowerCase().replace(/\s+/g, '')}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <HighlightedText text={text} claims={claims} onClaimClick={onClaimClick} />
          </div>
          <div className="ct-post-stats">
            <span>💬 —</span>
            <span>🔁 —</span>
            <span>❤️ —</span>
            <span>📊 views</span>
          </div>
        </div>
      </div>
    </div>
  )
}
