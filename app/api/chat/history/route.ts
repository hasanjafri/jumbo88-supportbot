import { getSessionMessages } from "@/lib/redis";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return Response.json({ error: "session_id is required" }, { status: 400 });
  }

  const messages = await getSessionMessages(sessionId);

  // Convert Redis ChatMessage format to UIMessage format for useChat
  const uiMessages = messages.map((msg, i) => ({
    id: `history-${i}`,
    role: msg.role,
    parts: [{ type: "text" as const, text: msg.content }],
    createdAt: new Date(msg.timestamp),
  }));

  return Response.json({ messages: uiMessages });
}
