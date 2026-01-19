/**
 * Schema Parser
 *
 * Parses YAML/JSON schema files into TypeScript objects.
 */

import yaml from "js-yaml";
import type { CollectionSchema, SchemaField } from "@/types";

/**
 * Parse a YAML schema string into a CollectionSchema object.
 */
export function parseSchema(yamlContent: string): CollectionSchema {
  const parsed = yaml.load(yamlContent) as CollectionSchema;
  validateSchema(parsed);
  return parsed;
}

/**
 * Serialize a CollectionSchema object to YAML string.
 */
export function serializeSchema(schema: CollectionSchema): string {
  return yaml.dump(schema, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });
}

/**
 * Validate a schema object has required fields.
 */
export function validateSchema(schema: unknown): asserts schema is CollectionSchema {
  if (!schema || typeof schema !== "object") {
    throw new Error("Schema must be an object");
  }

  const s = schema as Record<string, unknown>;

  // Validate collection info
  if (!s.collection || typeof s.collection !== "object") {
    throw new Error("Schema must have a 'collection' object");
  }

  const collection = s.collection as Record<string, unknown>;
  if (!collection.id || typeof collection.id !== "string") {
    throw new Error("Schema collection must have an 'id' string");
  }
  if (!collection.display_name || typeof collection.display_name !== "string") {
    throw new Error("Schema collection must have a 'display_name' string");
  }

  // Validate fields
  if (!Array.isArray(s.fields)) {
    throw new Error("Schema must have a 'fields' array");
  }

  for (const field of s.fields) {
    validateField(field);
  }

  // Validate embedding config
  if (!s.embedding || typeof s.embedding !== "object") {
    throw new Error("Schema must have an 'embedding' object");
  }

  // Validate classifier hints
  if (!s.classifier_hints || typeof s.classifier_hints !== "object") {
    throw new Error("Schema must have a 'classifier_hints' object");
  }
}

/**
 * Validate a single field definition.
 */
function validateField(field: unknown): asserts field is SchemaField {
  if (!field || typeof field !== "object") {
    throw new Error("Field must be an object");
  }

  const f = field as Record<string, unknown>;

  if (!f.name || typeof f.name !== "string") {
    throw new Error("Field must have a 'name' string");
  }

  if (!f.type || !["string", "array", "number", "boolean"].includes(f.type as string)) {
    throw new Error(`Field '${f.name}' must have a valid 'type' (string, array, number, boolean)`);
  }

  if (!f.source || !["gemini", "manual"].includes(f.source as string)) {
    throw new Error(`Field '${f.name}' must have a valid 'source' (gemini, manual)`);
  }

  if (f.source === "gemini" && !f.prompt) {
    throw new Error(`Gemini-sourced field '${f.name}' must have a 'prompt'`);
  }
}

/**
 * Get the Gemini-sourced fields from a schema.
 */
export function getGeminiFields(schema: CollectionSchema): SchemaField[] {
  return schema.fields.filter((f) => f.source === "gemini");
}

/**
 * Get the manual fields from a schema.
 */
export function getManualFields(schema: CollectionSchema): SchemaField[] {
  return schema.fields.filter((f) => f.source === "manual");
}

/**
 * Build the embedding text from a document's content using the schema template.
 */
export function buildEmbeddingText(
  content: Record<string, unknown>,
  schema: CollectionSchema
): string {
  let text = schema.embedding.text_template;

  for (const sourceField of schema.embedding.source_fields) {
    const value = content[sourceField.field];
    let stringValue = "";

    if (Array.isArray(value)) {
      stringValue = value.join(sourceField.join || ", ");
    } else if (value !== null && value !== undefined) {
      stringValue = String(value);
    }

    text = text.replace(`{${sourceField.field}}`, stringValue);
  }

  return text.trim();
}
