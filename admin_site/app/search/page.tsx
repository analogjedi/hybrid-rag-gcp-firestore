"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { ClassificationPanel } from "@/components/search/ClassificationPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Brain, Database, Sparkles } from "lucide-react";
import type { SearchResponse, ClassificationResult, SearchResult } from "@/types";

export default function SearchPage() {
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [classification, setClassification] = useState<ClassificationResult | null>(null);
  const [searchMetadata, setSearchMetadata] = useState<{
    collectionsSearched: string[];
    totalCandidates: number;
    searchTimeMs: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (searchQuery: string) => {
    setIsSearching(true);
    setError(null);
    setQuery(searchQuery);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          limit: 10,
          threshold: 1.0,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Search failed");
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
      setClassification(data.classification);
      setSearchMetadata(data.searchMetadata);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setClassification(null);
      setSearchMetadata(null);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Search"
        description="Search across all document collections using natural language"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs items={[{ label: "Search" }]} />

        {/* Search Bar */}
        <SearchBar onSearch={handleSearch} isSearching={isSearching} />

        {/* Error */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {query && !isSearching && !error && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Search Results */}
            <div className="lg:col-span-2 space-y-4">
              {searchMetadata && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    Searched {searchMetadata.collectionsSearched.length} collection
                    {searchMetadata.collectionsSearched.length !== 1 ? "s" : ""}
                  </span>
                  <span>•</span>
                  <span>{searchMetadata.searchTimeMs}ms</span>
                </div>
              )}
              <SearchResults results={results} query={query} />
            </div>

            {/* Classification Panel */}
            <div className="space-y-4">
              {classification && (
                <ClassificationPanel classification={classification} />
              )}
            </div>
          </div>
        )}

        {/* Initial State */}
        {!query && !isSearching && (
          <div className="space-y-6">
            {/* How It Works */}
            <Card>
              <CardHeader>
                <CardTitle>How Agentic Search Works</CardTitle>
                <CardDescription>
                  Our intelligent search system routes your query to the most relevant collections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="h-5 w-5 text-primary" />
                      <span className="font-medium">1. Classify</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Gemini analyzes your query to determine which collection(s)
                      are most likely to contain relevant documents.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      <span className="font-medium">2. Search</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vector similarity search finds semantically similar documents
                      in the selected collections.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      <span className="font-medium">3. Rank</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Results are merged and ranked by relevance across all
                      searched collections.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Example Queries */}
            <Card>
              <CardHeader>
                <CardTitle>Example Queries</CardTitle>
                <CardDescription>
                  Try these example queries to see the agentic search in action
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    "What is the PTO policy?",
                    "7nm FinFET yield improvement techniques",
                    "ASIL D requirements for microcontrollers",
                    "FMEA template for power management",
                    "SRAM bitcell design specifications",
                    "JEDEC reliability test procedures",
                  ].map((exampleQuery) => (
                    <button
                      key={exampleQuery}
                      onClick={() => handleSearch(exampleQuery)}
                      className="p-3 text-left text-sm rounded-md bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Search className="h-3 w-3 inline mr-2 text-muted-foreground" />
                      {exampleQuery}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
