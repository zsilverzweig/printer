'use client'

import { remark } from 'remark'
import html from 'remark-html'
import gfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'

/**
 * Process markdown text to HTML on the client side
 */
export async function processMarkdownToHtml(markdownText: string): Promise<string> {
  try {
    const processedContent = await remark()
      .use(gfm)
      .use(remarkBreaks)
      .use(html, { sanitize: false })
      .process(markdownText)
    
    return processedContent.toString()
  } catch (error) {
    console.error('Error processing markdown:', error)
    return markdownText // Return original text as fallback
  }
}
