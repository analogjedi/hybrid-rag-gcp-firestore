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
import { RefreshCw, Loader2, AlertCircle, Hash } from "lucide-react";

interface RebuildKeywordsActionProps {
  collectionId: string;
}

export function RebuildKeywordsAction({
  collectionId,
}: RebuildKeywordsActionProps) {
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    documentsScanned?: number;
    uniqueKeywords?: number;
    message?: string;
  } | null>(null);

  const rebuildKeywords = async () => {
    setIsRebuilding(true);
    setResult(null);

    try {
      const response = await fetch(
        `/api/collections/${collectionId}/rebuild-keywords`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Rebuild failed");
      }

      setResult({
        success: true,
        documentsScanned: data.documentsScanned,
        uniqueKeywords: data.uniqueKeywords,
        message: `Scanned ${data.documentsScanned} documents, found ${data.uniqueKeywords} unique keywords`,
      });
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : "Rebuild failed",
      });
    } finally {
      setIsRebuilding(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Document Keywords
            </CardTitle>
            <CardDescription>
              Rebuild aggregated keywords from all documents for classifier
              routing
            </CardDescription>
          </div>
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
          <Button onClick={rebuildKeywords} disabled={isRebuilding} variant="outline">
            {isRebuilding ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rebuilding...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Keywords
              </>
            )}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          <p>
            <strong>Note:</strong> This scans all documents and aggregates their
            keywords with frequency counts. The classifier uses these to route
            queries to the correct collection.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
