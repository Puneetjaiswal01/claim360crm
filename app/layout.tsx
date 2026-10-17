import "./globals.css";
import "./design-system.css";
import "./interaction-polish.css";
import "./lead-intelligence.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
const inter=localFont({src:"../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",variable:"--font-body",display:"swap",weight:"100 900"});
const manrope=localFont({src:"../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",variable:"--font-heading",display:"swap",weight:"200 800"});
export const metadata: Metadata={title:"Claim 360 Enterprise",description:"Shareholder recovery operations and sales CRM"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${inter.variable} ${manrope.variable}`}><body>{children}</body></html>}
