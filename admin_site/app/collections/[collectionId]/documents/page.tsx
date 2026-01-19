"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { DocumentTable } from "@/components/documents/DocumentTable";
import { DocumentCard } from "@/components/documents/DocumentCard";
import { DocumentFilters } from "@/components/documents/DocumentFilters";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Loader2 } from "lucide-react";
import type { Document, DocumentStatus } from "@/types";

interface PageProps {
  params: Promise<{ collectionId: string }>;
}

export default function DocumentsPage({ params }: PageProps) {
  const { collectionId } = use(params);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "all">("all");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const params = new URLSearchParams({ collectionId });
        if (statusFilter !== "all") {
          params.append("status", statusFilter);
        }

        const response = await fetch(`/api/documents?${params}`);
        if (response.ok) {
          const data = await response.json();
          setDocuments(data.documents);
        }
      } catch (error) {
        console.error("Error fetching documents:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [collectionId, statusFilter]);

  // Client-side search filtering
  const filteredDocuments = documents.filter((doc) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      doc.fileName.toLowerCase().includes(query) ||
      doc.content?.summary?.toLowerCase().includes(query) ||
      doc.content?.keywords?.some((k) => k.toLowerCase().includes(query))
    );
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Documents" description={`Browse documents in ${collectionId}`}>
        <Link href={`/collections/${collectionId}/upload`}>
          <Button size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            { label: collectionId, href: `/collections/${collectionId}` },
            { label: "Documents" },
          ]}
        />

        <DocumentFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === "table" ? (
          <Card>
            <CardContent className="p-0">
              <DocumentTable
                documents={filteredDocuments}
                collectionId={collectionId}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredDocuments.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                collectionId={collectionId}
              />
            ))}
            {filteredDocuments.length === 0 && (
              <div className="col-span-full text-center py-12">
                <p className="text-muted-foreground">No documents found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
