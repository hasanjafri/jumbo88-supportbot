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
 * Uses pipeline to batch rpush + ltrim + expire into a single HTTP request.
 */
export async function addSessionMessage(
  sessionId: string,
  message: ChatMessage,
): Promise<void> {
  const key = sessionKey(sessionId);
  const pipeline = redis.pipeline();
  pipeline.rpush(key, message);
  pipeline.ltrim(key, -MAX_MESSAGES_PER_SESSION, -1);
  pipeline.expire(key, SESSION_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Save both user and assistant messages in one call after a completed exchange.
 * Uses a single pipeline for all 6 operations (2 rpush + 2 ltrim + 2 expire).
 */
export async function saveExchange(
  sessionId: string,
  userMessage: string,
  assistantMessage: string,
): Promise<void> {
  const key = sessionKey(sessionId);
  const now = Date.now();
  const pipeline = redis.pipeline();

  pipeline.rpush(key, {
    role: "user",
    content: userMessage,
    timestamp: now,
  } satisfies ChatMessage);

  pipeline.rpush(key, {
    role: "assistant",
    content: assistantMessage,
    timestamp: now,
  } satisfies ChatMessage);

  pipeline.ltrim(key, -MAX_MESSAGES_PER_SESSION, -1);
  pipeline.expire(key, SESSION_TTL_SECONDS);
  await pipeline.exec();
}

/**
 * Delete a session (e.g. if user requests it).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}
