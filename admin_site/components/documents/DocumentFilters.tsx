"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Search } from "lucide-react";
import type { DocumentStatus } from "@/types";

interface DocumentFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  statusFilter: DocumentStatus | "all";
  onStatusChange: (value: DocumentStatus | "all") => void;
  viewMode: "table" | "grid";
  onViewModeChange: (mode: "table" | "grid") => void;
}

export function DocumentFilters({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  viewMode,
  onViewModeChange,
}: DocumentFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search documents..."
          className="pl-8"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Select
        value={statusFilter}
        onValueChange={(value) => onStatusChange(value as DocumentStatus | "all")}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="analyzing">Analyzing</SelectItem>
          <SelectItem value="metadata_ready">Metadata Ready</SelectItem>
          <SelectItem value="embedding">Embedding</SelectItem>
          <SelectItem value="ready">Ready</SelectItem>
          <SelectItem value="error">Error</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex border rounded-md">
        <Button
          variant={viewMode === "table" ? "secondary" : "ghost"}
          size="icon"
          className="rounded-r-none"
          onClick={() => onViewModeChange("table")}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "grid" ? "secondary" : "ghost"}
          size="icon"
          className="rounded-l-none"
          onClick={() => onViewModeChange("grid")}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
