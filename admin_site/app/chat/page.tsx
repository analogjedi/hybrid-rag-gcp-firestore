"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  MessageSquare,
  FileText,
  Loader2,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
  Sparkles,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import type { ChatMessage, ChatCitation, ProcessLog, ProcessLogStep } from "@/types";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function CitationCard({ citation, index }: { citation: ChatCitation; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-2">
          <Badge variant="secondary" className="shrink-0">
            Doc {index + 1}
          </Badge>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{citation.fileName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {citation.collectionId}
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {isExpanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <p className="text-sm text-muted-foreground">{citation.summary}</p>
          {citation.relevanceNote && (
            <p className="text-xs text-primary">
              <Sparkles className="h-3 w-3 inline mr-1" />
              {citation.relevanceNote}
            </p>
          )}
          {citation.storagePath && (
            <a
              href={`https://console.cloud.google.com/storage/browser/_details/${citation.storagePath.replace("gs://", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View in Cloud Storage
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessLogStepCard({ step, index }: { step: ProcessLogStep; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusIcon = {
    pending: <Clock className="h-3 w-3 text-muted-foreground" />,
    running: <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />,
    success: <CheckCircle2 className="h-3 w-3 text-green-500" />,
    error: <XCircle className="h-3 w-3 text-red-500" />,
  }[step.status];

  const statusColor = {
    pending: "bg-muted",
    running: "bg-blue-500/10 border-blue-500/30",
    success: "bg-green-500/10 border-green-500/30",
    error: "bg-red-500/10 border-red-500/30",
  }[step.status];

  return (
    <div className={`border rounded-md text-xs ${statusColor}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="font-mono font-medium">{step.name}</span>
          {step.durationMs !== undefined && (
            <span className="text-muted-foreground">
              ({step.durationMs}ms)
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 space-y-2 border-t border-border/50">
          {step.input !== undefined && step.input !== null && (
            <div className="mt-2">
              <p className="font-medium text-muted-foreground mb-1">Input:</p>
              <pre className="bg-background/50 p-2 rounded text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(step.input, null, 2)}
              </pre>
            </div>
          )}
          {step.output !== undefined && step.output !== null && (
            <div>
              <p className="font-medium text-muted-foreground mb-1">Output:</p>
              <pre className="bg-background/50 p-2 rounded text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                {JSON.stringify(step.output, null, 2)}
              </pre>
            </div>
          )}
          {step.error && (
            <div>
              <p className="font-medium text-red-500 mb-1">Error:</p>
              <pre className="bg-red-500/10 p-2 rounded text-[10px] text-red-600 overflow-x-auto">
                {step.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProcessLogPanel({ processLog }: { processLog: ProcessLog }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasError = processLog.steps.some((s) => s.status === "error");
  const allSuccess = processLog.steps.every((s) => s.status === "success");

  return (
    <div className="border rounded-lg bg-muted/20 mt-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">Process Log</span>
          <Badge
            variant={hasError ? "destructive" : allSuccess ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {processLog.steps.length} steps
          </Badge>
          {processLog.totalDurationMs !== undefined && (
            <span className="text-xs text-muted-foreground">
              ({processLog.totalDurationMs}ms total)
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1">
          {processLog.steps.map((step, idx) => (
            <ProcessLogStepCard key={idx} step={step} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChatMessageComponent({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div
        className={`max-w-[80%] space-y-3 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        } rounded-lg p-4`}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Searching and generating answer...</span>
          </div>
        ) : (
          <>
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            {message.citations && message.citations.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground">
                  Sources ({message.citations.length})
                </p>
                <div className="space-y-2">
                  {message.citations.map((citation, idx) => (
                    <CitationCard key={idx} citation={citation} index={idx} />
                  ))}
                </div>
              </div>
            )}
            {message.processLog && (
              <ProcessLogPanel processLog={message.processLog} />
            )}
          </>
        )}
      </div>
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <User className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    const loadingMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: "",
      timestamp: new Date().toISOString(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Call the chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: userMessage.content,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get answer");
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: data.answer,
        citations: data.citations,
        timestamp: new Date().toISOString(),
        processLog: data.processLog,
      };

      // Replace loading message with actual response
      setMessages((prev) =>
        prev.slice(0, -1).concat(assistantMessage)
      );
    } catch (error) {
      // Try to extract processLog from error response if available
      let processLog;
      if (error instanceof Response) {
        try {
          const errData = await error.json();
          processLog = errData.processLog;
        } catch {
          // Ignore JSON parse errors
        }
      }

      const errorMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content:
          error instanceof Error
            ? `Sorry, I encountered an error: ${error.message}`
            : "Sorry, I encountered an unexpected error.",
        timestamp: new Date().toISOString(),
        processLog,
      };

      // Replace loading message with error
      setMessages((prev) => prev.slice(0, -1).concat(errorMessage));
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
  };

  const handleExampleQuery = (query: string) => {
    setInput(query);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Chat"
        description="Ask questions and get answers grounded in your documents"
      />

      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        <Breadcrumbs items={[{ label: "Chat" }]} />

        {/* Main chat area */}
        <div className="flex-1 mt-4 flex flex-col overflow-hidden rounded-lg border bg-background">
          {/* Messages */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="max-w-md text-center space-y-6">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      Grounded Chat Assistant
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Ask questions about your documents. I'll search for
                      relevant information and provide answers with citations.
                    </p>
                  </div>

                  {/* Example queries */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">
                      Try asking:
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {[
                        "What is the operating temperature range?",
                        "Explain the thermal specifications",
                        "What are the key features?",
                      ].map((query) => (
                        <button
                          key={query}
                          onClick={() => handleExampleQuery(query)}
                          className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                        >
                          {query}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <ChatMessageComponent key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input area */}
          <div className="border-t p-4 bg-muted/30">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your documents..."
                disabled={isLoading}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              {messages.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearChat}
                  disabled={isLoading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </form>
          </div>
        </div>

        {/* Info card */}
        <Card className="mt-4">
          <CardContent className="py-4">
            <div className="flex items-start gap-4 text-sm text-muted-foreground">
              <FileText className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">
                  How grounded chat works
                </p>
                <p className="mt-1">
                  Your question is first processed by our agentic search system,
                  which classifies your query and retrieves the most relevant
                  documents. Then, an AI model generates an answer based solely
                  on the retrieved document content, with citations to the
                  source materials.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
