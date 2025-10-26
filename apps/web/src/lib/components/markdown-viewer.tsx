'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { H2Navigation } from '@/features/welcome-page/components/h2-navigation'
import { Card } from '@/lib/components/ui/card'
import { MarkdownFile } from '@/lib/services/markdown'

interface MarkdownViewerProps {
  file: MarkdownFile
}

export function MarkdownViewer({ file }: MarkdownViewerProps) {
  const router = useRouter()
  
  useEffect(() => {
    // Handle internal links within markdown content
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const link = target.closest('a')
      
      if (link && link.href) {
        const url = new URL(link.href)
        
        // Check if it's an internal link to another markdown file
        if (url.pathname.startsWith('/') && url.pathname !== window.location.pathname) {
          event.preventDefault()
          router.push(url.pathname)
        }
      }
    }
    
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [router])
  
  return (
    <div>
      <H2Navigation />
      <Card className="p-8">
        <div className="markdown-content">
          <div 
            dangerouslySetInnerHTML={{ __html: file.html }}
          />
        </div>
      </Card>
    </div>
  )
}
