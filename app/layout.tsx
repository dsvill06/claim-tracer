import {Analytics} from '@vercel/analytics/next'
import {Archivo_Black,Space_Grotesk,IBM_Plex_Mono} from 'next/font/google'
import type {Metadata,Viewport} from 'next'
import './globals.css'
const archivo=Archivo_Black({subsets:['latin'],weight:'400',variable:'--font-archivo'})
const space=Space_Grotesk({subsets:['latin'],variable:'--font-space'})
const plex=IBM_Plex_Mono({subsets:['latin'],weight:['400','600'],variable:'--font-plex'})
export const metadata:Metadata={title:'Claim Tracer — Trace where claims come from',description:'An honest instrument for tracing the sources behind viral claims.'}
export const viewport:Viewport={colorScheme:'dark',themeColor:'#060607',userScalable:false}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${archivo.variable} ${space.variable} ${plex.variable}`} suppressHydrationWarning><body suppressHydrationWarning>{children}{process.env.NODE_ENV==='production'&&<Analytics/>}</body></html>}
