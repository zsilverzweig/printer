"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/lib/components/ui/card";
import { Skeleton } from "@/lib/components/ui/skeleton";
import type { NewsArticle } from "@/lib/types/market";

export interface NewsListProps {
  articles: NewsArticle[] | null;
  loading?: boolean;
  error?: string | null;
}

export function NewsList({ articles, loading, error }: NewsListProps) {
  if (loading) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[80px_1fr] gap-4 items-start">
            <Skeleton className="h-20 w-20" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!articles || articles.length === 0) {
    return <div className="text-sm text-muted-foreground">No recent news</div>;
  }

  return (
    <div className="grid gap-4">
      {articles.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="grid grid-cols-[80px_1fr] gap-4 items-start rounded-md border p-3 hover:bg-muted/50 transition-colors"
        >
          {a.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={a.imageUrl}
              alt={a.title}
              className="h-20 w-20 rounded object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded bg-muted" />
          )}
          <div className="grid gap-1">
            <div className="text-sm font-medium leading-snug">{a.title}</div>
            <div className="text-xs text-muted-foreground line-clamp-2">
              {a.description}
            </div>
            <div className="text-xs text-muted-foreground">
              <span>{a.source || ""}</span>
              {a.publishedUtc && (
                <span className="ml-2">
                  {new Date(a.publishedUtc).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}

export default function NewsPanel({
  title = "News",
  articles,
  loading,
  error,
}: NewsListProps & { title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <NewsList articles={articles} loading={loading} error={error} />
      </CardContent>
    </Card>
  );
}
