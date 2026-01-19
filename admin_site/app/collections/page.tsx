import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { CollectionCard } from "@/components/collections/CollectionCard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { getAllCollections, getAllCollectionStats } from "@/lib/firebase/collections";
import type { CollectionSchema, CollectionStats } from "@/types";

export const dynamic = "force-dynamic";

export default async function CollectionsPage() {
  let collections: CollectionSchema[] = [];
  let stats: CollectionStats[] = [];

  try {
    collections = await getAllCollections();
    stats = await getAllCollectionStats();
  } catch (error) {
    // If Firebase is not configured, show empty state
    collections = [];
    stats = [];
  }

  const collectionsWithStats = collections.map((collection) => ({
    collection,
    stats: stats.find((s) => s.collectionId === collection.collection.id),
  }));

  return (
    <div className="flex flex-col h-full">
      <Header title="Collections">
        <Link href="/collections/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Collection
          </Button>
        </Link>
      </Header>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs items={[{ label: "Collections" }]} />

        {collectionsWithStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground mb-4">
              No collections found. Create your first collection to get started.
            </p>
            <Link href="/collections/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Collection
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {collectionsWithStats.map(({ collection, stats }) => (
              <CollectionCard
                key={collection.collection.id}
                collection={collection}
                stats={stats}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
