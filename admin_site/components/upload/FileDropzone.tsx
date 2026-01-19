"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface FileWithStatus {
  file: File;
  id: string;
  status: "pending" | "uploading" | "success" | "error";
  progress: number;
  error?: string;
  documentId?: string;
}

interface FileDropzoneProps {
  collectionId: string;
  onUploadComplete?: (documentId: string, fileName: string) => void;
  onUploadError?: (fileName: string, error: string) => void;
  maxFiles?: number;
  maxSize?: number; // in bytes
}

export function FileDropzone({
  collectionId,
  onUploadComplete,
  onUploadError,
  maxFiles = 10,
  maxSize = 50 * 1024 * 1024, // 50MB default
}: FileDropzoneProps) {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: FileWithStatus[] = acceptedFiles.map((file) => ({
        file,
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        status: "pending",
        progress: 0,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: {
        "application/pdf": [".pdf"],
        "application/msword": [".doc"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          [".docx"],
      },
      maxFiles,
      maxSize,
    });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadFile = async (fileWithStatus: FileWithStatus) => {
    const { file, id } = fileWithStatus;

    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, status: "uploading", progress: 0 } : f
      )
    );

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("collectionId", collectionId);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const data = await response.json();

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                status: "success",
                progress: 100,
                documentId: data.document.id,
              }
            : f
        )
      );

      onUploadComplete?.(data.document.id, file.name);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";

      setFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, status: "error", error: errorMessage } : f
        )
      );

      onUploadError?.(file.name, errorMessage);
    }
  };

  const uploadAll = async () => {
    setIsUploading(true);
    const pendingFiles = files.filter((f) => f.status === "pending");

    for (const fileWithStatus of pendingFiles) {
      await uploadFile(fileWithStatus);
    }

    setIsUploading(false);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const successCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive && "border-primary bg-primary/5",
          isDragReject && "border-destructive bg-destructive/5",
          !isDragActive && !isDragReject && "border-muted-foreground/25 hover:border-primary/50"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-primary">Drop the files here...</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-1">
              Drag & drop files here, or click to select
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF and Word documents (max {maxSize / 1024 / 1024}MB)
            </p>
          </>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Files ({files.length})
              {successCount > 0 && (
                <span className="text-green-500 ml-2">
                  {successCount} uploaded
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-destructive ml-2">
                  {errorCount} failed
                </span>
              )}
            </h3>
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={uploadAll}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {pendingCount} file{pendingCount > 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="space-y-2 max-h-64 overflow-auto">
            {files.map((fileWithStatus) => (
              <FileItem
                key={fileWithStatus.id}
                fileWithStatus={fileWithStatus}
                onRemove={() => removeFile(fileWithStatus.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface FileItemProps {
  fileWithStatus: FileWithStatus;
  onRemove: () => void;
}

function FileItem({ fileWithStatus, onRemove }: FileItemProps) {
  const { file, status, progress, error } = fileWithStatus;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
      <div className="shrink-0">
        {status === "success" ? (
          <CheckCircle className="h-5 w-5 text-green-500" />
        ) : status === "error" ? (
          <AlertCircle className="h-5 w-5 text-destructive" />
        ) : status === "uploading" ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <File className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatSize(file.size)}
          {error && <span className="text-destructive ml-2">{error}</span>}
        </p>
        {status === "uploading" && (
          <Progress value={progress} className="h-1 mt-1" />
        )}
      </div>

      {status !== "uploading" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={onRemove}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
