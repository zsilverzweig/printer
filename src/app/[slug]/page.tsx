import { MarkdownViewer } from '@/features/welcome-page/components/markdown-viewer'
import { Sidebar } from '@/features/welcome-page/components/sidebar'
import { getMarkdownFile, getMarkdownFiles } from '@/lib/services/markdown'
import { notFound } from 'next/navigation'

interface PageProps {
  params: {
    slug: string
  }
}

export default async function MarkdownPage({ params }: PageProps) {
  // Decode the URL-encoded slug
  const decodedSlug = decodeURIComponent(params.slug)
  const markdownFile = await getMarkdownFile(decodedSlug)
  const allFiles = await getMarkdownFiles()
  
  if (!markdownFile) {
    notFound()
  }
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar files={allFiles} currentSlug={decodedSlug} />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6 max-w-4xl">
          <MarkdownViewer file={markdownFile} />
        </div>
      </main>
    </div>
  )
}

export async function generateStaticParams() {
  const files = await getMarkdownFiles()
  return files.map((file) => ({
    slug: file.slug,
  }))
}
