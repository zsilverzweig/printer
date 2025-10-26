'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/lib/components/ui/button'
import { log } from '@/lib/utils/logger'

interface H2NavigationProps {
  className?: string
}

export function H2Navigation({ className = '' }: H2NavigationProps) {
  const [h2Elements, setH2Elements] = useState<{ id: string; text: string }[]>([])
  const [activeId, setActiveId] = useState<string>('')

  useEffect(() => {
    // Find all H2 elements in the markdown content
    const h2Elements = document.querySelectorAll('.markdown-content h2')
    log.debug('H2Navigation useEffect triggered', { count: h2Elements.length }, 'H2Navigation')
    
    const h2s = Array.from(h2Elements).map((h2) => {
      const id = h2.textContent?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ''
      h2.id = id
      log.debug('H2 element processed', { text: h2.textContent, id }, 'H2Navigation')
      return { id, text: h2.textContent || '' }
    })

    log.debug('Processed H2 elements', { elements: h2s }, 'H2Navigation')
    setH2Elements(h2s)
    
    // Set first section as active initially
    if (h2s.length > 0) {
      setActiveId(h2s[0].id)
    }

    // Simple scroll listener to update active section
    const handleScroll = () => {
      const tabBarHeight = 60 // Same as scroll offset
      const menuHeight = 100 // Same as scroll offset
      const totalOffset = tabBarHeight + menuHeight
      const scrollY = window.scrollY + totalOffset
      
      // Find which section we're currently viewing
      for (let i = h2s.length - 1; i >= 0; i--) {
        const element = document.getElementById(h2s[i].id)
        if (element && element.offsetTop <= scrollY) {
          setActiveId(h2s[i].id)
          break
        }
      }
    }

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true })
    
    // Initial call
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToSection = (id: string) => {
    log.debug('Scrolling to section', { id }, 'H2Navigation')
    const element = document.getElementById(id)
    log.debug('Found element', { element: !!element }, 'H2Navigation')
    
    if (element) {
      // Update active state immediately
      setActiveId(id)
      
      // Use scrollIntoView with CSS scroll-margin-top to handle offset
      // This doesn't affect layout, just scroll positioning
      element.style.scrollMarginTop = '160px'
      
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      })
      
      // Remove the scroll margin after scrolling to avoid affecting other scrolls
      setTimeout(() => {
        element.style.scrollMarginTop = ''
      }, 1000)
      
    } else {
      log.error('Element not found for id', { id }, 'H2Navigation')
    }
  }

  if (h2Elements.length === 0) {
    return null
  }

  return (
    <div className={`sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border ${className}`}>
      <div className="container mx-auto px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {h2Elements.map(({ id, text }) => (
            <Button
              key={id}
              variant={activeId === id ? 'default' : 'ghost'}
              size="sm"
              onClick={() => scrollToSection(id)}
              className={`whitespace-nowrap flex-shrink-0 transition-all duration-200 ${
                activeId === id 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'hover:bg-secondary/20'
              }`}
            >
              {text}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
