import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { CollectionStats } from "@/components/collections/CollectionStats";
import { ProcessingActions } from "@/components/collections/ProcessingActions";
import { RebuildKeywordsAction } from "@/components/collections/RebuildKeywordsAction";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Code, ArrowRight } from "lucide-react";
import { getCollection, getCollectionStats } from "@/lib/firebase/collections";
import { getRecentDocuments } from "@/lib/firebase/documents";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ collectionId: string }>;
}

export default async function CollectionDetailPage({ params }: PageProps) {
  const { collectionId } = await params;

  let collection;
  let stats;
  let recentDocs;

  try {
    collection = await getCollection(collectionId);
    console.log(`[CollectionDetail] Looking for collection: ${collectionId}`);
    console.log(`[CollectionDetail] Found collection:`, collection);
    if (!collection) {
      console.log(`[CollectionDetail] Collection not found, calling notFound()`);
      notFound();
    }
    stats = await getCollectionStats(collectionId);
    recentDocs = await getRecentDocuments(collectionId, 5);
  } catch (error) {
    console.error(`[CollectionDetail] Error loading collection ${collectionId}:`, error);
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={collection.collection.display_name}
        description={collection.collection.description}
      >
        <Link href={`/collections/${collectionId}/upload`}>
          <Button size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Upload Documents
          </Button>
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            { label: collection.collection.display_name },
          ]}
        />

        {/* Stats */}
        <CollectionStats stats={stats} />

        {/* AI Processing Actions */}
        <ProcessingActions collectionId={collectionId} stats={stats} />

        {/* Keyword Aggregation */}
        <RebuildKeywordsAction collectionId={collectionId} />

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href={`/collections/${collectionId}/documents`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Browse Documents
                </CardTitle>
                <CardDescription>
                  View and manage all documents in this collection
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-primary">
                  View all {stats.totalDocuments} documents
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/collections/${collectionId}/upload`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-4 w-4" />
                  Upload Documents
                </CardTitle>
                <CardDescription>
                  Add new documents via drag-and-drop or file picker
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-primary">
                  Start uploading
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href={`/collections/${collectionId}/schema`}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Code className="h-4 w-4" />
                  View Schema
                </CardTitle>
                <CardDescription>
                  See the YAML schema definition for this collection
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-primary">
                  View schema
                  <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Recent Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Documents</CardTitle>
              <Link href={`/collections/${collectionId}/documents`}>
                <Button variant="ghost" size="sm">
                  View all
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No documents yet. Upload some documents to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {recentDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.content?.summary
                            ? doc.content.summary.slice(0, 80) + "..."
                            : "Processing..."}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        doc.status === "ready"
                          ? "default"
                          : doc.status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {doc.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Schema Fields Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Schema Fields</CardTitle>
            <CardDescription>
              Fields extracted from documents in this collection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {collection.fields.map((field) => (
                <div
                  key={field.name}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <code className="text-sm">{field.name}</code>
                    <Badge variant="outline" className="text-xs">
                      {field.type}
                    </Badge>
                  </div>
                  <Badge
                    variant={field.source === "gemini" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {field.source}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
