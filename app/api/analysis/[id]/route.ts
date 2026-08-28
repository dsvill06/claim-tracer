import {NextRequest} from 'next/server'
import {getAnalysis} from '@/lib/supabase'
import {safeUuid} from '@/lib/scoring'
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}){const {id}=await params;if(!safeUuid(id))return Response.json({message:'Not found'},{status:404});const data=await getAnalysis(id);return data?Response.json(data):Response.json({message:'Not found'},{status:404})}
