"use client";

import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SearchResult } from "@/types";

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
}

export function SearchResults({ results, query }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No results found for &quot;{query}&quot;
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Try a different search query or check another collection.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Found {results.length} result{results.length !== 1 ? "s" : ""}
      </p>
      {results.map((result, index) => (
        <SearchResultCard key={`${result.documentId}-${index}`} result={result} />
      ))}
    </div>
  );
}

interface SearchResultCardProps {
  result: SearchResult;
}

function SearchResultCard({ result }: SearchResultCardProps) {
  // Convert distance to relevance score (0-100%)
  // COSINE distance ranges from 0 (identical) to 2 (opposite)
  // We convert to a percentage where higher is better
  const relevancePercent = Math.round((1 - result.rawDistance / 2) * 100);

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate">
              {result.fileName}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline">{result.collectionId}</Badge>
            <Link
              href={`/collections/${result.collectionId}/documents/${result.documentId}`}
            >
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Link>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary */}
        <p className="text-sm text-muted-foreground">{result.summary}</p>

        {/* Keywords */}
        {result.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {result.keywords.slice(0, 5).map((keyword) => (
              <Badge key={keyword} variant="secondary" className="text-xs">
                {keyword}
              </Badge>
            ))}
          </div>
        )}

        {/* Relevance Score */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <span className="text-xs text-muted-foreground">Relevance</span>
          <Progress value={relevancePercent} className="h-1.5 flex-1 max-w-32" />
          <span className="text-xs font-medium w-12">
            {relevancePercent}%
          </span>
          {result.rawDistance != null && (
            <span className="text-xs text-muted-foreground">
              (d={result.rawDistance.toFixed(3)})
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
