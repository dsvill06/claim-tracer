import {Analytics} from '@vercel/analytics/next'
import {Fraunces,Inter,IBM_Plex_Mono} from 'next/font/google'
import type {Metadata,Viewport} from 'next'
import './globals.css'
const fraunces=Fraunces({subsets:['latin'],variable:'--font-fraunces'})
const inter=Inter({subsets:['latin'],variable:'--font-inter'})
const plex=IBM_Plex_Mono({subsets:['latin'],weight:['400','600'],variable:'--font-plex'})
export const metadata:Metadata={title:'Claim Tracer — Trace where claims come from',description:'An honest instrument for tracing the sources behind viral claims.',generator:'v0.app'}
export const viewport:Viewport={colorScheme:'light',themeColor:'#f7f8f6',userScalable:false}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${fraunces.variable} ${inter.variable} ${plex.variable}`} suppressHydrationWarning><body suppressHydrationWarning>{children}{process.env.NODE_ENV==='production'&&<Analytics/>}</body></html>}
