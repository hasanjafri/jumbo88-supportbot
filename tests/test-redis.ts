import { config } from "dotenv";
config({ path: ".env.local" });

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.error(`  FAIL: ${name}`);
    failed++;
  }
}

async function main() {
  // Dynamic import so env vars are available when the module initializes
  const { getSessionMessages, addSessionMessage, saveExchange, deleteSession } =
    await import("../lib/redis");

  const TEST_SESSION = `test-session-${Date.now()}`;

  console.log("Testing lib/redis.ts\n");

  // --- Test 1: Empty session returns empty array ---
  console.log("1. getSessionMessages on new session");
  const empty = await getSessionMessages(TEST_SESSION);
  assert(Array.isArray(empty), "returns an array");
  assert(empty.length === 0, "array is empty for new session");

  // --- Test 2: addSessionMessage stores a message ---
  console.log("\n2. addSessionMessage");
  await addSessionMessage(TEST_SESSION, {
    role: "user",
    content: "Hello, how do I sign up?",
    timestamp: Date.now(),
  });
  const afterOne = await getSessionMessages(TEST_SESSION);
  assert(afterOne.length === 1, "has 1 message after adding one");
  assert(afterOne[0].role === "user", "message role is user");
  assert(
    afterOne[0].content === "Hello, how do I sign up?",
    "message content matches",
  );

  // --- Test 3: saveExchange stores both user and assistant messages ---
  console.log("\n3. saveExchange");
  await saveExchange(
    TEST_SESSION,
    "What are Sweepstakes Coins?",
    "Sweepstakes Coins (SC) give you a shot at real cash prizes. They are always free.",
  );
  const afterExchange = await getSessionMessages(TEST_SESSION);
  assert(
    afterExchange.length === 3,
    "has 3 messages total (1 + 2 from exchange)",
  );
  assert(afterExchange[1].role === "user", "exchange user message is second");
  assert(
    afterExchange[1].content === "What are Sweepstakes Coins?",
    "exchange user content matches",
  );
  assert(
    afterExchange[2].role === "assistant",
    "exchange assistant message is third",
  );
  assert(
    afterExchange[2].content.includes("Sweepstakes Coins"),
    "exchange assistant content matches",
  );

  // --- Test 4: Messages have timestamps ---
  console.log("\n4. Timestamps");
  assert(
    typeof afterExchange[0].timestamp === "number",
    "first message has numeric timestamp",
  );
  assert(afterExchange[2].timestamp > 0, "timestamp is positive");

  // --- Test 5: getSessionMessages respects limit ---
  console.log("\n5. getSessionMessages with limit");
  const limited = await getSessionMessages(TEST_SESSION, 2);
  assert(limited.length === 2, "returns only 2 when limit=2");
  assert(
    limited[0].content === "What are Sweepstakes Coins?",
    "returns the most recent messages (not oldest)",
  );

  // --- Test 6: Different sessions are isolated ---
  console.log("\n6. Session isolation");
  const OTHER_SESSION = `test-session-other-${Date.now()}`;
  const otherMessages = await getSessionMessages(OTHER_SESSION);
  assert(otherMessages.length === 0, "different session has no messages");

  // --- Test 7: deleteSession clears all messages ---
  console.log("\n7. deleteSession");
  await deleteSession(TEST_SESSION);
  const afterDelete = await getSessionMessages(TEST_SESSION);
  assert(afterDelete.length === 0, "session is empty after delete");

  // --- Summary ---
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
