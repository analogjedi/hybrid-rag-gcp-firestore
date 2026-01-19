"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import type { CollectionStats } from "@/types";

interface ProcessingActionsProps {
  collectionId: string;
  stats: CollectionStats;
}

export function ProcessingActions({
  collectionId,
  stats,
}: ProcessingActionsProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    processed?: number;
    errors?: number;
    message?: string;
  } | null>(null);

  const hasPendingWork =
    stats.processing > 0 ||
    stats.withoutEmbedding > 0 ||
    (stats.totalDocuments > 0 && stats.coveragePercent < 100);

  const processPending = async () => {
    setIsProcessing(true);
    setResult(null);

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          action: "full",
          limit: 50,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Processing failed");
      }

      const totalProcessed =
        (data.processing?.processed || 0) + (data.embedding?.processed || 0);
      const totalErrors =
        (data.processing?.errors || 0) + (data.embedding?.errors || 0);

      setResult({
        success: totalErrors === 0,
        processed: totalProcessed,
        errors: totalErrors,
        message:
          totalProcessed > 0
            ? `Processed ${totalProcessed} documents${
                totalErrors > 0 ? ` with ${totalErrors} errors` : ""
              }`
            : "No pending documents to process",
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Processing failed",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Processing
            </CardTitle>
            <CardDescription>
              Process pending documents with Gemini and generate embeddings
            </CardDescription>
          </div>
          {hasPendingWork && (
            <Badge variant="secondary">
              {stats.processing} pending / {stats.withoutEmbedding} need
              embeddings
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <div
            className={`p-3 rounded-md ${
              result.success
                ? "bg-green-500/10 text-green-600"
                : "bg-red-500/10 text-red-600"
            }`}
          >
            <div className="flex items-center gap-2">
              {result.success ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{result.message}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button
            onClick={processPending}
            disabled={isProcessing || !hasPendingWork}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Process All Pending
              </>
            )}
          </Button>

          {!hasPendingWork && !isProcessing && (
            <span className="text-sm text-muted-foreground">
              All documents are processed and have embeddings
            </span>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Note:</strong> Processing uses Gemini to analyze document
            content and extract metadata based on the collection schema. Then
            embeddings are generated for vector search.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
