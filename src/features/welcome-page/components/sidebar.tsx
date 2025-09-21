'use client'

import { Button } from '@/lib/components/ui/button'
import { MarkdownFile } from '@/lib/services/markdown'
import { FileText, Home, Printer } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserProfile } from './user-profile'

interface SidebarProps {
  files: MarkdownFile[]
  currentSlug?: string
}

export function Sidebar({ files, currentSlug }: SidebarProps) {
  const pathname = usePathname()
  
  // Filter out README and organize files by category
  const filteredFiles = files.filter(file => file.slug !== 'README')
  
  // Separate files into categories
  const mainDocs = filteredFiles.filter(file => !file.slug.includes('/'))
  const devPlanningFiles = filteredFiles.filter(file => file.slug.startsWith('Development Planning/'))
  const fundProspectusFiles = filteredFiles.filter(file => file.slug.startsWith('Fund Prospectus/'))
  
  return (
    <div className="w-80 border-r bg-card">
      <div className="p-6">
        <div className="flex items-center mb-4">
          <Printer className="h-6 w-6 text-primary mr-2" />
          <h2 className="text-lg font-semibold">Printer</h2>
        </div>
        
        <nav className="space-y-4">
          <div>
            <Link href="/">
              <Button
                variant={pathname === '/' || currentSlug === 'README' ? 'default' : 'ghost'}
                className="w-full justify-start"
              >
                <Home className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>
          
          {mainDocs.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Documentation</h3>
              <div className="space-y-1">
                {mainDocs.map((file) => (
                  <Link key={file.slug} href={`/${encodeURIComponent(file.slug)}`}>
                    <Button
                      variant={currentSlug === file.slug ? 'default' : 'ghost'}
                      className="w-full justify-start"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {file.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {devPlanningFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Development Planning</h3>
              <div className="space-y-1">
                {devPlanningFiles.map((file) => (
                  <Link key={file.slug} href={`/${encodeURIComponent(file.slug)}`}>
                    <Button
                      variant={currentSlug === file.slug ? 'default' : 'ghost'}
                      className="w-full justify-start"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {file.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {fundProspectusFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Fund Prospectus</h3>
              <div className="space-y-1">
                {fundProspectusFiles.map((file) => (
                  <Link key={file.slug} href={`/${encodeURIComponent(file.slug)}`}>
                    <Button
                      variant={currentSlug === file.slug ? 'default' : 'ghost'}
                      className="w-full justify-start"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      {file.title}
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
        
        {/* User Profile Section */}
        <div className="mt-auto p-6 border-t">
          <UserProfile />
        </div>
      </div>
    </div>
  )
}
