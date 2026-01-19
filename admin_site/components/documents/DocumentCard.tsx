"use client";

import Link from "next/link";
import { FileText, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Document, DocumentStatus } from "@/types";

interface DocumentCardProps {
  document: Document;
  collectionId: string;
}

const statusConfig: Record<
  DocumentStatus,
  { icon: React.ElementType; color: string }
> = {
  pending: { icon: Clock, color: "text-muted-foreground" },
  analyzing: { icon: Loader2, color: "text-blue-500" },
  metadata_ready: { icon: Clock, color: "text-yellow-500" },
  embedding: { icon: Loader2, color: "text-blue-500" },
  ready: { icon: CheckCircle, color: "text-green-500" },
  error: { icon: AlertCircle, color: "text-destructive" },
};

export function DocumentCard({ document, collectionId }: DocumentCardProps) {
  const { icon: StatusIcon, color } = statusConfig[document.status];
  const isAnimated = document.status === "analyzing" || document.status === "embedding";

  const formatDate = (dateString?: string) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <Link href={`/collections/${collectionId}/documents/${document.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <CardTitle className="text-sm font-medium truncate">
                {document.fileName}
              </CardTitle>
            </div>
            <StatusIcon
              className={`h-4 w-4 shrink-0 ${color} ${isAnimated ? "animate-spin" : ""}`}
            />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {document.content?.summary || "Processing..."}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1">
              {document.content?.keywords?.slice(0, 3).map((keyword) => (
                <Badge key={keyword} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatDate(document.uploadedAt)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
