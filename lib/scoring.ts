export type SourceType = 'primary' | 'secondary' | 'aggregator'
export type Stance = 'supports' | 'disputes' | 'mentions'
export type Band = 'well-supported' | 'partially-supported' | 'unsupported' | 'disputed'
export interface Source { url: string; domain: string; title?: string; snippet?: string; type: SourceType; stance: Stance }
export interface JudgeResult { sources_found: Source[]; directness: 'exact'|'partial'|'tangential'; independent_corroborations: number; notes: string }
export interface ClaimResult { claim: string; score: number; band: Band; factors: { sourceQuality:number; corroboration:number; directness:number; recency:number; contradictionPenalty:number }; sources: Source[]; notes:string }
export function scoreClaim(claim:string,j:JudgeResult):ClaimResult { const supporting=j.sources_found.filter(s=>s.stance==='supports'), disputing=j.sources_found.filter(s=>s.stance==='disputes'); const sourceQuality=supporting.some(s=>s.type==='primary')?40:supporting.some(s=>s.type==='secondary')?24:supporting.length>0?10:0; const n=Math.max(0,Math.min(20,Math.floor(j.independent_corroborations||0))); const corroboration=Math.round(25*(1-Math.pow(.55,n))); const directness=j.directness==='exact'?20:j.directness==='partial'?10:3; const recency=8; const contradictionPenalty=disputing.length===0?0:disputing.some(s=>s.type==='primary')?-30:disputing.some(s=>s.type==='secondary')?-20:-8; const score=Math.max(0,Math.min(100,sourceQuality+corroboration+directness+recency+contradictionPenalty)); const band=disputing.some(s=>s.type!=='aggregator')&&supporting.length>0?'disputed':score>=70?'well-supported':score>=40?'partially-supported':'unsupported'; return {claim,score,band,factors:{sourceQuality,corroboration,directness,recency,contradictionPenalty},sources:j.sources_found,notes:j.notes} }
export function normalizeJudge(value:unknown):JudgeResult { const v=(value&&typeof value==='object'?value:{}) as Record<string,unknown>; const sources=Array.isArray(v.sources_found)?v.sources_found:[]; const clean=sources.map((s:any)=>({url:typeof s?.url==='string'?s.url:'',domain:typeof s?.domain==='string'?s.domain:'unknown',title:typeof s?.title==='string'&&s.title?s.title:undefined,snippet:typeof s?.snippet==='string'&&s.snippet?s.snippet.slice(0,120):undefined,type:['primary','secondary','aggregator'].includes(s?.type)?s.type:'aggregator',stance:['supports','disputes','mentions'].includes(s?.stance)?s.stance:'mentions'})).filter(s=>s.url).filter((s,i,a)=>a.findIndex(x=>x.domain===s.domain&&x.stance===s.stance)===i); return {sources_found:clean,directness:v.directness==='exact'||v.directness==='partial'?'exact'===v.directness?'exact':'partial':'tangential',independent_corroborations:Math.max(0,Number(v.independent_corroborations)||0),notes:typeof v.notes==='string'?v.notes:'Search results were inconclusive.'} }
export function parseJson(text:string){ const cleaned=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim(); return JSON.parse(cleaned) }
export const failedClaim=(claim:string):ClaimResult=>({claim,score:0,band:'unsupported',factors:{sourceQuality:0,corroboration:0,directness:0,recency:0,contradictionPenalty:0},sources:[],notes:'Unverifiable — search failed for this claim.'})
export type AnalysisRow={id:string;input_text:string;claims:ClaimResult[];created_at:string}
export const LIMITATION='What this measures. Claim Tracer scores how well-sourced a claim is — whether it has a traceable origin and independent corroboration. It does not measure truth. A claim can score 90 and still be wrong if every source traces back to one bad origin, and a true claim can score low if it is simply new or under-reported.'
export const EXAMPLE='The James Webb Space Telescope launched in 2021. It observes infrared light. The telescope cost roughly $10 billion. It is operated by NASA, ESA, and CSA. Its first deep field image was released in July 2022.'
export interface ExamplePost { label: string; platform: string; value: string; isUrl?: boolean }
export const EXAMPLES: ExamplePost[] = [
  {
    label: 'UN · Climate',
    platform: 'X / Twitter',
    value: 'https://x.com/UN/status/1778332406774128734',
    isUrl: true,
  },
  {
    label: 'Climate · Reddit',
    platform: 'Reddit',
    value: 'https://www.reddit.com/r/climate/comments/1lgtjg4/scientists_warn_of_catastrophic_sea_level_rise/',
    isUrl: true,
  },
  {
    label: 'AI & Tech',
    platform: 'Text',
    value: 'OpenAI was founded in 2015 with $1B from Elon Musk. ChatGPT hit 100 million users faster than any app in history. Google fired the engineer who said its AI was sentient. Sam Altman was briefly fired as CEO in November 2023 and reinstated within a week.',
    isUrl: false,
  },
  {
    label: 'Economy',
    platform: 'Text',
    value: 'The US national debt hit $34 trillion for the first time in 2024. Inflation peaked at 9.1% in June 2022, the highest in 40 years. The Federal Reserve raised interest rates 11 consecutive times. Remote work caused a 30% drop in downtown commercial real estate values.',
    isUrl: false,
  },
]
export const sourceLabel=(t:SourceType)=>t[0].toUpperCase()+t.slice(1)
export const bandLabel=(b:Band)=>b==='well-supported'?'Well-supported':b==='partially-supported'?'Partially supported':b==='disputed'?'Disputed':'Unsupported'
export const bandClass=(b:Band)=>b==='well-supported'?'meter-good':b==='partially-supported'?'meter-partial':b==='disputed'?'meter-disputed':'meter-bad'
export const domainFromUrl=(url:string)=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return 'source'}}
export const safeUuid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
export const limiter=()=>new Promise(r=>setTimeout(r,0))
export const jsonLine=(x:unknown)=>JSON.stringify(x)+'\n'
export const judgePrompt=(claim:string)=>`You are a sourcing analyst. Use Google Search to investigate this claim:\n\nCLAIM: "${claim.replaceAll('"','\\"')}"\n\nSearch for it. Then report ONLY what the search results support. Rules:\n- Base every judgment strictly on titles, snippets, and domains shown. Never assert unseen page contents.\n- primary = original official, .gov, peer-reviewed, court, company, dataset, or quoted person's source. secondary = reputable reporting. aggregator = social, content farm, forum, or repetition.\n- Corroboration counts only independent origins. Report credible contradictions as disputes.\n- For title: use the actual page title from search results. For snippet: use a brief excerpt (max 120 chars) from the search snippet.\n\nReturn ONLY valid JSON: {"sources_found":[{"url":"...","domain":"...","title":"...","snippet":"...","type":"primary|secondary|aggregator","stance":"supports|disputes|mentions"}],"directness":"exact|partial|tangential","independent_corroborations":0,"notes":"one sentence"}`
export const splitterPrompt=`You extract checkable factual claims from text. Return ONLY valid JSON: {"claims":["..."]}. Make claims atomic, checkable against external sources, exclude opinions, predictions, values, jokes, rhetoric, and feelings. Maximum 8 claims; return [] if none.`
export const mergeSources=(j:JudgeResult,meta:any)=>{const extra=meta?.groundingChunks||meta?.groundingMetadata?.groundingChunks||[]; for(const c of extra){const url=c?.web?.uri||c?.web?.url;if(url){const domain=domainFromUrl(url);if(!j.sources_found.some(s=>s.domain===domain))j.sources_found.push({url,domain,type:'secondary',stance:'mentions'})}} return j}
export function summarize(claims:ClaimResult[]){return `${claims.length} claims · ${claims.filter(c=>c.band==='well-supported').length} well-supported · ${claims.filter(c=>c.band==='disputed').length} disputed · ${claims.filter(c=>c.band==='unsupported').length} unsupported`}
export function clamp(n:number){return Math.max(0,Math.min(100,Number.isFinite(n)?n:0))}
export function isClaimResult(x:unknown):x is ClaimResult{return !!x&&typeof x==='object'&&typeof (x as any).claim==='string'&&typeof (x as any).score==='number'}
export function sourceHref(url:string){return /^https?:\/\//i.test(url)?url:'#'}
export const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
export const timeout=<T,>(p:Promise<T>,ms:number)=>Promise.race([p,new Promise<T>((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))])
export const noteText=(s:string)=>s.length>240?s.slice(0,237)+'…':s
export const sortClaims=(claims:ClaimResult[])=>claims
export const sanitizeText=(s:string)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim()
export const maxInput=12000
export const emptyMessage='No checkable claims found. This text is opinion, prediction, or rhetoric — nothing here can be traced to a source.'
export const failedMessage='Unverifiable — search failed for this claim'
export const scoreDescription='Support Score: how well-sourced, not how true'
export const exampleClaims=EXAMPLE
export const typeOrder:SourceType[]=['primary','secondary','aggregator']
export const stanceOrder:Stance[]=['supports','disputes','mentions']
export const asClaims=(x:unknown)=>Array.isArray((x as any)?.claims)?(x as any).claims.filter((c:any)=>typeof c==='string').slice(0,8):[]
export const analysisPayload=(input_text:string,claims:ClaimResult[])=>({input_text,claims})
export const safeError=(e:unknown)=>e instanceof Error?e.message:'Unexpected error'
export const displayDate=(value:string)=>new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
export const scoreColor=(b:Band)=>b==='well-supported'?'var(--green)':b==='partially-supported'?'var(--amber)':b==='disputed'?'var(--blue)':'var(--red)'
export const normalizeDomain=(d:string)=>d.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0]
export const uniqueClaims=(xs:string[])=>Array.from(new Set(xs.map(s=>sanitizeText(s)).filter(Boolean))).slice(0,8)
export const hasKey=()=>Boolean(process.env.GEMINI_API_KEY)
export const noIndex='noindex'
export const originPath=(id:string)=>`/r/${id}`
export const copyText=(id:string)=>typeof window==='undefined'?'':`${window.location.origin}/r/${id}`
export const meterAria=(score:number)=>`Support score ${score} out of 100`
export const factorMax={sourceQuality:40,corroboration:25,directness:20,recency:15,contradictionPenalty:0}
export const factorName={sourceQuality:'Source quality',corroboration:'Corroboration',directness:'Directness',recency:'Recency',contradictionPenalty:'Contradiction'}
export const factorValue=(k:string,v:number)=>k==='contradictionPenalty'?(v<0?`−${Math.abs(v)}`:'0'):`${v}`
export const isReducedMotionClass='motion-reduce'
export const buildError=(message:string,index?:number)=>index===undefined?{type:'error',message}:{type:'error',index,message}
export const okResponse=(body:BodyInit,init?:ResponseInit)=>new Response(body,init)
export const csv=()=>''
export const unused=undefined
export const scoreVersion='v1'
export const appName='Claim Tracer'
export const thesis='Every viral post makes claims. We trace where they come from.'
export const searchFailed='Search failed'
export const primaryTypes:SourceType[]=['primary','secondary']
export const bandTitles={"well-supported":'Well-supported',"partially-supported":'Partially supported',unsupported:'Unsupported',disputed:'Disputed'}
export const fieldNames=Object.keys(factorMax)
export const normalizeClaims=(v:unknown)=>uniqueClaims(asClaims(v))
export const defaultJudge:JudgeResult={sources_found:[],directness:'tangential',independent_corroborations:0,notes:'No supporting search evidence was found.'}
export const isValidUrl=(u:string)=>/^https?:\/\//i.test(u)
export const safeUrl=(u:string)=>isValidUrl(u)?u:'#'
export const formatCount=(n:number)=>new Intl.NumberFormat('en').format(n)
export const idFromPath=(p:string)=>p.split('/').pop()||''
export const emptyClaims:ClaimResult[]=[]
export const statusText=(pending:boolean)=>pending?'Searching live sources…':'Ready to trace'
export const retryText='Retry this claim'
export const copyLabel='Copy shareable link'
export const limitationHeading='What this measures.'
export const scoreRange='0–100'
export const sourceCaption='Sources surfaced by Google Search grounding'
export const scoreLegend='Support score'
export const productMark='CT'
export const maxClaims=8
export const minClaim=3
export const queryLength=(s:string)=>s.length
export const inputTooLong=(s:string)=>s.length>maxInput
export const isText=(x:unknown):x is string=>typeof x==='string'
export const fallbackInput=''
export const sourceTypes=typeOrder
export const appDescription='An honest instrument for tracing the sources behind viral claims.'
export const nowIso=()=>new Date().toISOString()
export const noop=()=>{}
export const parseEventBuffer=(buffer:string)=>buffer.split('\n').filter(Boolean).map(line=>JSON.parse(line))
export const toNumber=(v:unknown)=>typeof v==='number'?v:Number(v)||0
export const claimCountLabel=(n:number)=>`${n} ${n===1?'claim':'claims'}`
export const ariaExpanded=(v:boolean)=>v
export const isServer=typeof window==='undefined'
export const getSiteUrl=()=>typeof window!=='undefined'?window.location.origin:''
export const urlFor=(id:string)=>`${getSiteUrl()}/r/${id}`
export const sourceAlt=(domain:string)=>`${domain} favicon`
export const errorText='Something went wrong. Try tracing again.'
export const loadingText='Searching sources'
export const supportScoreLabel='Support Score'
export const noteLabel='Analyst note'
export const sourceLabelPlural='Sources'
export const retryLabel='Retry this claim'
export const noSources='No sources found.'
export const sourceRel='noopener noreferrer'
export const inputLabel='Post text'
export const traceLabel='Trace claims'
export const exampleLabel='Try an example'
export const howSteps=[['Split','Find atomic, checkable claims.'],['Search','Look for independent origins.'],['Score','Show sourcing, not truth.']]
export const footerText='Built for skeptical reading.'
export const emptyAlt=''
export const defaultScore=0
export const maxSourceCount=24
export const inputPlaceholder='Paste a URL (Reddit, X, article…) or text directly…'
export const allBands:Band[]=['well-supported','partially-supported','unsupported','disputed']
export const titleFor=(claim:string)=>`“${claim}”`
export const safeJson=(x:unknown)=>JSON.stringify(x)
export const routeName='analyze'
export const savedRoute='analysis'
export const analyticsDisabled=true
export const noAuth=true
export const noDarkMode=true
export const modelName='gemini-2.5-flash'
export const toolName='googleSearch'
export const version='1'
export const maxJudgeMs=30000
export const formatScore=(n:number)=>Math.round(n)
export const meterPercent=(n:number)=>`${clamp(n)}%`
export const sourceCount=(n:number)=>`${n} ${n===1?'source':'sources'}`
export const checkableLabel='checkable factual claims'
export const exact='exact'
export const partial='partial'
export const tangential='tangential'
export const online='live'
export const finalValue=(c:ClaimResult)=>c.score
export const claimKey=(c:ClaimResult,i:number)=>`${i}-${c.claim}`
export const severity=(b:Band)=>b
export const streamMime='application/x-ndjson; charset=utf-8'
export const jsonMime='application/json'
export const unauthorized=false
export const publicRead=true
export const supportsJsDisabled=true
export const supportsRetry=true
export const supportsShare=true
export const supportText='how well-sourced, not how true'
export const visualDirection='cool paper instrument'
export const versionTag='Claim Tracer v1'
export const minInput=1
export const isEmpty=(s:string)=>!s.trim()
export const trimInput=(s:string)=>s.trim()
export const errorStatus=500
export const notFoundStatus=404
export const badRequestStatus=400
export const okStatus=200
export const createdStatus=201
export const nextStep='Trace another post'
export const footerNotice=LIMITATION
