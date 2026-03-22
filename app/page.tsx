"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "@/components/ui/chat-container";
import { ScrollButton } from "@/components/ui/scroll-button";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
  PromptInputAction,
} from "@/components/ui/prompt-input";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { Loader } from "@/components/ui/loader";
import { ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "How do I create an account?",
  "What are Sweepstakes Coins?",
  "Jumbo88 says not available in my area",
  "How do I redeem my winnings?",
];

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("jumbo88_session_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("jumbo88_session_id", id);
  }
  return id;
}

function resetSessionId(): string {
  const id = crypto.randomUUID();
  localStorage.setItem("jumbo88_session_id", id);
  return id;
}

function EscalationBanner({ part }: { part: unknown }) {
  if (!part || typeof part !== "object" || !("state" in part)) {
    return null;
  }

  const partObj = part as Record<string, unknown>;
  if (partObj.state !== "output-available" || !partObj.output) {
    return null;
  }

  const output = partObj.output;
  let message =
    "A support agent will follow up via email at support@jumbo88.com.";
  if (
    typeof output === "object" &&
    output !== null &&
    "message" in output &&
    typeof (output as Record<string, unknown>).message === "string"
  ) {
    message = (output as Record<string, unknown>).message as string;
  }

  return (
    <div className="ml-12 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        <p className="font-semibold text-amber-400">
          Escalated to human support
        </p>
      </div>
      <p className="mt-2 text-amber-300/80">{message}</p>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [chatKey, setChatKey] = useState(() =>
    typeof window !== "undefined" ? getSessionId() : "init",
  );

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: chatKey,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: () => ({ session_id: getSessionId() }),
    }),
  });

  // Load conversation history from Redis via React Query
  const historyQuery = useQuery({
    queryKey: ["chat-history", chatKey],
    queryFn: async (): Promise<UIMessage[]> => {
      const sessionId = getSessionId();
      if (!sessionId) return [];
      const res = await fetch(
        `/api/chat/history?session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages ?? [];
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Hydrate useChat with history once loaded
  useEffect(() => {
    if (
      historyQuery.isFetched &&
      historyQuery.data &&
      historyQuery.data.length > 0 &&
      messages.length === 0
    ) {
      setMessages(historyQuery.data);
    }
  }, [historyQuery.isFetched, historyQuery.data, messages.length, setMessages]);

  const historyLoaded = historyQuery.isFetched;

  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0;

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    if (isLoading) return;
    sendMessage({ text });
  };

  const handleNewConversation = useCallback(() => {
    const newId = resetSessionId();
    setMessages([]);
    setInput("");
    setChatKey(newId);
  }, [setMessages]);

  return (
    <div className="bg-background flex h-dvh flex-col">
      {/* Header */}
      <header className="border-border bg-card/80 flex items-center gap-3 border-b px-6 py-4 backdrop-blur-sm">
        <div className="bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-lg text-xs font-extrabold shadow-[0_0_20px_4px_rgba(34,197,94,0.2)]">
          J88
        </div>
        <div className="flex-1">
          <h1 className="text-foreground text-base font-bold">
            Jumbo88 Support
          </h1>
          <p className="text-muted-foreground text-xs">
            AI-powered help — available 24/7
          </p>
        </div>
        {hasMessages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="text-muted-foreground hover:text-primary"
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            New chat
          </Button>
        )}
      </header>

      {/* Chat area */}
      <div className="relative flex-1 overflow-hidden">
        <ChatContainerRoot className="h-full w-full">
          <ChatContainerContent className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
            {/* Welcome state */}
            {!hasMessages && !isLoading && historyLoaded && (
              <div className="flex flex-1 flex-col items-center justify-center gap-8 py-16">
                <div className="bg-primary text-primary-foreground flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-extrabold shadow-[0_0_40px_8px_rgba(34,197,94,0.25)]">
                  J88
                </div>
                <div className="max-w-md text-center">
                  <h2 className="text-foreground text-xl font-bold">
                    Welcome to Jumbo88 Support
                  </h2>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                    I can help with account questions, game info, coin
                    redemptions, troubleshooting, and more.
                  </p>
                </div>
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <PromptSuggestion
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="border-border hover:border-primary/50 hover:bg-primary/10 text-sm transition-colors"
                    >
                      {s}
                    </PromptSuggestion>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              const text = msg.parts
                .filter(
                  (p): p is { type: "text"; text: string } => p.type === "text",
                )
                .map((p) => p.text)
                .join("");

              const escalationPart = msg.parts.find(
                (p) => p.type === "tool-escalate_to_human",
              );

              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%]">
                      <Message className="justify-end">
                        <MessageContent className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
                          {text || "(empty)"}
                        </MessageContent>
                      </Message>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="space-y-2">
                  <div className="max-w-[85%]">
                    <Message className="justify-start">
                      <MessageAvatar
                        src=""
                        alt="Jumbo88"
                        fallback="J"
                        className="bg-primary/20 text-primary mt-1"
                      />
                      {text ? (
                        <MessageContent
                          markdown
                          className="bg-card border-border rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm"
                        >
                          {text}
                        </MessageContent>
                      ) : (
                        <div className="bg-card border-border rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm">
                          <Loader variant="typing" size="sm" />
                        </div>
                      )}
                    </Message>
                  </div>

                  <EscalationBanner part={escalationPart} />
                </div>
              );
            })}

            {/* Loading */}
            {status === "submitted" &&
              !messages.some(
                (m) =>
                  m.role === "assistant" &&
                  !m.parts.some(
                    (p) =>
                      p.type === "text" &&
                      "text" in p &&
                      (p as { text: string }).text,
                  ),
              ) && (
                <div className="max-w-[85%]">
                  <Message className="justify-start">
                    <MessageAvatar
                      src=""
                      alt="Jumbo88"
                      fallback="J"
                      className="bg-primary/20 text-primary mt-1"
                    />
                    <div className="bg-card border-border rounded-2xl rounded-tl-sm border px-4 py-3 shadow-sm">
                      <Loader variant="typing" size="sm" />
                    </div>
                  </Message>
                </div>
              )}

            {/* Error state */}
            {error && (
              <div className="mx-auto max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                Something went wrong. Please try again or contact{" "}
                <a
                  href="mailto:support@jumbo88.com"
                  className="font-medium text-red-300 underline"
                >
                  support@jumbo88.com
                </a>
              </div>
            )}
          </ChatContainerContent>
          <ChatContainerScrollAnchor />
          <ScrollButton className="absolute right-4 bottom-4 rounded-full shadow-lg" />
        </ChatContainerRoot>
      </div>

      {/* Input area */}
      <div className="border-border bg-card/80 border-t px-4 py-4 backdrop-blur-sm">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          className="border-border mx-auto max-w-3xl"
        >
          <PromptInputTextarea
            placeholder="Ask about Jumbo88..."
            className="min-h-[48px] text-base"
          />
          <PromptInputActions>
            <PromptInputAction tooltip="Send message">
              <Button
                size="icon"
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:bg-muted h-9 w-9 rounded-full shadow-[0_0_12px_2px_rgba(34,197,94,0.3)] transition-shadow disabled:opacity-30 disabled:shadow-none"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
        <p className="text-muted-foreground mx-auto mt-2 max-w-3xl text-center text-[11px]">
          Jumbo88 AI may make mistakes. For account-specific help, contact{" "}
          <a
            href="mailto:support@jumbo88.com"
            className="hover:text-primary underline transition-colors"
          >
            support@jumbo88.com
          </a>
        </p>
      </div>
    </div>
  );
}
