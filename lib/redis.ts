import { Redis } from "@upstash/redis";

// Shared Upstash Redis client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Session TTL: 24 hours
const SESSION_TTL_SECONDS = 60 * 60 * 24;

// Max messages to store per session (keeps context window manageable)
const MAX_MESSAGES_PER_SESSION = 50;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

function sessionKey(sessionId: string): string {
  return `chat:session:${sessionId}`;
}

/**
 * Load message history for a session.
 * Returns the most recent messages up to the limit.
 */
export async function getSessionMessages(
  sessionId: string,
  limit = MAX_MESSAGES_PER_SESSION,
): Promise<ChatMessage[]> {
  const key = sessionKey(sessionId);
  const data = await redis.lrange<ChatMessage>(key, -limit, -1);
  return data ?? [];
}

/**
 * Append a message to the session history.
 * Automatically trims to MAX_MESSAGES_PER_SESSION and refreshes the TTL.
 */
export async function addSessionMessage(
  sessionId: string,
  message: ChatMessage,
): Promise<void> {
  const key = sessionKey(sessionId);

  // Push the message to the end of the list
  await redis.rpush(key, message);

  // Trim to keep only the most recent messages
  await redis.ltrim(key, -MAX_MESSAGES_PER_SESSION, -1);

  // Refresh TTL so active sessions stay alive
  await redis.expire(key, SESSION_TTL_SECONDS);
}

/**
 * Save both user and assistant messages in one call after a completed exchange.
 */
export async function saveExchange(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const now = Date.now();
  await addSessionMessage(sessionId, {
    role: "user",
    content: userMessage,
    timestamp: now,
  });
  await addSessionMessage(sessionId, {
    role: "assistant",
    content: assistantMessage,
    timestamp: now,
  });
}

/**
 * Delete a session (e.g. if user requests it).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
