"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users,
  Cpu,
  CircuitBoard,
  FileText,
  ClipboardCheck,
  ShieldCheck,
  Loader2,
  Check,
} from "lucide-react";

// Pre-defined schema templates
const templates = [
  {
    id: "human_resources_all",
    name: "Human Resources",
    description: "HR policies, benefits, org charts, employee handbooks",
    icon: Users,
  },
  {
    id: "ic_process_engineering",
    name: "IC Process Engineering",
    description: "Fab process flows, yield analysis, defect reports",
    icon: Cpu,
  },
  {
    id: "ic_design_engineering",
    name: "IC Design Engineering",
    description: "Circuit designs, SRAM, standard cells, layout rules",
    icon: CircuitBoard,
  },
  {
    id: "products_and_datasheets",
    name: "Products & Datasheets",
    description: "Product specifications, datasheets, application notes",
    icon: FileText,
  },
  {
    id: "etq_specifications",
    name: "ETQ Specifications",
    description: "Quality specs, test procedures, reliability standards",
    icon: ClipboardCheck,
  },
  {
    id: "functional_safety",
    name: "Functional Safety",
    description: "ISO 26262, FMEA, safety analysis, ASIL requirements",
    icon: ShieldCheck,
  },
];

export default function NewCollectionPage() {
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [yamlContent, setYamlContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplate) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch the template YAML from the schemas directory
      const response = await fetch(`/api/schemas/${selectedTemplate}`);
      if (!response.ok) {
        throw new Error("Failed to load template");
      }
      const { yaml } = await response.json();

      // Create the collection
      const createResponse = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml }),
      });

      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error || "Failed to create collection");
      }

      const { collection } = await createResponse.json();
      router.push(`/collections/${collection.collection.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFromYaml = async () => {
    if (!yamlContent.trim()) {
      setError("Please enter YAML content");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yaml: yamlContent }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create collection");
      }

      const { collection } = await response.json();
      router.push(`/collections/${collection.collection.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create collection");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Collection"
        description="Create a new document collection"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            { label: "New Collection" },
          ]}
        />

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-4">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="template" className="space-y-6">
          <TabsList>
            <TabsTrigger value="template">From Template</TabsTrigger>
            <TabsTrigger value="yaml">From YAML</TabsTrigger>
          </TabsList>

          <TabsContent value="template" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Choose a Template</CardTitle>
                <CardDescription>
                  Select a pre-defined schema template for your collection
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templates.map((template) => {
                    const IconComponent = template.icon;
                    const isSelected = selectedTemplate === template.id;
                    return (
                      <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template.id)}
                        className={`p-4 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`p-2 rounded-md ${
                              isSelected ? "bg-primary/10" : "bg-muted"
                            }`}
                          >
                            <IconComponent
                              className={`h-5 w-5 ${
                                isSelected ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{template.name}</p>
                              {isSelected && (
                                <Check className="h-4 w-4 text-primary" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {template.description}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={handleCreateFromTemplate}
                    disabled={!selectedTemplate || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Collection"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Paste YAML Schema</CardTitle>
                <CardDescription>
                  Enter your collection schema in YAML format
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="yaml">Schema YAML</Label>
                  <Textarea
                    id="yaml"
                    placeholder={`collection:
  id: my_collection
  display_name: "My Collection"
  description: "..."
  icon: "file-text"

fields:
  - name: summary
    type: string
    source: gemini
    prompt: "..."
  ...`}
                    className="font-mono text-sm min-h-[400px]"
                    value={yamlContent}
                    onChange={(e) => setYamlContent(e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleCreateFromYaml}
                    disabled={!yamlContent.trim() || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Collection"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
