"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Clock, AlertCircle, Loader2, FileText, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { DocumentStatus } from "@/types";

interface ProcessingStatusProps {
  documentId: string;
  collectionId: string;
  fileName: string;
  initialStatus?: DocumentStatus;
  pollInterval?: number;
  onProcessingStarted?: () => void;
}

const statusConfig: Record<
  DocumentStatus,
  {
    icon: React.ElementType;
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    progress: number;
  }
> = {
  pending: {
    icon: Clock,
    label: "Pending",
    variant: "secondary",
    progress: 10,
  },
  analyzing: {
    icon: Loader2,
    label: "Analyzing with Gemini",
    variant: "secondary",
    progress: 40,
  },
  metadata_ready: {
    icon: FileText,
    label: "Metadata Ready",
    variant: "secondary",
    progress: 70,
  },
  embedding: {
    icon: Loader2,
    label: "Generating Embedding",
    variant: "secondary",
    progress: 85,
  },
  ready: {
    icon: CheckCircle,
    label: "Ready",
    variant: "default",
    progress: 100,
  },
  error: {
    icon: AlertCircle,
    label: "Error",
    variant: "destructive",
    progress: 0,
  },
};

export function ProcessingStatus({
  documentId,
  collectionId,
  fileName,
  initialStatus = "pending",
  pollInterval = 2000,
  onProcessingStarted,
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<DocumentStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (status === "ready" || status === "error") {
      return;
    }

    const poll = async () => {
      try {
        const response = await fetch(
          `/api/documents/${documentId}?collectionId=${collectionId}`
        );
        if (response.ok) {
          const data = await response.json();
          setStatus(data.document.status);
          if (data.document.error) {
            setError(data.document.error);
          }
        }
      } catch (err) {
        console.error("Error polling status:", err);
      }
    };

    const interval = setInterval(poll, pollInterval);
    return () => clearInterval(interval);
  }, [documentId, collectionId, status, pollInterval]);

  const handleProcessNow = async () => {
    setIsProcessing(true);
    setError(null);
    onProcessingStarted?.();

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionId,
          documentId,
          action: "full",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Processing failed");
      }

      // Status will be updated by polling
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const config = statusConfig[status];
  const IconComponent = config.icon;
  const isAnimated = status === "analyzing" || status === "embedding" || isProcessing;
  const showProcessButton = status === "pending" && !isProcessing;

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
      <div className="shrink-0">
        <IconComponent
          className={`h-5 w-5 ${
            status === "ready"
              ? "text-green-500"
              : status === "error"
              ? "text-destructive"
              : "text-muted-foreground"
          } ${isAnimated ? "animate-spin" : ""}`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <Badge variant={config.variant} className="text-xs">
            {isProcessing ? "Processing..." : config.label}
          </Badge>
        </div>
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
        {status !== "ready" && status !== "error" && (
          <Progress value={isProcessing ? 30 : config.progress} className="h-1 mt-2" />
        )}
      </div>

      {showProcessButton && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleProcessNow}
          className="shrink-0"
        >
          <Play className="h-3 w-3 mr-1" />
          Process
        </Button>
      )}
    </div>
  );
}
