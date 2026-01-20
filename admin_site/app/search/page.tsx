"use client";

import { useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { SearchBar } from "@/components/search/SearchBar";
import { SearchResults } from "@/components/search/SearchResults";
import { ClassificationPanel } from "@/components/search/ClassificationPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Brain, Database, Sparkles, SlidersHorizontal, Cpu, Zap, Bug } from "lucide-react";
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

  // Threshold controls
  const [threshold, setThreshold] = useState(0.25);
  const [showAll, setShowAll] = useState(false);
  const [lastSearchQuery, setLastSearchQuery] = useState("");

  // Model and thinking controls
  const [model, setModel] = useState<"gemini-3-pro-preview" | "gemini-3-flash-preview">("gemini-3-flash-preview");
  const [thinkingLevel, setThinkingLevel] = useState<"LOW" | "HIGH">("LOW");

  // Debug mode for multi-permutation search
  const [debugMode, setDebugMode] = useState(false);

  const performSearch = useCallback(async (
    searchQuery: string,
    searchThreshold: number,
    searchModel: string,
    searchThinkingLevel: string,
    searchDebugMode: boolean
  ) => {
    setIsSearching(true);
    setError(null);
    setQuery(searchQuery);
    setLastSearchQuery(searchQuery);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: searchQuery,
          limit: 20,  // Fetch more to allow filtering
          threshold: searchThreshold,
          model: searchModel,
          thinkingLevel: searchThinkingLevel,
          debugMode: searchDebugMode,
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
  }, []); // No deps needed - all params passed explicitly

  const handleSearch = async (searchQuery: string) => {
    const effectiveThreshold = showAll ? -1 : threshold;
    await performSearch(searchQuery, effectiveThreshold, model, thinkingLevel, debugMode);
  };

  const handleThresholdChange = (value: number[]) => {
    // Only update state during drag - don't trigger search
    setThreshold(value[0]);
  };

  const handleThresholdCommit = async (value: number[]) => {
    // Trigger search when user finishes dragging
    const newThreshold = value[0];
    if (lastSearchQuery && !showAll) {
      await performSearch(lastSearchQuery, newThreshold, model, thinkingLevel, debugMode);
    }
  };

  const handleShowAllChange = async (checked: boolean) => {
    setShowAll(checked);
    // Re-search if we have an active query
    if (lastSearchQuery) {
      await performSearch(lastSearchQuery, checked ? -1 : threshold, model, thinkingLevel, debugMode);
    }
  };

  const handleModelChange = async (value: "gemini-3-pro-preview" | "gemini-3-flash-preview") => {
    setModel(value);
    // Re-search if we have an active query
    if (lastSearchQuery) {
      const effectiveThreshold = showAll ? -1 : threshold;
      await performSearch(lastSearchQuery, effectiveThreshold, value, thinkingLevel, debugMode);
    }
  };

  const handleThinkingLevelChange = async (value: "LOW" | "HIGH") => {
    setThinkingLevel(value);
    // Re-search if we have an active query
    if (lastSearchQuery) {
      const effectiveThreshold = showAll ? -1 : threshold;
      await performSearch(lastSearchQuery, effectiveThreshold, model, value, debugMode);
    }
  };

  const handleDebugModeChange = async (checked: boolean) => {
    setDebugMode(checked);
    // Re-search if we have an active query
    if (lastSearchQuery) {
      const effectiveThreshold = showAll ? -1 : threshold;
      await performSearch(lastSearchQuery, effectiveThreshold, model, thinkingLevel, checked);
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

        {/* Search Controls */}
        <Card>
          <CardContent className="py-4 space-y-4">
            {/* Row 1: Model and Thinking */}
            <div className="flex flex-wrap items-center gap-6">
              {/* Model Selection */}
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Model</Label>
                <Select value={model} onValueChange={handleModelChange}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini-3-pro-preview">Gemini 3 Pro</SelectItem>
                    <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Thinking Level */}
              <div className="flex items-center gap-2 border-l pl-6">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Thinking</Label>
                <Select value={thinkingLevel} onValueChange={handleThinkingLevelChange}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Show All Toggle */}
              <div className="flex items-center gap-2 border-l pl-6">
                <Switch
                  id="show-all"
                  checked={showAll}
                  onCheckedChange={handleShowAllChange}
                />
                <Label htmlFor="show-all" className="text-sm cursor-pointer whitespace-nowrap">
                  Show All
                </Label>
              </div>

              {/* Debug Mode Toggle */}
              <div className={`flex items-center gap-2 border-l pl-6 rounded-md px-3 py-1 transition-colors ${debugMode ? "bg-amber-500/20 border-amber-500/50" : ""}`}>
                <Switch
                  id="debug-mode"
                  checked={debugMode}
                  onCheckedChange={handleDebugModeChange}
                />
                <Label htmlFor="debug-mode" className={`text-sm cursor-pointer whitespace-nowrap ${debugMode ? "text-amber-500 font-medium" : ""}`}>
                  Debug Mode
                </Label>
                <Bug className={`h-4 w-4 ${debugMode ? "text-amber-500" : "text-muted-foreground"}`} />
              </div>
            </div>

            {/* Row 2: Threshold Slider - separate row for better interaction */}
            <div className={`flex items-center gap-4 pt-2 border-t ${showAll ? "opacity-50" : ""}`}>
              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className={`text-sm font-medium ${showAll ? "text-muted-foreground" : ""}`}>Similarity Threshold</span>
              <span className="text-xs text-muted-foreground">0%</span>
              <Slider
                value={[threshold]}
                onValueChange={handleThresholdChange}
                onValueCommit={handleThresholdCommit}
                min={0}
                max={0.7}
                step={0.05}
                disabled={showAll}
                className="flex-1 max-w-xs"
              />
              <span className="text-xs text-muted-foreground">70%</span>
              <span className="text-sm font-mono font-bold w-12 text-right">
                {showAll ? "Off" : `${(threshold * 100).toFixed(0)}%`}
              </span>
            </div>
          </CardContent>
        </Card>

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
              <SearchResults results={results} query={query} debugMode={debugMode} />
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
