/**
 * Documents API
 *
 * GET /api/documents?collectionId=xxx - List documents in a collection
 */

import { NextRequest, NextResponse } from "next/server";
import { listDocuments, ListDocumentsOptions } from "@/lib/firebase/documents";
import type { DocumentStatus } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const collectionId = searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    const options: ListDocumentsOptions = {};

    // Parse query parameters
    const status = searchParams.get("status");
    if (status) {
      options.status = status as DocumentStatus;
    }

    const limit = searchParams.get("limit");
    if (limit) {
      options.limit = parseInt(limit, 10);
    }

    const offset = searchParams.get("offset");
    if (offset) {
      options.offset = parseInt(offset, 10);
    }

    const orderBy = searchParams.get("orderBy");
    if (orderBy) {
      options.orderBy = orderBy as "uploadedAt" | "processedAt" | "fileName";
    }

    const orderDirection = searchParams.get("orderDirection");
    if (orderDirection) {
      options.orderDirection = orderDirection as "asc" | "desc";
    }

    const result = await listDocuments(collectionId, options);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
