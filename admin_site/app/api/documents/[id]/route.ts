/**
 * Single Document API
 *
 * GET /api/documents/[id]?collectionId=xxx - Get a document
 * PUT /api/documents/[id]?collectionId=xxx - Update a document
 * DELETE /api/documents/[id]?collectionId=xxx - Delete a document
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDocument,
  updateDocumentContent,
  updateDocumentStatus,
  deleteDocument,
} from "@/lib/firebase/documents";
import { deleteFile } from "@/lib/firebase/storage";
import type { DocumentStatus } from "@/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const collectionId = request.nextUrl.searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    const document = await getDocument(collectionId, id);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Error fetching document:", error);
    return NextResponse.json(
      { error: "Failed to fetch document" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const collectionId = request.nextUrl.searchParams.get("collectionId");

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Check if document exists
    const document = await getDocument(collectionId, id);
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Update status if provided
    if (body.status) {
      await updateDocumentStatus(
        collectionId,
        id,
        body.status as DocumentStatus,
        body.error
      );
    }

    // Update content if provided
    if (body.content) {
      await updateDocumentContent(collectionId, id, body.content);
    }

    // Fetch updated document
    const updatedDocument = await getDocument(collectionId, id);

    return NextResponse.json({
      success: true,
      document: updatedDocument,
    });
  } catch (error) {
    console.error("Error updating document:", error);
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const collectionId = request.nextUrl.searchParams.get("collectionId");
    const deleteStorage =
      request.nextUrl.searchParams.get("deleteStorage") === "true";

    if (!collectionId) {
      return NextResponse.json(
        { error: "collectionId is required" },
        { status: 400 }
      );
    }

    // Check if document exists
    const document = await getDocument(collectionId, id);
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Delete from Cloud Storage if requested
    if (deleteStorage && document.storagePath) {
      try {
        await deleteFile(document.storagePath);
      } catch (storageError) {
        console.error("Error deleting file from storage:", storageError);
        // Continue with document deletion even if storage deletion fails
      }
    }

    // Delete document from Firestore
    await deleteDocument(collectionId, id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting document:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
