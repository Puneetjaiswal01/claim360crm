import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata={title:"Claim 360 Enterprise",description:"Shareholder recovery operations and sales CRM"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
