"use client";

import Link from "next/link";
import {
  FileText,
  Users,
  Cpu,
  CircuitBoard,
  ClipboardCheck,
  ShieldCheck,
  FolderOpen,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { CollectionSchema, CollectionStats } from "@/types";

const iconMap: Record<string, React.ElementType> = {
  users: Users,
  cpu: Cpu,
  "circuit-board": CircuitBoard,
  "file-text": FileText,
  "clipboard-check": ClipboardCheck,
  "shield-check": ShieldCheck,
};

interface CollectionCardProps {
  collection: CollectionSchema;
  stats?: CollectionStats;
}

export function CollectionCard({ collection, stats }: CollectionCardProps) {
  const IconComponent = iconMap[collection.collection.icon] || FolderOpen;

  return (
    <Link href={`/collections/${collection.collection.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <IconComponent className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {collection.collection.display_name}
                </CardTitle>
                <CardDescription className="text-xs">
                  {collection.collection.id}
                </CardDescription>
              </div>
            </div>
            {stats && (
              <Badge variant="secondary">{stats.totalDocuments} docs</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {collection.collection.description}
          </p>
          {stats && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Embedding coverage</span>
                <span className="font-medium">{stats.coveragePercent}%</span>
              </div>
              <Progress value={stats.coveragePercent} className="h-1.5" />
              <div className="flex gap-4 text-xs text-muted-foreground">
                {stats.processing > 0 && (
                  <span>{stats.processing} processing</span>
                )}
                {stats.errored > 0 && (
                  <span className="text-destructive">
                    {stats.errored} errors
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
