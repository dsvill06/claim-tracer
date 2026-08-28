import { GoogleGenAI } from '@google/genai'
import { NextRequest } from 'next/server'
import { execSync } from 'child_process'
import { asClaims, failedClaim, judgePrompt, jsonLine, maxInput, mergeSources, normalizeJudge, parseJson, sanitizeText, scoreClaim, splitterPrompt, timeout, uniqueClaims, modelName, streamMime } from '@/lib/scoring'
import { saveAnalysis } from '@/lib/supabase'
export const runtime='nodejs'
const COMPOSIO_CLI=process.env.COMPOSIO_CLI_PATH||`${process.env.HOME}/.local/bin/composio`
const ai=()=>process.env.GEMINI_API_KEY
  ?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY})
  :new GoogleGenAI({vertexai:true,project:process.env.GOOGLE_CLOUD_PROJECT||'midyear-precept-506914-a3',location:process.env.GOOGLE_CLOUD_LOCATION||'us-central1'})
async function generate(contents:string,tools?:any[]){return ai().models.generateContent({model:modelName,contents,config:tools?{tools}:undefined})}
const isUrl=(s:string)=>/^https?:\/\/.+/i.test(s.trim())

const BLOCK_SIGNALS=['blocked by network security','log in to your reddit account','use your developer token','access denied','enable javascript','please verify you are a human']
function isBlockPage(text:string){return BLOCK_SIGNALS.some(s=>text.toLowerCase().includes(s))}

function parseRedditData(data:any):string{
  const post=data[0]?.data?.children?.[0]?.data
  if(!post)return ''
  const parts=[post.title,post.selftext].filter(Boolean)
  const topComments:string[]=(data[1]?.data?.children||[]).slice(0,5).map((c:any)=>c.data?.body).filter(Boolean)
  if(topComments.length)parts.push('Top comments:\n'+topComments.join('\n'))
  return parts.join('\n\n')
}

async function fetchReddit(url:string):Promise<string>{
  const u=url.trim()
  // 1. Try Composio CLI proxy (authenticated Reddit OAuth — most reliable)
  try{
    const postId=u.match(/comments\/([a-z0-9]+)/i)?.[1]
    if(postId){
      const apiUrl=`https://oauth.reddit.com${new URL(u).pathname.replace(/\/?$/,'.json')}?limit=5&sort=top`
      const raw=execSync(`${COMPOSIO_CLI} proxy '${apiUrl}' --toolkit reddit`,{timeout:15000,stdio:['pipe','pipe','pipe']})
      const data=JSON.parse(raw.toString())
      const text=parseRedditData(data)
      if(text&&!isBlockPage(text)){console.log('[reddit] fetched via composio proxy');return text}
    }
  }catch(e){console.warn('[reddit] composio proxy failed:',e instanceof Error?e.message:'unknown')}

  // 2. Try unauthenticated .json API
  const jsonUrl=u.split('?')[0].replace(/\/?$/,'.json')
  try{
    const res=await timeout(fetch(jsonUrl,{headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36','Accept':'application/json'}}),10000)
    if(res.ok){
      const data=await res.json()
      const text=parseRedditData(data)
      if(text&&!isBlockPage(text)){console.log('[reddit] fetched via json api');return text}
    }
  }catch{}

  throw new Error('Reddit is blocking automated access. Paste the post text directly instead.')
}

async function fetchTweet(url:string):Promise<string>{
  const oembedUrl=`https://publish.x.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
  const res=await timeout(fetch(oembedUrl),10000)
  if(!res.ok)throw new Error(`Twitter oEmbed returned ${res.status}`)
  const data=await res.json()
  const author:string=data.author_name||''
  const html:string=data.html||''
  const text=html
    .replace(/<[^>]+>/g,' ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&mdash;/g,'—').replace(/&nbsp;/g,' ')
    .replace(/\s+/g,' ').trim()
  return author?`${author}: ${text}`:text
}

const NOISE_LINE_PATTERNS=[
  /^sponsored stories\s*$/i,
  /^more from [a-z\s]+\s*$/i,
  /^related topics\s*$/i,
  /^you may (also )?like\s*$/i,
  /^recommended (articles|videos|stories)\s*$/i,
  /^advertisement\s*$/i,
  /^(fox news media|fox business|fox nation|fox news audio|fox weather|outkick)\s*$/i,
  /^(u\.s\.|politics|world|opinion|media|entertainment|lifestyle)\s*$/i,
]

function stripNoise(text:string):string{
  const lines=text.split('\n').filter(line=>!NOISE_LINE_PATTERNS.some(p=>p.test(line.trim())))
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim()
}

async function fetchJina(url:string):Promise<string>{
  const res=await timeout(fetch(`https://r.jina.ai/${url}`,{headers:{'Accept':'text/plain','X-Return-Format':'text','X-Remove-Selector':'nav,footer,aside,[class*="ad"],[class*="sponsor"],[class*="related"],[class*="recommend"]'}}),15000)
  if(!res.ok)throw new Error(`Could not fetch URL (${res.status})`)
  const raw=await res.text()
  const stripped=raw.replace(/^(Title:|URL Source:|Published Time:|Markdown Content:)[^\n]*\n/gm,'').trim()
  const clean=stripNoise(stripped)
  if(isBlockPage(clean))throw new Error('This site is blocking automated access. Paste the content directly instead.')
  return clean
}

type ArticleMeta={title:string;description:string;image:string;domain:string}
async function fetchOgMeta(url:string):Promise<ArticleMeta>{
  try{
    const res=await timeout(fetch(url,{headers:{'User-Agent':'ClaimTracer/1.0'}}),8000)
    if(!res.ok)return{title:'',description:'',image:'',domain:new URL(url).hostname}
    const html=await res.text()
    const tag=(prop:string)=>{
      const m=html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,'i'))
        ||html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,'i'))
      return m?.[1]||''
    }
    const title=tag('og:title')||tag('twitter:title')||(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]||'')
    return{
      title:title.trim(),
      description:(tag('og:description')||tag('twitter:description')||tag('description')).trim(),
      image:tag('og:image')||tag('twitter:image'),
      domain:new URL(url).hostname,
    }
  }catch{return{title:'',description:'',image:'',domain:''}}
}

