/**
 * Chat API
 *
 * POST /api/chat - Get a grounded answer to a question
 *
 * This endpoint:
 * 1. Searches for relevant documents using classify_and_search
 * 2. Generates a grounded answer using the retrieved documents
 * 3. Returns the answer with citations and process log
 */

import { NextRequest, NextResponse } from "next/server";
import { classifyAndSearch, generateGroundedAnswer } from "@/lib/firebase/functions";
import type { ProcessLogStep, ProcessLog } from "@/types";

export async function POST(request: NextRequest) {
  const overallStart = Date.now();
  const processLog: ProcessLog = { steps: [] };

  // Helper to add a step
  const addStep = (name: string): ProcessLogStep => {
    const step: ProcessLogStep = {
      name,
      status: "running",
      startTime: new Date().toISOString(),
    };
    processLog.steps.push(step);
    return step;
  };

  // Helper to complete a step
  const completeStep = (step: ProcessLogStep, output?: unknown, error?: string) => {
    step.endTime = new Date().toISOString();
    step.durationMs = new Date(step.endTime).getTime() - new Date(step.startTime!).getTime();
    step.status = error ? "error" : "success";
    if (output !== undefined) step.output = output;
    if (error) step.error = error;
  };

  try {
    const body = await request.json();
    const { query, conversationHistory = [] } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    console.log("[CHAT API] Starting chat request for query:", query.substring(0, 50));

    // Step 1: Search for relevant documents
    const searchStep = addStep("classify_and_search");
    console.log("[CHAT API] Step 1: Calling classify_and_search...");
    searchStep.input = {
      query,
      limit: 5,
      threshold: 0.25,
      model: "gemini-3-flash-preview",
      thinkingLevel: "LOW",
      enableRerank: true,
    };

    let searchResult;
    try {
      searchResult = await classifyAndSearch(
        query,
        5,      // limit to top 5 documents for grounding
        0.25,   // threshold
        "gemini-3-flash-preview",  // fast classification
        "LOW",  // thinking level
        false,  // debug mode
        true    // enable reranking
      );

      console.log("[CHAT API] Step 1 complete. Found", searchResult.results?.length ?? 0, "results");
      completeStep(searchStep, {
        classification: searchResult.classification,
        resultsCount: searchResult.results?.length ?? 0,
        results: searchResult.results?.map((r) => ({
          documentId: r.documentId,
          fileName: r.fileName,
          collectionId: r.collectionId,
          weightedScore: r.weightedScore,
          matchType: r.matchType,
        })),
        searchMetadata: searchResult.searchMetadata,
      });
    } catch (error) {
      console.error("[CHAT API] Step 1 FAILED:", error);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      completeStep(searchStep, undefined, errMsg);
      throw error;
    }

    if (!searchResult.results || searchResult.results.length === 0) {
      processLog.totalDurationMs = Date.now() - overallStart;
      return NextResponse.json({
        answer: "I couldn't find any relevant documents to answer your question. Please try rephrasing your query or ensure that relevant documents have been uploaded and processed.",
        citations: [],
        confidence: 0,
        searchMetadata: searchResult.searchMetadata,
        processLog,
      });
    }

    // Step 2: Prepare documents for grounding
    const documents = searchResult.results.map((result) => ({
      documentId: result.documentId,
      collectionId: result.collectionId,
      fileName: result.fileName,
      summary: result.summary,
      keywords: result.keywords,
      storagePath: result.storagePath,
    }));

    // Step 3: Generate grounded answer
    console.log("[CHAT API] Step 2: Calling generate_grounded_answer with", documents.length, "documents...");
    const groundStep = addStep("generate_grounded_answer");
    groundStep.input = {
      query,
      documentsCount: documents.length,
      documents: documents.map((d) => ({
        documentId: d.documentId,
        fileName: d.fileName,
        summaryPreview: d.summary?.substring(0, 100) + (d.summary?.length > 100 ? "..." : ""),
      })),
      conversationHistoryLength: conversationHistory.length,
    };

    let groundedResult;
    try {
      groundedResult = await generateGroundedAnswer(
        query,
        documents,
        conversationHistory
      );

      console.log("[CHAT API] Step 2 complete. Confidence:", groundedResult.confidence);
      completeStep(groundStep, {
        answerPreview: groundedResult.answer?.substring(0, 200) + (groundedResult.answer?.length > 200 ? "..." : ""),
        citationsCount: groundedResult.citations?.length ?? 0,
        confidence: groundedResult.confidence,
      });
    } catch (error) {
      console.error("[CHAT API] Step 2 FAILED:", error);
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      completeStep(groundStep, undefined, errMsg);
      throw error;
    }

    processLog.totalDurationMs = Date.now() - overallStart;

    return NextResponse.json({
      answer: groundedResult.answer,
      citations: groundedResult.citations,
      confidence: groundedResult.confidence,
      searchMetadata: {
        ...searchResult.searchMetadata,
        documentsRetrieved: searchResult.results.length,
      },
      processLog,
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    processLog.totalDurationMs = Date.now() - overallStart;
    return NextResponse.json(
      { error: `Chat failed: ${message}`, processLog },
      { status: 500 }
    );
  }
}
