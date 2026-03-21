/**
 * Custom promptfoo provider for Jumbo88 chat API.
 * Calls /api/chat and parses SSE UI message stream.
 */

const API_URL = process.env.API_URL || "http://localhost:3000/api/chat";

class JumboChatProvider {
  constructor(options) {
    this.providerId = options?.id || "jumbo88-chat-api";
    this.config = options?.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: `eval-${Date.now()}`,
              role: "user",
              parts: [{ type: "text", text: prompt }],
            },
          ],
          session_id: `eval-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        return { output: "", error: `HTTP ${res.status}: ${errBody}` };
      }

      const body = await res.text();
      const lines = body.split("\n");
      let text = "";
      let toolOutput = "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === "text-delta" && parsed.delta) {
            text += parsed.delta;
          }

          if (parsed.type === "tool-call-delta" && parsed.toolName) {
            toolOutput += `[TOOL_CALL: ${parsed.toolName}`;
            if (parsed.argsTextDelta) toolOutput += ` ${parsed.argsTextDelta}`;
            toolOutput += "] ";
          }

          if (parsed.type === "tool-call" && parsed.toolName) {
            toolOutput += `[TOOL_CALL: ${parsed.toolName} ${JSON.stringify(parsed.args || {})}] `;
          }

          if (parsed.type === "tool-output" && parsed.output) {
            toolOutput += `[TOOL_OUTPUT: ${JSON.stringify(parsed.output)}] `;
          }
        } catch {
          // Skip unparseable lines
        }
      }

      const fullOutput = (text + " " + toolOutput).trim();
      return { output: fullOutput || "(empty response)" };
    } catch (err) {
      return { output: "", error: `Fetch failed: ${err.message}` };
    }
  }
}

module.exports = JumboChatProvider;
