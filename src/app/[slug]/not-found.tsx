import { Button } from '@/lib/components/ui/button'
import { Card } from '@/lib/components/ui/card'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex h-screen bg-background">
      <div className="flex-1 flex items-center justify-center">
        <Card className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Document Not Found</h1>
          <p className="text-muted-foreground mb-6">
            The document you're looking for doesn't exist.
          </p>
          <Link href="/">
            <Button>Return to Overview</Button>
          </Link>
        </Card>
      </div>
    </div>
  )
}
