export type Segment = { text: string; claimIndex: number | null }

function findInText(lower: string, text: string, needle: string): { start: number; end: number } | null {
  // 1. Exact match
  const exact = lower.indexOf(needle)
  if (exact !== -1) return { start: exact, end: exact + needle.length }

  // 2. First clause before punctuation
  const clause = needle.replace(/[.!?,;].*/, '').trim()
  if (clause.length > 20) {
    const ci = lower.indexOf(clause)
    if (ci !== -1) {
      // Expand to end of sentence in original text
      const sentenceEnd = text.indexOf('.', ci + clause.length)
      const end = sentenceEnd !== -1 ? sentenceEnd + 1 : ci + clause.length
      return { start: ci, end: Math.min(end, lower.length) }
    }
  }

  // 3. Sliding window: try every 6-word window from the claim
  const words = needle.split(/\s+/).filter(Boolean)
  const windowSize = 6
  for (let w = 0; w <= words.length - windowSize; w++) {
    const window = words.slice(w, w + windowSize).join(' ')
    if (window.length < 20) continue
    const wi = lower.indexOf(window)
    if (wi !== -1) {
      // Expand to enclosing sentence boundaries
      let sentStart = wi
      while (sentStart > 0 && !/[.!?\n]/.test(text[sentStart - 1])) sentStart--
      let sentEnd = wi + window.length
      while (sentEnd < text.length && !/[.!?\n]/.test(text[sentEnd])) sentEnd++
      if (sentEnd < text.length) sentEnd++
      return { start: sentStart, end: sentEnd }
    }
  }

  // 4. Any 4-word key phrase (numbers, proper nouns preferred)
  const keyWords = words.filter(w => /\d|^[A-Z]/.test(w) || w.length > 6)
  if (keyWords.length >= 3) {
    for (let w = 0; w <= keyWords.length - 3; w++) {
      const phrase = keyWords.slice(w, w + 3).join(' ').toLowerCase()
      const pi = lower.indexOf(phrase)
      if (pi !== -1) {
        let sentStart = pi
        while (sentStart > 0 && !/[.!?\n]/.test(text[sentStart - 1])) sentStart--
        let sentEnd = pi + phrase.length
        while (sentEnd < text.length && !/[.!?\n]/.test(text[sentEnd])) sentEnd++
        if (sentEnd < text.length) sentEnd++
        return { start: sentStart, end: sentEnd }
      }
    }
  }

  return null
}

export function segmentText(text: string, claims: string[]): Segment[] {
  if (!claims.length || !text) return [{ text, claimIndex: null }]

  const lower = text.toLowerCase()
  const spans: { start: number; end: number; claimIndex: number }[] = []

  for (let i = 0; i < claims.length; i++) {
    const needle = claims[i].toLowerCase()
    const match = findInText(lower, text, needle)
    if (!match) continue
    const overlaps = spans.some(s => s.start < match.end && s.end > match.start)
    if (!overlaps) spans.push({ ...match, claimIndex: i })
  }

  spans.sort((a, b) => a.start - b.start)

  const segs: Segment[] = []
  let pos = 0
  for (const span of spans) {
    if (span.start > pos) segs.push({ text: text.slice(pos, span.start), claimIndex: null })
    segs.push({ text: text.slice(span.start, span.end), claimIndex: span.claimIndex })
    pos = span.end
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), claimIndex: null })

  return segs.filter(s => s.text)
}

export function detectPlatform(sourceUrl?: string): 'x' | 'reddit' | 'linkedin' | 'instagram' | 'article' {
  if (!sourceUrl) return 'x'
  if (/reddit\.com/i.test(sourceUrl)) return 'reddit'
  if (/linkedin\.com/i.test(sourceUrl)) return 'linkedin'
  if (/instagram\.com/i.test(sourceUrl)) return 'instagram'
  if (/twitter\.com|x\.com/i.test(sourceUrl)) return 'x'
  return 'article'
}
