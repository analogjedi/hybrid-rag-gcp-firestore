import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDocument } from "@/lib/firebase/documents";
import { getCollection } from "@/lib/firebase/collections";
import { getDownloadUrl } from "@/lib/firebase/storage";
import { ExternalLink, FileText, Download, Clock, CheckCircle, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ collectionId: string; docId: string }>;
}

export default async function DocumentDetailPage({ params }: PageProps) {
  const { collectionId, docId } = await params;

  let document;
  let collection;
  let downloadUrl;

  try {
    document = await getDocument(collectionId, docId);
    if (!document) {
      notFound();
    }
    collection = await getCollection(collectionId);
    if (document.storagePath) {
      downloadUrl = await getDownloadUrl(document.storagePath);
    }
  } catch (error) {
    notFound();
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "long",
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

  const statusConfig = {
    pending: { icon: Clock, color: "text-muted-foreground", label: "Pending" },
    analyzing: { icon: Clock, color: "text-blue-500", label: "Analyzing" },
    metadata_ready: { icon: Clock, color: "text-yellow-500", label: "Metadata Ready" },
    embedding: { icon: Clock, color: "text-blue-500", label: "Embedding" },
    ready: { icon: CheckCircle, color: "text-green-500", label: "Ready" },
    error: { icon: AlertCircle, color: "text-destructive", label: "Error" },
  };

  const StatusIcon = statusConfig[document.status].icon;

  return (
    <div className="flex flex-col h-full">
      <Header
        title={document.fileName}
        description={collection?.collection.display_name}
      >
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </a>
        )}
      </Header>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            { label: collectionId, href: `/collections/${collectionId}` },
            { label: "Documents", href: `/collections/${collectionId}/documents` },
            { label: document.fileName },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {document.content?.summary ? (
                  <p className="text-sm">{document.content.summary}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No summary available yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Keywords */}
            <Card>
              <CardHeader>
                <CardTitle>Keywords</CardTitle>
              </CardHeader>
              <CardContent>
                {document.content?.keywords?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {document.content.keywords.map((keyword) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No keywords extracted yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Document Structure (Chapters) */}
            {document.content?.chapters?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Document Structure</CardTitle>
                  <CardDescription>
                    Chapter and section summaries extracted from the document
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[...document.content.chapters]
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((chapter, idx) => (
                        <div
                          key={idx}
                          className={`border-l-2 pl-4 ${
                            chapter.level === 2 ? "ml-4 border-muted" : "border-primary"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-sm">{chapter.title}</h4>
                            {chapter.pageStart && (
                              <span className="text-xs text-muted-foreground">
                                {chapter.pageEnd && chapter.pageEnd !== chapter.pageStart
                                  ? `pp. ${chapter.pageStart}-${chapter.pageEnd}`
                                  : `p. ${chapter.pageStart}`}
                              </span>
                            )}
                          </div>
                          {chapter.summary && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {chapter.summary}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Extracted Metadata */}
            {document.content && Object.keys(document.content).length > 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Metadata</CardTitle>
                  <CardDescription>
                    Fields extracted by Gemini from the document
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.entries(document.content)
                      .filter(
                        ([key]) =>
                          !["summary", "keywords", "contentUpdatedAt", "chapters"].includes(key)
                      )
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <p className="text-sm font-medium">{key}</p>
                          {Array.isArray(value) ? (
                            <div className="flex flex-wrap gap-1">
                              {value.map((v, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {String(v)}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {String(value) || "—"}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Embedding Info */}
            {document.contentEmbedding && (
              <Card>
                <CardHeader>
                  <CardTitle>Embedding</CardTitle>
                  <CardDescription>Vector embedding information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="text-sm font-medium">Dimensions</p>
                      <p className="text-sm text-muted-foreground">
                        {document.contentEmbedding.vector?.length || 768}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Model</p>
                      <p className="text-sm text-muted-foreground">
                        {document.contentEmbedding.modelVersion || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Generated</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(document.contentEmbedding.embeddedAt)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-5 w-5 ${statusConfig[document.status].color}`} />
                  <span className="font-medium">
                    {statusConfig[document.status].label}
                  </span>
                </div>
                {document.error && (
                  <p className="text-sm text-destructive mt-2">{document.error}</p>
                )}
              </CardContent>
            </Card>

            {/* File Info */}
            <Card>
              <CardHeader>
                <CardTitle>File Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium">File Name</p>
                  <p className="text-sm text-muted-foreground">{document.fileName}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">File Size</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSize(document.fileSize)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">MIME Type</p>
                  <p className="text-sm text-muted-foreground">{document.mimeType}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Uploaded</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(document.uploadedAt)}
                  </p>
                </div>
                {document.processedAt && (
                  <div>
                    <p className="text-sm font-medium">Processed</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(document.processedAt)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Storage Path */}
            <Card>
              <CardHeader>
                <CardTitle>Storage</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-xs break-all bg-muted p-2 rounded block">
                  {document.storagePath}
                </code>
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 mt-2"
                  >
                    Open in new tab
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
