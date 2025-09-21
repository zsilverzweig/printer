import { MarkdownViewer } from '@/features/welcome-page/components/markdown-viewer'
import { Sidebar } from '@/features/welcome-page/components/sidebar'
import { getMarkdownFile, getMarkdownFiles } from '@/lib/services/markdown'

export default async function Home() {
  const markdownFiles = await getMarkdownFiles()
  const readmeFile = await getMarkdownFile('README')
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar files={markdownFiles} currentSlug="README" />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-4xl">
          {readmeFile ? (
            <MarkdownViewer file={readmeFile} />
          ) : (
            <div className="prose prose-slate max-w-none">
              <h1 className="text-4xl font-bold mb-8">Printer Project</h1>
              <p className="text-xl text-muted-foreground mb-8">
                An AI-powered investment research engine that produces actionable, company-level investment theses through structured reasoning and adversarial testing.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
