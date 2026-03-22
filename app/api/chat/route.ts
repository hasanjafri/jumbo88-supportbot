import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { queryKnowledge } from "@/lib/vector";
import { saveExchange } from "@/lib/redis";
import {
  buildSystemPrompt,
  detectPromptInjection,
  createEscalationTool,
} from "@/lib/prompts";

export const maxDuration = 30;

interface ChatRequest {
  messages: UIMessage[];
  session_id?: string;
}

export async function POST(req: Request) {
  const { messages, session_id }: ChatRequest = await req.json();

  // Get the latest user message
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== "user") {
    return Response.json({ error: "No user message found" }, { status: 400 });
  }

  // Extract text content from message parts
  const userText =
    lastMessage.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") || "";

  if (!userText.trim()) {
    return Response.json({ error: "Empty message" }, { status: 400 });
  }

  // First-pass prompt injection check
  const injectionCheck = detectPromptInjection(userText);
  if (!injectionCheck.safe) {
    const safeResponse =
      "I'm here to help you with Jumbo88-related questions! Is there anything specific about our games, account, promotions, or policies I can assist you with?";

    // Save to Redis in the background — don't await
    if (session_id) {
      saveExchange(session_id, userText, safeResponse).catch(() => {});
    }

    // Return a proper UI message stream so useChat can display it
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id: "safe-response" });
        writer.write({
          type: "text-delta",
          id: "safe-response",
          delta: safeResponse,
        });
        writer.write({ type: "text-end", id: "safe-response" });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // Query the knowledge base for relevant context
  const context = await queryKnowledge(userText, 5);

  // Build the system prompt with retrieved context
  const systemPrompt = buildSystemPrompt(context);

  // Prepare sources metadata for the client
  const sources = context.map((c) => ({
    url: c.metadata.source_url,
    title: c.metadata.page_title,
    score: c.score,
  }));

  // Build conversation summary for escalation emails
  const conversationSummary = messages
    .map((m) => {
      const text = m.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ");
      return `${m.role === "user" ? "User" : "Bot"}: ${text}`;
    })
    .join("\n");

  // Stream the response with the escalation tool available
  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      escalate_to_human: createEscalationTool(
        session_id || "unknown",
        conversationSummary,
      ),
    },
    onFinish: async ({ text }) => {
      // Persist the exchange to Redis after streaming completes.
      // Fire-and-forget: don't block the stream on Redis writes.
      if (session_id && text) {
        saveExchange(session_id, userText, text).catch(console.error);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === "text-start") {
        return { sources };
      }
    },
  });
}
