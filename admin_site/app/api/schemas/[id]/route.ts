/**
 * Schema Templates API
 *
 * GET /api/schemas/[id] - Get a schema template YAML
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const validSchemaIds = [
  "human_resources_all",
  "ic_process_engineering",
  "ic_design_engineering",
  "products_and_datasheets",
  "etq_specifications",
  "functional_safety",
];

// Map schema IDs to file names
const schemaFileMap: Record<string, string> = {
  human_resources_all: "human_resources.yaml",
  ic_process_engineering: "ic_process_engineering.yaml",
  ic_design_engineering: "ic_design_engineering.yaml",
  products_and_datasheets: "products_and_datasheets.yaml",
  etq_specifications: "etq_specifications.yaml",
  functional_safety: "functional_safety.yaml",
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!validSchemaIds.includes(id)) {
      return NextResponse.json(
        { error: "Invalid schema ID" },
        { status: 400 }
      );
    }

    const fileName = schemaFileMap[id];
    const schemaPath = join(process.cwd(), "schemas", fileName);

    const yaml = await readFile(schemaPath, "utf-8");

    return NextResponse.json({ yaml });
  } catch (error) {
    console.error("Error loading schema:", error);
    return NextResponse.json(
      { error: "Failed to load schema template" },
      { status: 500 }
    );
  }
}
