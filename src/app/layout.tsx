import { AuthProvider } from '@/lib/providers/auth-provider'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Printer - AI Investment Research',
  description: 'An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.',
}


export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <meta name="apple-mobile-web-app-title" content="printer" />
      <body className={inter.className}>
        <AuthProvider>
          {children}
          <Toaster 
            position="bottom-right"
            expand={true}
            richColors={true}
            closeButton={true}
          />
        </AuthProvider>
      </body>
    </html>
  )
}
