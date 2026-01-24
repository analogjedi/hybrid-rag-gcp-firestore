"use client";

import { Loader2, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/types";

type PipelineStep = "upload" | "analyze" | "embed" | "ready";
type StepState = "pending" | "processing" | "completed";

interface UploadPipelineProps {
  /** The overall pipeline step based on file statuses */
  currentStep: PipelineStep;
  /** Whether any file is currently being processed */
  isProcessing: boolean;
  /** Counts for display */
  counts?: {
    uploaded: number;
    analyzing: number;
    embedding: number;
    ready: number;
  };
}

const steps: Array<{
  id: PipelineStep;
  number: number;
  title: string;
  description: string;
}> = [
  { id: "upload", number: 1, title: "Upload", description: "File stored in Cloud Storage" },
  { id: "analyze", number: 2, title: "Analyze", description: "Gemini extracts metadata" },
  { id: "embed", number: 3, title: "Embed", description: "Vector embedding generated" },
  { id: "ready", number: 4, title: "Ready", description: "Searchable via similarity" },
];

const stepOrder: Record<PipelineStep, number> = {
  upload: 0,
  analyze: 1,
  embed: 2,
  ready: 3,
};

/**
 * Determine pipeline step from document status
 */
export function statusToPipelineStep(status: DocumentStatus): PipelineStep {
  switch (status) {
    case "pending":
      return "upload"; // Uploaded but not yet analyzed
    case "analyzing":
      return "analyze";
    case "metadata_ready":
      return "embed"; // Analyzed, ready for embedding
    case "embedding":
      return "embed";
    case "ready":
      return "ready";
    case "error":
      return "upload"; // Reset to upload on error
    default:
      return "upload";
  }
}

/**
 * Check if a status is "processing" (showing spinner)
 */
export function isProcessingStatus(status: DocumentStatus): boolean {
  return status === "analyzing" || status === "embedding";
}

export function UploadPipeline({ currentStep, isProcessing, counts }: UploadPipelineProps) {
  const currentStepIndex = stepOrder[currentStep];

  const getStepState = (stepId: PipelineStep): StepState => {
    const stepIndex = stepOrder[stepId];

    if (stepIndex < currentStepIndex) {
      return "completed";
    } else if (stepIndex === currentStepIndex) {
      return isProcessing ? "processing" : "completed";
    } else {
      return "pending";
    }
  };

  const getStepStyles = (state: StepState) => {
    switch (state) {
      case "completed":
        return {
          bg: "bg-green-500/20 border-green-500/50",
          text: "text-green-400",
          numBg: "bg-green-500/30",
          icon: <Check className="h-5 w-5" />,
        };
      case "processing":
        return {
          bg: "bg-yellow-500/20 border-yellow-500/50",
          text: "text-yellow-400",
          numBg: "bg-yellow-500/30",
          icon: <Loader2 className="h-5 w-5 animate-spin" />,
        };
      default:
        return {
          bg: "bg-muted/50 border-muted-foreground/20",
          text: "text-muted-foreground",
          numBg: "bg-muted",
          icon: <Circle className="h-5 w-5" />,
        };
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {steps.map((step, idx) => {
        const state = getStepState(step.id);
        const styles = getStepStyles(state);

        return (
          <div
            key={step.id}
            className={cn(
              "relative p-4 rounded-lg border-2 text-center transition-all duration-500",
              styles.bg
            )}
          >
            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "absolute top-1/2 -right-2 w-4 h-0.5 transition-colors duration-500 hidden md:block",
                  state === "completed" ? "bg-green-500/50" : "bg-muted-foreground/20"
                )}
              />
            )}

            {/* Step icon or number */}
            <div className={cn("flex justify-center mb-2", styles.text)}>
              {state === "processing" ? (
                styles.icon
              ) : state === "completed" ? (
                styles.icon
              ) : (
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold",
                    styles.numBg
                  )}
                >
                  {step.number}
                </div>
              )}
            </div>

            {/* Title */}
            <div className={cn("text-sm font-medium", styles.text)}>{step.title}</div>

            {/* Description */}
            <p className="text-xs text-muted-foreground mt-1">{step.description}</p>

            {/* Count badge */}
            {counts && (
              <div className="mt-2">
                {step.id === "upload" && counts.uploaded > 0 && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
                    {counts.uploaded} file{counts.uploaded !== 1 ? "s" : ""}
                  </span>
                )}
                {step.id === "analyze" && counts.analyzing > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                    {counts.analyzing} processing
                  </span>
                )}
                {step.id === "embed" && counts.embedding > 0 && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                    {counts.embedding} embedding
                  </span>
                )}
                {step.id === "ready" && counts.ready > 0 && (
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                    {counts.ready} ready
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
