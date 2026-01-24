"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Circle, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = "pending" | "processing" | "completed" | "error";

interface PipelineStep {
  id: string;
  number: number;
  title: string;
  description: string;
  status: StepStatus;
}

interface LogEntry {
  timestamp: string;
  step: string;
  message: string;
  type: "info" | "success" | "error" | "data";
}

interface ProcessingPipelineProps {
  collectionId: string;
  documentId: string;
  initialStatus: string;
  hasEmbedding: boolean;
  elementCounts?: { tables: number; figures: number; images: number };
}

export function ProcessingPipeline({
  collectionId,
  documentId,
  initialStatus,
  hasEmbedding,
  elementCounts,
}: ProcessingPipelineProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Determine initial step states based on document status
  const getInitialSteps = useCallback((): PipelineStep[] => {
    const uploadComplete = true; // Always complete if we're viewing the doc
    const analyzeComplete = ["metadata_ready", "embedding", "ready"].includes(initialStatus);
    const embedComplete = hasEmbedding || initialStatus === "ready";
    const allComplete = initialStatus === "ready" && hasEmbedding;

    return [
      {
        id: "upload",
        number: 1,
        title: "Upload",
        description: "File stored in Cloud Storage",
        status: uploadComplete ? "completed" : "pending",
      },
      {
        id: "analyze",
        number: 2,
        title: "Analyze",
        description: "Gemini extracts metadata",
        status: analyzeComplete ? "completed" : initialStatus === "analyzing" ? "processing" : "pending",
      },
      {
        id: "embed",
        number: 3,
        title: "Embed",
        description: "Vector embedding generated",
        status: embedComplete ? "completed" : initialStatus === "embedding" ? "processing" : "pending",
      },
      {
        id: "ready",
        number: 4,
        title: "Ready",
        description: "Searchable via similarity",
        status: allComplete ? "completed" : "pending",
      },
    ];
  }, [initialStatus, hasEmbedding]);

  const [steps, setSteps] = useState<PipelineStep[]>(getInitialSteps);

  // Update steps when props change
  useEffect(() => {
    if (!isRunning) {
      setSteps(getInitialSteps());
    }
  }, [initialStatus, hasEmbedding, isRunning, getInitialSteps]);

  const addLog = (step: string, message: string, type: LogEntry["type"] = "info") => {
    const entry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      step,
      message,
      type,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const updateStepStatus = (stepId: string, status: StepStatus) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, status } : step))
    );
  };

  const runPipeline = async () => {
    setIsRunning(true);
    setLogs([]);

    try {
      // Step 1: Upload is already complete
      addLog("Upload", "File already uploaded to Cloud Storage", "success");

      // Step 2: Analyze (if not already done)
      const currentAnalyzeStep = steps.find((s) => s.id === "analyze");
      if (currentAnalyzeStep?.status !== "completed") {
        updateStepStatus("analyze", "processing");
        addLog("Analyze", "Starting Gemini multimodal analysis...", "info");

        const analyzeResponse = await fetch("/api/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId, documentId, action: "process" }),
        });

        const analyzeResult = await analyzeResponse.json();

        if (!analyzeResponse.ok) {
          throw new Error(analyzeResult.error || "Analysis failed");
        }

        addLog("Analyze", "Metadata extraction complete", "success");

        // Log extracted element counts
        if (analyzeResult.metadata) {
          const tables = analyzeResult.metadata.tables?.length || 0;
          const figures = analyzeResult.metadata.figures?.length || 0;
          const images = analyzeResult.metadata.images?.length || 0;
          const chapters = analyzeResult.metadata.chapters?.length || 0;

          addLog("Analyze", `Extracted: ${chapters} chapters, ${tables} tables, ${figures} figures, ${images} images`, "data");

          if (analyzeResult.elementsCreated > 0) {
            addLog("Analyze", `Created ${analyzeResult.elementsCreated} element documents for granular search`, "data");
          }
        }

        updateStepStatus("analyze", "completed");
      } else {
        addLog("Analyze", "Analysis already complete, skipping...", "info");
      }

      // Step 3: Generate embeddings
      const currentEmbedStep = steps.find((s) => s.id === "embed");
      if (currentEmbedStep?.status !== "completed") {
        updateStepStatus("embed", "processing");
        addLog("Embed", "Generating document embedding...", "info");

        const embedResponse = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId, documentId }),
        });

        const embedResult = await embedResponse.json();

        if (!embedResponse.ok) {
          throw new Error(embedResult.error || "Embedding generation failed");
        }

        if (embedResult.skipped) {
          addLog("Embed", `Skipped: ${embedResult.reason}`, "info");
        } else {
          addLog("Embed", "Document embedding generated (2048 dimensions)", "success");
        }

        // Generate element embeddings if there are elements
        addLog("Embed", "Generating element embeddings...", "info");

        const elementEmbedResponse = await fetch("/api/embed-elements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collectionId, documentId }),
        });

        const elementEmbedResult = await elementEmbedResponse.json();

        if (elementEmbedResponse.ok && elementEmbedResult.processed > 0) {
          addLog("Embed", `Generated ${elementEmbedResult.processed} element embeddings`, "success");
        } else if (elementEmbedResult.processed === 0) {
          addLog("Embed", "No pending elements to embed", "info");
        }

        updateStepStatus("embed", "completed");
      } else {
        addLog("Embed", "Embeddings already generated, skipping...", "info");
      }

      // Step 4: Mark as ready
      updateStepStatus("ready", "completed");
      addLog("Ready", "Document is now searchable!", "success");

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      addLog("Error", message, "error");

      // Mark current processing step as error
      setSteps((prev) =>
        prev.map((step) =>
          step.status === "processing" ? { ...step, status: "error" } : step
        )
      );
    } finally {
      setIsRunning(false);
    }
  };

  const resetPipeline = () => {
    setSteps(getInitialSteps());
    setLogs([]);
  };

  const getStepStyles = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return {
          bg: "bg-green-500/20 border-green-500",
          text: "text-green-500",
          icon: <Check className="h-6 w-6" />,
        };
      case "processing":
        return {
          bg: "bg-yellow-500/20 border-yellow-500",
          text: "text-yellow-500",
          icon: <Loader2 className="h-6 w-6 animate-spin" />,
        };
      case "error":
        return {
          bg: "bg-red-500/20 border-red-500",
          text: "text-red-500",
          icon: <Circle className="h-6 w-6" />,
        };
      default:
        return {
          bg: "bg-muted border-muted-foreground/30",
          text: "text-muted-foreground",
          icon: <Circle className="h-6 w-6" />,
        };
    }
  };

  const allComplete = steps.every((s) => s.status === "completed");
  const canRun = !isRunning && !allComplete;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Processing Pipeline</CardTitle>
            <CardDescription>How your document is processed</CardDescription>
          </div>
          <div className="flex gap-2">
            {canRun && (
              <Button onClick={runPipeline} size="sm">
                <Play className="h-4 w-4 mr-2" />
                Run Pipeline
              </Button>
            )}
            {(logs.length > 0 || allComplete) && (
              <Button onClick={resetPipeline} size="sm" variant="outline">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pipeline Steps */}
        <div className="grid grid-cols-4 gap-4">
          {steps.map((step, idx) => {
            const styles = getStepStyles(step.status);
            return (
              <div
                key={step.id}
                className={cn(
                  "relative rounded-lg border-2 p-4 text-center transition-all duration-300",
                  styles.bg
                )}
              >
                {/* Connector line */}
                {idx < steps.length - 1 && (
                  <div className="absolute top-1/2 -right-2 w-4 h-0.5 bg-muted-foreground/30" />
                )}

                <div className={cn("flex justify-center mb-2", styles.text)}>
                  {styles.icon}
                </div>
                <div className={cn("text-2xl font-bold mb-1", styles.text)}>
                  {step.number}
                </div>
                <div className="font-medium text-sm">{step.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {step.description}
                </div>
              </div>
            );
          })}
        </div>

        {/* Log Panel */}
        {logs.length > 0 && (
          <div className="border rounded-lg bg-black/50 p-4 max-h-64 overflow-auto font-mono text-xs">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={cn(
                  "py-1",
                  log.type === "success" && "text-green-400",
                  log.type === "error" && "text-red-400",
                  log.type === "data" && "text-blue-400",
                  log.type === "info" && "text-gray-300"
                )}
              >
                <span className="text-gray-500">[{log.timestamp}]</span>{" "}
                <span className="text-purple-400">[{log.step}]</span>{" "}
                {log.message}
              </div>
            ))}
            {isRunning && (
              <div className="py-1 text-yellow-400 animate-pulse">
                Processing...
              </div>
            )}
          </div>
        )}

        {/* Element counts if available */}
        {elementCounts && (elementCounts.tables > 0 || elementCounts.figures > 0 || elementCounts.images > 0) && (
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Extracted elements:</span>
            {elementCounts.tables > 0 && <span>{elementCounts.tables} tables</span>}
            {elementCounts.figures > 0 && <span>{elementCounts.figures} figures</span>}
            {elementCounts.images > 0 && <span>{elementCounts.images} images</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
