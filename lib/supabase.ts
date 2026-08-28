import { createClient } from '@supabase/supabase-js'
export function getPublicSupabase(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'',process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||process.env.SUPABASE_ANON_KEY||'')}
export function getServiceSupabase(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'',process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SECRET_KEY||'')}
export async function getAnalysis(id:string){const {data,error}=await getPublicSupabase().from('analyses').select('id,input_text,claims,created_at').eq('id',id).maybeSingle();if(error)throw error;return data}
export async function saveAnalysis(input_text:string,claims:unknown[]){const {data,error}=await getServiceSupabase().from('analyses').insert({input_text,claims}).select('id').single();if(error)throw error;return data.id as string}
