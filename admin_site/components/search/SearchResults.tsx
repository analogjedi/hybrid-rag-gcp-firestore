"use client";

import Link from "next/link";
import { FileText, ExternalLink, CheckCircle, Sparkles, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { SearchResult, ScoreBreakdown } from "@/types";

interface SearchResultsProps {
  results: SearchResult[];
  query: string;
  debugMode?: boolean;
}

export function SearchResults({ results, query, debugMode = false }: SearchResultsProps) {
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

  // Check if debug mode is on but no score breakdowns returned (functions not deployed)
  const hasAnyBreakdown = results.some(r => r.scoreBreakdown != null);
  const showDeployWarning = debugMode && !hasAnyBreakdown;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Found {results.length} result{results.length !== 1 ? "s" : ""}
      </p>
      {showDeployWarning && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Debug mode is enabled but no score breakdown data was returned.
              You may need to deploy the Cloud Functions with the latest code:
            </p>
            <code className="text-xs mt-2 block bg-muted p-2 rounded">
              firebase deploy --only functions
            </code>
          </CardContent>
        </Card>
      )}
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
  // Convert DOT_PRODUCT similarity to relevance percentage (0-100%)
  // weightedScore is already normalized to 0-1 range
  const relevancePercent = Math.round((result.weightedScore ?? 0) * 100);
  const isExactMatch = result.matchType === "exact";
  const hasScoreBreakdown = result.scoreBreakdown != null;

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="text-base truncate">
              {result.fileName}
            </CardTitle>
            {/* Match Type Badge */}
            <Badge
              variant={isExactMatch ? "default" : "secondary"}
              className={`text-xs shrink-0 ${isExactMatch ? "bg-green-600 hover:bg-green-700" : ""}`}
            >
              {isExactMatch ? "Exact Match" : "Semantic"}
            </Badge>
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
          <span className="text-xs text-muted-foreground">
            {hasScoreBreakdown ? "Combined Score" : "Relevance"}
          </span>
          <Progress value={relevancePercent} className="h-1.5 flex-1 max-w-32" />
          <span className="text-xs font-medium w-12">
            {relevancePercent}%
          </span>
          {result.rawSimilarity != null && !hasScoreBreakdown && (
            <span className="text-xs text-muted-foreground">
              (sim={result.rawSimilarity.toFixed(3)})
            </span>
          )}
        </div>

        {/* Score Breakdown (Debug Mode) */}
        {hasScoreBreakdown && (
          <ScoreBreakdownPanel breakdown={result.scoreBreakdown!} />
        )}
      </CardContent>
    </Card>
  );
}

interface ScoreRowProps {
  label: string;
  score: number;
  similarity: number | null;
  icon: React.ReactNode;
}

function ScoreRow({ label, score, similarity, icon }: ScoreRowProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {icon}
      <span className="w-32 truncate" title={label}>{label}</span>
      <Progress value={score} className="h-1.5 flex-1 max-w-24" />
      <span className="w-10 text-right font-mono">{score}%</span>
      {similarity != null && (
        <span className="text-muted-foreground w-20 text-right">
          (sim={similarity.toFixed(3)})
        </span>
      )}
    </div>
  );
}

interface ScoreBreakdownPanelProps {
  breakdown: ScoreBreakdown;
}

function ScoreBreakdownPanel({ breakdown }: ScoreBreakdownPanelProps) {
  return (
    <div className="mt-3 pt-3 border-t space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Score Breakdown</p>

      {/* Exact Matches */}
      {breakdown.exactMatches.map((match, idx) => (
        <ScoreRow
          key={`exact-${match.term}-${idx}`}
          label={`Exact "${match.term}"`}
          score={match.matched ? 95 : 0}
          similarity={null}
          icon={<CheckCircle className="h-3 w-3 text-green-500 shrink-0" />}
        />
      ))}

      {/* Semantic Scores */}
      {breakdown.semanticScores.map((semScore, idx) => (
        <ScoreRow
          key={`semantic-${semScore.term}-${idx}`}
          label={`"${semScore.term}"`}
          score={Math.round(semScore.score * 100)}
          similarity={semScore.similarity}
          icon={<Sparkles className="h-3 w-3 text-blue-500 shrink-0" />}
        />
      ))}

      {/* Full Query Score */}
      {breakdown.fullQueryScore && (
        <ScoreRow
          label="Full query"
          score={Math.round(breakdown.fullQueryScore.score * 100)}
          similarity={breakdown.fullQueryScore.similarity}
          icon={<Search className="h-3 w-3 text-purple-500 shrink-0" />}
        />
      )}
    </div>
  );
}
