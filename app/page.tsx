"use client";

import { useState, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
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
  if (
    !part ||
    typeof part !== "object" ||
    !("state" in part)
  ) {
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
    <div className="ml-12 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <p className="font-semibold text-amber-800 dark:text-amber-200">
          Escalated to human support
        </p>
      </div>
      <p className="mt-2 text-amber-700 dark:text-amber-300">{message}</p>
    </div>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
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

  // Load conversation history from Redis on mount / chat key change
  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setHistoryLoaded(true);
      return;
    }

    fetch(`/api/chat/history?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages as UIMessage[]);
        }
      })
      .catch(() => {
        // Silently fail — just start fresh
      })
      .finally(() => {
        setHistoryLoaded(true);
      });
  }, [chatKey, setMessages]);

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
    setHistoryLoaded(true);
  }, [setMessages]);

  return (
    <div className="flex h-dvh flex-col bg-gradient-to-b from-purple-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-purple-100 bg-white/80 backdrop-blur-sm px-6 py-4 dark:border-gray-800 dark:bg-gray-950/80">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-600 to-purple-700 text-white text-xs font-bold shadow-md">
          J88
        </div>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-gray-900 dark:text-white">
            Jumbo88 Support
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            AI-powered help — available 24/7
          </p>
        </div>
        {hasMessages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="text-gray-500 hover:text-purple-600"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            New chat
          </Button>
        )}
      </header>

      {/* Chat area */}
      <div className="relative flex-1 overflow-hidden">
        <ChatContainerRoot className="h-full w-full">
          <ChatContainerContent className="space-y-6 px-4 py-8 max-w-3xl mx-auto w-full">
            {/* Welcome state */}
            {!hasMessages && !isLoading && historyLoaded && (
              <div className="flex flex-1 flex-col items-center justify-center gap-8 py-16">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 text-white text-2xl font-bold shadow-lg">
                  J88
                </div>
                <div className="text-center max-w-md">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Welcome to Jumbo88 Support
                  </h2>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    I can help with account questions, game info, coin
                    redemptions, troubleshooting, and more.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {SUGGESTIONS.map((s) => (
                    <PromptSuggestion
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="text-sm"
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
                  (p): p is { type: "text"; text: string } =>
                    p.type === "text",
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
                        <MessageContent className="bg-gradient-to-br from-purple-600 to-purple-700 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
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
                        className="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 mt-1"
                      />
                      {text ? (
                        <MessageContent
                          markdown
                          className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700"
                        >
                          {text}
                        </MessageContent>
                      ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
                          <Loader variant="typing" size="sm" />
                        </div>
                      )}
                    </Message>
                  </div>

                  <EscalationBanner part={escalationPart} />
                </div>
              );
            })}

            {/* Loading — before assistant message is added to messages array */}
            {status === "submitted" && !messages.some((m) => m.role === "assistant" && !m.parts.some((p) => p.type === "text" && "text" in p && (p as { text: string }).text)) && (
              <div className="max-w-[85%]">
                <Message className="justify-start">
                  <MessageAvatar
                    src=""
                    alt="Jumbo88"
                    fallback="J"
                    className="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 mt-1"
                  />
                  <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
                    <Loader variant="typing" size="sm" />
                  </div>
                </Message>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
                Something went wrong. Please try again or contact{" "}
                <a
                  href="mailto:support@jumbo88.com"
                  className="underline font-medium"
                >
                  support@jumbo88.com
                </a>
              </div>
            )}

          </ChatContainerContent>
          <ChatContainerScrollAnchor />
          <ScrollButton className="absolute right-4 bottom-4 shadow-lg rounded-full" />
        </ChatContainerRoot>
      </div>

      {/* Input area */}
      <div className="border-t border-purple-100 bg-white/80 backdrop-blur-sm px-4 py-4 dark:border-gray-800 dark:bg-gray-950/80">
        <PromptInput
          value={input}
          onValueChange={setInput}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          className="max-w-3xl mx-auto shadow-sm border-gray-200 dark:border-gray-700"
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
                className="h-9 w-9 rounded-full bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-30 disabled:bg-gray-300"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>
        <p className="text-center text-[11px] text-gray-400 mt-2 max-w-3xl mx-auto">
          Jumbo88 AI may make mistakes. For account-specific help, contact{" "}
          <a
            href="mailto:support@jumbo88.com"
            className="underline hover:text-purple-600"
          >
            support@jumbo88.com
          </a>
        </p>
      </div>
    </div>
  );
}
