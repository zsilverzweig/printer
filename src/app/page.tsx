import { MarkdownViewer } from '@/features/welcome-page/components/markdown-viewer'
import { Sidebar } from '@/features/welcome-page/components/sidebar'
import { getMarkdownFile, getMarkdownFiles } from '@/lib/services/markdown'
import { notFound } from 'next/navigation'

/**
 * Home page that shows the main documentation
 * Displays the Fund Prospectus README by default
 */
export default async function HomePage() {
  // Default to showing the Fund Prospectus README
  const defaultSlug = 'Fund Prospectus/README'
  const markdownFile = await getMarkdownFile(defaultSlug)
  const allFiles = await getMarkdownFiles()
  
  if (!markdownFile) {
    notFound()
  }
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar files={allFiles} currentSlug={defaultSlug} />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-4xl">
          <MarkdownViewer file={markdownFile} />
        </div>
      </main>
    </div>
  )
}
