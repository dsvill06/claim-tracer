import {notFound} from 'next/navigation'
import {getAnalysis} from '@/lib/supabase'
import {safeUuid,displayDate,ClaimResult} from '@/lib/scoring'
import {Results} from '@/components/results'
export const dynamic='force-dynamic'
export default async function Saved({params}:{params:Promise<{id:string}>}){const {id}=await params;if(!safeUuid(id))notFound();const row=await getAnalysis(id);if(!row)notFound();return <main className="site-shell"><header className="topbar"><a className="brand" href="/">Claim Tracer <span>CT</span></a><span className="version">Saved analysis · {displayDate(row.created_at)}</span></header><section className="hero"><p className="eyebrow">SAVED TRACE</p><h1>Evidence, left in place.</h1><p className="intro">The original text and its source trail.</p><div className="input-panel"><label>Original text</label><p className="claim-text">{row.input_text}</p></div></section><Results claims={row.claims as ClaimResult[]} done id={row.id}/></main>}
