"use client";

import { Brain, ArrowRight, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ClassificationResult } from "@/types";

interface ClassificationPanelProps {
  classification: ClassificationResult;
}

export function ClassificationPanel({ classification }: ClassificationPanelProps) {
  const strategyLabels = {
    primary_only: "Search primary collection only",
    primary_then_secondary: "Search primary, then secondary if needed",
    parallel: "Search all relevant collections in parallel",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4" />
          Query Classification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Collection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Primary Collection</span>
            <Badge variant="default">{classification.primary_collection}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Progress
              value={classification.primary_confidence * 100}
              className="h-2 flex-1"
            />
            <span className="text-xs text-muted-foreground w-12 text-right">
              {Math.round(classification.primary_confidence * 100)}%
            </span>
          </div>
        </div>

        {/* Secondary Collections */}
        {classification.secondary_collections.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Secondary Collections</span>
              <span className="text-xs text-muted-foreground">
                {Math.round(classification.secondary_confidence * 100)}% confidence
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {classification.secondary_collections.map((collId) => (
                <Badge key={collId} variant="outline">
                  {collId}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search Strategy */}
        <div className="pt-2 border-t">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-muted-foreground">
              {strategyLabels[classification.search_strategy]}
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div className="pt-2 border-t">
          <p className="text-sm font-medium mb-1">Reasoning</p>
          <p className="text-sm text-muted-foreground">{classification.reasoning}</p>
        </div>
      </CardContent>
    </Card>
  );
}
