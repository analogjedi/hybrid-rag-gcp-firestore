"use client";

import { useState, use } from "react";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { ProcessingStatus } from "@/components/upload/ProcessingStatus";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Loader2 } from "lucide-react";

interface PageProps {
  params: Promise<{ collectionId: string }>;
}

interface UploadedFile {
  documentId: string;
  fileName: string;
  status: "pending" | "processing" | "done";
}

export default function UploadPage({ params }: PageProps) {
  const { collectionId } = use(params);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessingAll, setIsProcessingAll] = useState(false);

  const handleUploadComplete = (documentId: string, fileName: string) => {
    setUploadedFiles((prev) => [...prev, { documentId, fileName, status: "pending" }]);
  };

  const handleUploadError = (fileName: string, error: string) => {
    console.error(`Upload error for ${fileName}:`, error);
  };

  const handleProcessingStarted = (documentId: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) =>
        f.documentId === documentId ? { ...f, status: "processing" } : f
      )
    );
  };

  const handleProcessAll = async () => {
    setIsProcessingAll(true);
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

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Processing failed");
      }

      // Mark all as processing - polling will update actual status
      setUploadedFiles((prev) =>
        prev.map((f) => (f.status === "pending" ? { ...f, status: "processing" } : f))
      );
    } catch (err) {
      console.error("Process all error:", err);
    } finally {
      setIsProcessingAll(false);
    }
  };

  const pendingCount = uploadedFiles.filter((f) => f.status === "pending").length;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Upload Documents"
        description={`Add documents to ${collectionId}`}
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            { label: collectionId, href: `/collections/${collectionId}` },
            { label: "Upload" },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle>Upload Files</CardTitle>
              <CardDescription>
                Drag and drop PDF or Word documents to upload them for processing.
                Each document will be analyzed by Gemini to extract metadata and
                generate embeddings for search.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileDropzone
                collectionId={collectionId}
                onUploadComplete={handleUploadComplete}
                onUploadError={handleUploadError}
              />
            </CardContent>
          </Card>

          {/* Processing Status Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processing Status</CardTitle>
                  <CardDescription>
                    Track the processing status of your uploaded documents.
                    Documents go through analysis, metadata extraction, and embedding
                    generation.
                  </CardDescription>
                </div>
                {pendingCount > 0 && (
                  <Button
                    onClick={handleProcessAll}
                    disabled={isProcessingAll}
                    size="sm"
                  >
                    {isProcessingAll ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Process All ({pendingCount})
                      </>
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {uploadedFiles.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No files uploaded yet.</p>
                  <p className="text-sm">
                    Upload documents to see their processing status here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {uploadedFiles.map((file) => (
                    <ProcessingStatus
                      key={file.documentId}
                      documentId={file.documentId}
                      collectionId={collectionId}
                      fileName={file.fileName}
                      onProcessingStarted={() => handleProcessingStarted(file.documentId)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Processing Pipeline Info */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Pipeline</CardTitle>
            <CardDescription>
              How your documents are processed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-2xl font-bold text-primary mb-1">1</div>
                <div className="text-sm font-medium">Upload</div>
                <p className="text-xs text-muted-foreground mt-1">
                  File stored in Cloud Storage
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-2xl font-bold text-primary mb-1">2</div>
                <div className="text-sm font-medium">Analyze</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Gemini extracts metadata
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-2xl font-bold text-primary mb-1">3</div>
                <div className="text-sm font-medium">Embed</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Vector embedding generated
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center">
                <div className="text-2xl font-bold text-primary mb-1">4</div>
                <div className="text-sm font-medium">Ready</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Searchable via similarity
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
