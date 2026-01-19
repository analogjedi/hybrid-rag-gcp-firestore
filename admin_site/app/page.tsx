import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, FolderOpen, Search, Upload, ArrowRight, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { getAllCollections, getAllCollectionStats } from "@/lib/firebase/collections";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let collections: Awaited<ReturnType<typeof getAllCollections>> = [];
  let stats: Awaited<ReturnType<typeof getAllCollectionStats>> = [];

  try {
    collections = await getAllCollections();
    stats = await getAllCollectionStats();
  } catch (error) {
    // Firebase not configured yet - show empty state
  }

  const totalDocuments = stats.reduce((sum, s) => sum + s.totalDocuments, 0);
  const totalWithEmbedding = stats.reduce((sum, s) => sum + s.withEmbedding, 0);
  const totalProcessing = stats.reduce((sum, s) => sum + s.processing, 0);
  const totalErrored = stats.reduce((sum, s) => sum + s.errored, 0);
  const overallCoverage = totalDocuments > 0
    ? Math.round((totalWithEmbedding / totalDocuments) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        description="Enterprise document management with AI-powered semantic search"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalDocuments}</div>
              <p className="text-xs text-muted-foreground">
                Across {collections.length} collection{collections.length !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">With Embeddings</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalWithEmbedding}</div>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={overallCoverage} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">{overallCoverage}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProcessing}</div>
              <p className="text-xs text-muted-foreground">
                Documents being analyzed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Errors</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalErrored}</div>
              <p className="text-xs text-muted-foreground">
                Failed processing
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Collection Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Collections</CardTitle>
                <CardDescription>
                  Document collections with embedding coverage
                </CardDescription>
              </div>
              <Link href="/collections">
                <Button variant="outline" size="sm">
                  View all
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {stats.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">
                  No collections configured yet.
                </p>
                <Link href="/collections">
                  <Button>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Browse Collections
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {stats.map((collStats) => {
                  const collection = collections.find(
                    (c) => c.collection.id === collStats.collectionId
                  );
                  return (
                    <Link
                      key={collStats.collectionId}
                      href={`/collections/${collStats.collectionId}`}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {collection?.collection.display_name || collStats.collectionId}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {collStats.totalDocuments} documents
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Progress
                          value={collStats.coveragePercent}
                          className="w-24 h-2"
                        />
                        <span className="text-sm w-10 text-right">
                          {collStats.coveragePercent}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/collections">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Browse Collections
                </CardTitle>
                <CardDescription>
                  View and manage your document collections
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/search">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Search Documents
                </CardTitle>
                <CardDescription>
                  Use AI-powered semantic search across all collections
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/collections">
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Documents
                </CardTitle>
                <CardDescription>
                  Add new documents to your collections
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