async function fetchUrl(url:string):Promise<{text:string;sourceUrl:string;meta:ArticleMeta}>{
  const u=url.trim()
  let text:string
  if(/reddit\.com\/r\//i.test(u))text=await fetchReddit(u)
  else if(/^https?:\/\/(www\.)?(twitter\.com|x\.com)\//i.test(u))text=await fetchTweet(u)
  else text=await fetchJina(u)
  if(!text||text.length<40)throw new Error('Page had no readable content.')
  const meta=await fetchOgMeta(u)
  return{text:text.slice(0,maxInput),sourceUrl:u,meta}
}
export async function POST(req:NextRequest){let body:unknown;try{body=await req.json()}catch{return new Response(JSON.stringify({message:'Invalid request.'}),{status:400})}
  const raw=sanitizeText(typeof (body as any)?.text==='string'?(body as any).text:'')
  if(!raw)return new Response(JSON.stringify({message:'Enter a URL or some text to trace.'}),{status:400})
  const encoder=new TextEncoder()
  const stream=new ReadableStream({start(c){void run(raw,c,encoder)}})
  return new Response(stream,{headers:{'Content-Type':streamMime,'Cache-Control':'no-cache'}})
}
async function run(raw:string,c:ReadableStreamDefaultController,encoder:TextEncoder){
  const send=(x:unknown)=>c.enqueue(encoder.encode(jsonLine(x)))
  let claims:string[]=[]
  try{
    let text=raw, sourceUrl:string|undefined
    if(isUrl(raw)){
      send({type:'fetching',url:raw})
      try{const fetched=await fetchUrl(raw);text=fetched.text;sourceUrl=fetched.sourceUrl;send({type:'article-meta',...fetched.meta})}
      catch(e){send({type:'error',message:`Could not read that URL. ${e instanceof Error?e.message:'Try pasting the text directly.'}`});c.close();return}
    }
    let parsed
    try{
      parsed=parseJson((await timeout(generate(`${splitterPrompt}\n\nTEXT:\n${text}`),25000)).text||'')
    }catch(e1){
      console.error('[analyze] splitter attempt 1 failed:',e1)
      try{
        parsed=parseJson((await timeout(generate(`${splitterPrompt}\nReturn only the JSON object.\n\nTEXT:\n${text}`),20000)).text||'')
      }catch(e2){
        console.error('[analyze] splitter attempt 2 failed:',e2)
        parsed={claims:[]}
      }
    }
    claims=uniqueClaims(asClaims(parsed))
    send({type:'claims',claims})
    if(!claims.length){const id=await saveAnalysis(raw,[],sourceUrl);send({type:'done',id,displayText:text,sourceUrl});c.close();return}
    const results=await Promise.all(claims.map(async(claim,index)=>{
      async function attemptJudge(prompt:string,ms:number){
        const response=await timeout(generate(prompt,[{googleSearch:{}}]),ms)
        const judge=mergeSources(normalizeJudge(parseJson(response.text||'{}')),response.candidates?.[0]?.groundingMetadata)
        return scoreClaim(claim,judge)
      }
      try{
        // First attempt: full claim
        let result:ReturnType<typeof scoreClaim>
        try{
          result=await attemptJudge(judgePrompt(claim),30000)
        }catch{
          // Retry with a shortened key phrase (first 120 chars) and looser timeout
          const shortClaim=claim.slice(0,120).replace(/,.*$/,'').trim()
          result=await attemptJudge(judgePrompt(shortClaim),25000)
        }
        send({type:'verdict',index,result})
        return result
      }catch(e){
        console.error(`[analyze] claim ${index} failed after retry:`,e)
        const result=failedClaim(claim)
        send({type:'verdict',index,result})
        return result
      }
    }))
    try{const id=await saveAnalysis(raw,results,sourceUrl);send({type:'done',id,displayText:text,sourceUrl})}catch{send({type:'done',id:'',displayText:text,sourceUrl})}
    c.close()
  }catch(e){console.error('[analyze] run() failed:',e);send({type:'error',message:'The analysis could not be completed. Try again.'});c.close()}
}
