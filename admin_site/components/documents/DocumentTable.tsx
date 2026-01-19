"use client";

import Link from "next/link";
import { FileText, ExternalLink } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Document, DocumentStatus } from "@/types";

interface DocumentTableProps {
  documents: Document[];
  collectionId: string;
}

const statusVariants: Record<DocumentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  analyzing: "secondary",
  metadata_ready: "secondary",
  embedding: "secondary",
  ready: "default",
  error: "destructive",
};

export function DocumentTable({ documents, collectionId }: DocumentTableProps) {
  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File Name</TableHead>
          <TableHead>Summary</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium truncate max-w-[200px]">
                  {doc.fileName}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground truncate max-w-[300px] block">
                {doc.content?.summary
                  ? doc.content.summary.slice(0, 100) + "..."
                  : "—"}
              </span>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariants[doc.status]}>{doc.status}</Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatSize(doc.fileSize)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(doc.uploadedAt)}
            </TableCell>
            <TableCell className="text-right">
              <Link
                href={`/collections/${collectionId}/documents/${doc.id}`}
              >
                <Button variant="ghost" size="sm">
                  View
                  <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </TableCell>
          </TableRow>
        ))}
        {documents.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-8">
              <p className="text-muted-foreground">No documents found</p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
