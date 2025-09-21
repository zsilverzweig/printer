import fs from 'fs'
import matter from 'gray-matter'
import path from 'path'
import { remark } from 'remark'
import remarkBreaks from 'remark-breaks'
import gfm from 'remark-gfm'
import html from 'remark-html'

export interface MarkdownFile {
  slug: string
  title: string
  content: string
  html: string
  relativePath?: string
}

interface MarkdownFileInfo {
  slug: string
  fullPath: string
  relativePath: string
}

export async function getMarkdownFiles(): Promise<MarkdownFile[]> {
  const docsDir = path.join(process.cwd(), 'docs')
  const markdownFiles: MarkdownFileInfo[] = []
  
  // Recursively find all markdown files in docs directory
  function findMarkdownFiles(dir: string, relativePath: string = '') {
    const items = fs.readdirSync(dir)
    
    for (const item of items) {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        findMarkdownFiles(fullPath, path.join(relativePath, item))
      } else if (item.endsWith('.md')) {
        const slug = path.join(relativePath, item.replace(/\.md$/, '')).replace(/\\/g, '/')
        markdownFiles.push({
          slug,
          fullPath,
          relativePath: path.join(relativePath, item).replace(/\\/g, '/')
        })
      }
    }
  }
  
  findMarkdownFiles(docsDir)
  
  // Process all found markdown files
  const processedFiles = await Promise.all(
    markdownFiles.map(async (file) => {
      const fileContents = fs.readFileSync(file.fullPath, 'utf8')
      
      const { data, content } = matter(fileContents)
      
      // Process markdown to HTML
      const processedContent = await remark()
        .use(gfm)
        .use(remarkBreaks)
        .use(html, { sanitize: false })
        .process(content)
      
      const htmlContent = processedContent.toString()
      
      return {
        slug: file.slug,
        title: data.title || file.slug.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || file.slug,
        content,
        html: htmlContent,
        relativePath: file.relativePath
      }
    })
  )
  
  return processedFiles
}

export async function getMarkdownFile(slug: string): Promise<MarkdownFile | null> {
  try {
    // Handle README file from root directory
    let fullPath: string
    if (slug === 'README') {
      fullPath = path.join(process.cwd(), 'README.md')
    } else {
      // Handle nested paths properly - convert forward slashes to path separators
      const normalizedSlug = slug.replace(/\//g, path.sep)
      fullPath = path.join(process.cwd(), 'docs', `${normalizedSlug}.md`)
    }
    
    const fileContents = fs.readFileSync(fullPath, 'utf8')
    
    const { data, content } = matter(fileContents)
    
    // Process markdown to HTML
    const processedContent = await remark()
      .use(gfm)
      .use(remarkBreaks)
      .use(html, { sanitize: false })
      .process(content)
    
    const htmlContent = processedContent.toString()
    
    return {
      slug,
      title: data.title || slug.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || slug,
      content,
      html: htmlContent
    }
  } catch (error) {
    return null
  }
}
