/**
 * Vertex AI Gemini Client
 *
 * Server-side client for Gemini API via Vertex AI.
 * Used for document metadata extraction and query classification.
 */

import { VertexAI, Part, GenerateContentResult } from "@google-cloud/vertexai";

let vertexAI: VertexAI | null = null;

/**
 * Get or initialize the Vertex AI client.
 */
function getVertexAI(): VertexAI {
  if (!vertexAI) {
    const project = process.env.VERTEX_AI_PROJECT;
    const location = process.env.VERTEX_AI_LOCATION || "us-central1";

    if (!project) {
      throw new Error("VERTEX_AI_PROJECT environment variable is required");
    }

    vertexAI = new VertexAI({ project, location });
  }
  return vertexAI;
}

/**
 * Configuration for content generation.
 */
interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

/**
 * Generate content using Gemini model.
 */
export async function generateContent(
  prompt: string,
  config: GenerationConfig = {}
): Promise<string> {
  const vertex = getVertexAI();
  const model = vertex.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash-001",
    generationConfig: {
      temperature: config.temperature ?? 0.1,
      topP: config.topP ?? 0.95,
      topK: config.topK ?? 40,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      responseMimeType: config.responseMimeType || "text/plain",
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text in Gemini response");
  }

  return text;
}

/**
 * Generate JSON content using Gemini model.
 * Returns parsed JSON object.
 */
export async function generateJSON<T = unknown>(
  prompt: string,
  config: Omit<GenerationConfig, "responseMimeType"> = {}
): Promise<T> {
  const text = await generateContent(prompt, {
    ...config,
    responseMimeType: "application/json",
  });

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON response: ${text}`);
  }
}

/**
 * Analyze a PDF document using Gemini's multimodal capabilities.
 * The PDF is loaded directly from Cloud Storage.
 */
export async function analyzeDocument(
  storageUri: string,
  prompt: string,
  config: GenerationConfig = {}
): Promise<string> {
  const vertex = getVertexAI();
  const model = vertex.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash-001",
    generationConfig: {
      temperature: config.temperature ?? 0.1,
      topP: config.topP ?? 0.95,
      topK: config.topK ?? 40,
      maxOutputTokens: config.maxOutputTokens ?? 8192,
      responseMimeType: config.responseMimeType || "text/plain",
    },
  });

  // Create a Part from the Cloud Storage URI
  const filePart: Part = {
    fileData: {
      mimeType: "application/pdf",
      fileUri: storageUri,
    },
  };

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [filePart, { text: prompt }] }],
  });
  const response = result.response;
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text in Gemini response");
  }

  return text;
}

/**
 * Analyze a PDF document and return structured JSON.
 */
export async function analyzeDocumentJSON<T = unknown>(
  storageUri: string,
  prompt: string,
  config: Omit<GenerationConfig, "responseMimeType"> = {}
): Promise<T> {
  const text = await analyzeDocument(storageUri, prompt, {
    ...config,
    responseMimeType: "application/json",
  });

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(`Failed to parse Gemini JSON response: ${text}`);
  }
}

/**
 * Generate embeddings for text using Gemini embedding model.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const vertex = getVertexAI();
  const model = vertex.getGenerativeModel({
    model: process.env.EMBEDDING_MODEL || "text-embedding-005",
  });

  // Vertex AI embedding uses a different method
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text }] }],
  });

  // Note: For actual embeddings, you'd use the embedContent method
  // This is a placeholder - actual implementation depends on Vertex AI SDK version
  throw new Error(
    "Use the embedding-specific endpoint for embeddings. " +
      "In Cloud Functions, use vertexai.preview.language_models.TextEmbeddingModel"
  );
}

/**
 * Classify a query to determine which collection(s) to search.
 */
export interface ClassificationInput {
  query: string;
  collections: {
    id: string;
    displayName: string;
    description: string;
    keywords: string[];
    exampleQueries: string[];
  }[];
}

export interface ClassificationOutput {
  primary_collection: string;
  primary_confidence: number;
  secondary_collections: string[];
  secondary_confidence: number;
  reasoning: string;
  search_strategy: "primary_only" | "primary_then_secondary" | "parallel";
}

/**
 * Classify a user query to determine the best collection(s) to search.
 */
export async function classifyQuery(
  input: ClassificationInput
): Promise<ClassificationOutput> {
  const collectionsInfo = input.collections
    .map(
      (c, i) =>
        `${i + 1}. ${c.id} ("${c.displayName}")
   Description: ${c.description}
   Keywords: ${c.keywords.join(", ")}
   Example queries: ${c.exampleQueries.slice(0, 3).join("; ")}`
    )
    .join("\n\n");

  const prompt = `You are a query router for an enterprise document search system.

Available document collections:

${collectionsInfo}

User query: "${input.query}"

Analyze the query and determine which collection(s) would most likely contain relevant documents.

Return a JSON object with:
- primary_collection: The collection ID most likely to have relevant results
- primary_confidence: Confidence score 0.0 to 1.0
- secondary_collections: Array of other potentially relevant collection IDs (can be empty)
- secondary_confidence: Average confidence for secondary collections (0.0 if none)
- reasoning: Brief explanation of your routing decision
- search_strategy: One of "primary_only", "primary_then_secondary", or "parallel"

Use "primary_only" if very confident (>0.8) the query belongs to one collection.
Use "primary_then_secondary" if moderately confident but want fallback.
Use "parallel" if the query spans multiple domains equally.`;

  return generateJSON<ClassificationOutput>(prompt, { temperature: 0.1 });
}
