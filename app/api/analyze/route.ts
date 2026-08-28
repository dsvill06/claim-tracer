import { GoogleGenAI } from '@google/genai'
import { NextRequest } from 'next/server'
import { asClaims, failedClaim, judgePrompt, jsonLine, maxInput, mergeSources, normalizeJudge, parseJson, sanitizeText, scoreClaim, splitterPrompt, timeout, uniqueClaims, modelName, streamMime } from '@/lib/scoring'
import { saveAnalysis } from '@/lib/supabase'
export const runtime='nodejs'
const ai=()=>process.env.GEMINI_API_KEY
  ?new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY})
  :new GoogleGenAI({vertexai:true,project:process.env.GOOGLE_CLOUD_PROJECT||'midyear-precept-506914-a3',location:process.env.GOOGLE_CLOUD_LOCATION||'us-central1'})
async function generate(contents:string,tools?:any[]){return ai().models.generateContent({model:modelName,contents,config:tools?{tools}:undefined})}
const isUrl=(s:string)=>/^https?:\/\/.+/i.test(s.trim())

async function fetchReddit(url:string):Promise<string>{
  const jsonUrl=url.split('?')[0].replace(/\/?$/,'.json')
  const res=await timeout(fetch(jsonUrl,{headers:{'User-Agent':'ClaimTracer/1.0 (analysis tool)'}}),12000)
  if(!res.ok)throw new Error(`Reddit returned ${res.status}`)
  const data=await res.json()
  const post=data[0]?.data?.children?.[0]?.data
  if(!post)throw new Error('Could not parse Reddit post.')
  const parts=[post.title,post.selftext].filter(Boolean)
  const topComments:string[]=(data[1]?.data?.children||[]).slice(0,5).map((c:any)=>c.data?.body).filter(Boolean)
  if(topComments.length)parts.push('Top comments:\n'+topComments.join('\n'))
  return parts.join('\n\n')
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

const NOISE_PATTERNS=[
  /sponsored stories[\s\S]*/i,
  /more from [a-z\s]+\n[\s\S]*/i,
  /related topics[\s\S]*/i,
  /you may (also )?like[\s\S]*/i,
  /recommended (articles|videos|stories)[\s\S]*/i,
  /advertisement[\s\S]*/i,
  /^(fox news media|fox business|fox nation|fox news audio|fox weather|outkick)[^\n]*\n/gim,
  /\n(u\.s\.|politics|world|opinion|media|entertainment|lifestyle)\s*\n/gi,
]

function stripNoise(text:string):string{
  let t=text
  for(const p of NOISE_PATTERNS) t=t.replace(p,'')
  return t.replace(/\n{3,}/g,'\n\n').trim()
}

async function fetchJina(url:string):Promise<string>{
  const res=await timeout(fetch(`https://r.jina.ai/${url}`,{headers:{'Accept':'text/plain','X-Return-Format':'text','X-Remove-Selector':'nav,footer,aside,[class*="ad"],[class*="sponsor"],[class*="related"],[class*="recommend"]'}}),15000)
  if(!res.ok)throw new Error(`Could not fetch URL (${res.status})`)
  const raw=await res.text()
  const stripped=raw.replace(/^(Title:|URL Source:|Published Time:|Markdown Content:)[^\n]*\n/gm,'').trim()
  return stripNoise(stripped)
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
    try{parsed=parseJson((await generate(`${splitterPrompt}\n\nTEXT:\n${text}`)).text||'')}
    catch{parsed=parseJson((await generate(`${splitterPrompt}\nReturn only the JSON object.\n\nTEXT:\n${text}`)).text||'')}
    claims=uniqueClaims(asClaims(parsed))
    send({type:'claims',claims})
    if(!claims.length){const id=await saveAnalysis(raw,[],sourceUrl);send({type:'done',id,displayText:text,sourceUrl});c.close();return}
    const results=await Promise.all(claims.map(async(claim,index)=>{
      try{
        const response=await timeout(generate(judgePrompt(claim),[{googleSearch:{}}]),30000)
        const judge=mergeSources(normalizeJudge(parseJson(response.text||'{}')),response.candidates?.[0]?.groundingMetadata)
        const result=scoreClaim(claim,judge)
        send({type:'verdict',index,result})
        return result
      }catch(e){
        console.error(`[analyze] claim ${index} failed:`,e)
        const result=failedClaim(claim)
        send({type:'verdict',index,result})
        send({type:'error',index,message:'Search failed for this claim.'})
        return result
      }
    }))
    try{const id=await saveAnalysis(raw,results,sourceUrl);send({type:'done',id,displayText:text,sourceUrl})}catch{send({type:'done',id:'',displayText:text,sourceUrl})}
    c.close()
  }catch(e){send({type:'error',message:'The analysis could not be completed. Try again.'});c.close()}
}
