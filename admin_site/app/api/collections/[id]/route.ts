/**
 * Single Collection API
 *
 * GET /api/collections/[id] - Get a collection by ID
 * PUT /api/collections/[id] - Update a collection
 * DELETE /api/collections/[id] - Delete a collection
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCollection,
  saveCollection,
  deleteCollection,
  getCollectionStats,
} from "@/lib/firebase/collections";
import { validateSchema, parseSchema } from "@/lib/schema/parser";
import type { CollectionSchema } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const includeStats =
      request.nextUrl.searchParams.get("includeStats") === "true";

    const collection = await getCollection(id);

    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    if (includeStats) {
      const stats = await getCollectionStats(id);
      return NextResponse.json({ collection, stats });
    }

    return NextResponse.json({ collection });
  } catch (error) {
    console.error("Error fetching collection:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
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

    // Ensure the ID matches
    if (schema.collection.id !== id) {
      return NextResponse.json(
        { error: "Collection ID in schema does not match URL" },
        { status: 400 }
      );
    }

    await saveCollection(schema);

    return NextResponse.json({
      success: true,
      collection: schema,
    });
  } catch (error) {
    console.error("Error updating collection:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update collection: ${message}` },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const collection = await getCollection(id);
    if (!collection) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }

    await deleteCollection(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting collection:", error);
    return NextResponse.json(
      { error: "Failed to delete collection" },
      { status: 500 }
    );
  }
}
