/**
 * Collections API
 *
 * GET /api/collections - List all collections
 * POST /api/collections - Create a new collection
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAllCollections,
  saveCollection,
  getAllCollectionStats,
} from "@/lib/firebase/collections";
import { createVectorIndex } from "@/lib/firebase/functions";
import { validateSchema, parseSchema } from "@/lib/schema/parser";
import type { CollectionSchema } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const includeStats = request.nextUrl.searchParams.get("includeStats") === "true";

    const collections = await getAllCollections();

    if (includeStats) {
      const stats = await getAllCollectionStats();
      const collectionsWithStats = collections.map((collection) => ({
        ...collection,
        stats: stats.find((s) => s.collectionId === collection.collection.id),
      }));
      return NextResponse.json({ collections: collectionsWithStats });
    }

    return NextResponse.json({ collections });
  } catch (error) {
    console.error("Error fetching collections:", error);
    return NextResponse.json(
      { error: "Failed to fetch collections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let schema: CollectionSchema;

    // Support both direct JSON and YAML string
    if (typeof body.yaml === "string") {
      schema = parseSchema(body.yaml);
    } else if (body.schema) {
      schema = body.schema as CollectionSchema;
      validateSchema(schema);
    } else {
      return NextResponse.json(
        { error: "Request must include 'schema' object or 'yaml' string" },
        { status: 400 }
      );
    }

    await saveCollection(schema);

    // Auto-create vector index for the new collection
    let indexResult = null;
    try {
      indexResult = await createVectorIndex(schema.collection.id);
      console.log(`Vector index creation: ${indexResult.message}`);
    } catch (indexError) {
      // Log but don't fail - index can be created manually later
      console.error("Failed to create vector index:", indexError);
    }

    return NextResponse.json({
      success: true,
      collection: schema,
      indexCreation: indexResult,
    });
  } catch (error) {
    console.error("Error creating collection:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create collection: ${message}` },
      { status: 400 }
    );
  }
}
