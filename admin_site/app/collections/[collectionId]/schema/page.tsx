import { notFound } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollection } from "@/lib/firebase/collections";
import { serializeSchema } from "@/lib/schema/parser";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ collectionId: string }>;
}

export default async function SchemaPage({ params }: PageProps) {
  const { collectionId } = await params;

  let collection;

  try {
    collection = await getCollection(collectionId);
    if (!collection) {
      notFound();
    }
  } catch (error) {
    notFound();
  }

  const yamlContent = serializeSchema(collection);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Schema Definition"
        description={`YAML schema for ${collection.collection.display_name}`}
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <Breadcrumbs
          items={[
            { label: "Collections", href: "/collections" },
            {
              label: collection.collection.display_name,
              href: `/collections/${collectionId}`,
            },
            { label: "Schema" },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Schema YAML</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-4 rounded-md bg-muted overflow-auto text-sm font-mono">
              {yamlContent}
            </pre>
          </CardContent>
        </Card>

        {/* Field Details */}
        <Card>
          <CardHeader>
            <CardTitle>Field Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {collection.fields.map((field) => (
                <div
                  key={field.name}
                  className="p-4 rounded-md border space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-semibold">{field.name}</code>
                    <span className="text-xs px-2 py-0.5 rounded bg-muted">
                      {field.type}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        field.source === "gemini"
                          ? "bg-primary/10 text-primary"
                          : "bg-secondary text-secondary-foreground"
                      }`}
                    >
                      {field.source}
                    </span>
                    {field.required && (
                      <span className="text-xs px-2 py-0.5 rounded bg-destructive/10 text-destructive">
                        required
                      </span>
                    )}
                  </div>
                  {field.description && (
                    <p className="text-sm text-muted-foreground">
                      {field.description}
                    </p>
                  )}
                  {field.prompt && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Gemini Prompt:
                      </p>
                      <pre className="p-2 rounded bg-muted text-xs overflow-auto whitespace-pre-wrap">
                        {field.prompt}
                      </pre>
                    </div>
                  )}
                  {field.enum && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Allowed Values:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {field.enum.map((value) => (
                          <code
                            key={value}
                            className="text-xs px-1.5 py-0.5 rounded bg-muted"
                          >
                            {value}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Embedding Config */}
        <Card>
          <CardHeader>
            <CardTitle>Embedding Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium">Model</p>
                <code className="text-sm">{collection.embedding.model}</code>
              </div>
              <div>
                <p className="text-sm font-medium">Dimensions</p>
                <code className="text-sm">{collection.embedding.dimensions}</code>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Text Template</p>
              <pre className="p-3 rounded bg-muted text-sm">
                {collection.embedding.text_template}
              </pre>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Source Fields</p>
              <div className="space-y-2">
                {collection.embedding.source_fields.map((sf) => (
                  <div
                    key={sf.field}
                    className="flex items-center gap-4 text-sm"
                  >
                    <code>{sf.field}</code>
                    <span className="text-muted-foreground">
                      weight: {sf.weight}
                    </span>
                    {sf.join && (
                      <span className="text-muted-foreground">
                        join: &quot;{sf.join}&quot;
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Classifier Hints */}
        <Card>
          <CardHeader>
            <CardTitle>Classifier Hints</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">Keywords</p>
              <div className="flex flex-wrap gap-1">
                {collection.classifier_hints.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-xs px-2 py-1 rounded bg-muted"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Example Queries</p>
              <ul className="space-y-1">
                {collection.classifier_hints.example_queries.map((q, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    &quot;{q}&quot;
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
