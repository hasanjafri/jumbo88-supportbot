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
  const { queryKnowledge } = await import("../lib/vector");

  console.log("Testing lib/vector.ts\n");

  // --- Test 1: FAQ query returns relevant results ---
  console.log("1. Query: 'How do I create an account?'");
  const signupResults = await queryKnowledge("How do I create an account?");
  assert(signupResults.length > 0, "returns results");
  assert(signupResults.length <= 5, "returns at most 5 results (default topK)");
  assert(signupResults[0].score > 0, "first result has a positive score");
  assert(
    signupResults[0].data.toLowerCase().includes("sign up") ||
      signupResults[0].data.toLowerCase().includes("account"),
    "top result mentions signup/account",
  );

  // --- Test 2: Results include metadata with source URLs ---
  console.log("\n2. Metadata includes source_url");
  const first = signupResults[0];
  assert(typeof first.metadata.source_url === "string", "has source_url");
  assert(
    first.metadata.source_url.startsWith("https://www.jumbo88.com"),
    "source_url is a jumbo88.com URL",
  );
  assert(typeof first.metadata.page_title === "string", "has page_title");
  assert(first.metadata.page_title.length > 0, "page_title is not empty");

  // --- Test 3: Results include the original data text ---
  console.log("\n3. Results include data text");
  assert(typeof first.data === "string", "data is a string");
  assert(first.data.length > 20, "data has substantial content");

  // --- Test 4: Geolocation troubleshooting query ---
  console.log("\n4. Query: 'Jumbo88 says not available in my area'");
  const geoResults = await queryKnowledge(
    "Jumbo88 says not available in my area",
  );
  assert(geoResults.length > 0, "returns results");
  const geoMatch = geoResults.some(
    (r) =>
      r.data.toLowerCase().includes("vpn") ||
      r.data.toLowerCase().includes("geolocation") ||
      r.data.toLowerCase().includes("location"),
  );
  assert(geoMatch, "at least one result mentions VPN/geolocation/location");

  // --- Test 5: Sweepstakes coins query ---
  console.log("\n5. Query: 'What are sweepstakes coins?'");
  const coinsResults = await queryKnowledge("What are sweepstakes coins?");
  assert(coinsResults.length > 0, "returns results");
  const coinsMatch = coinsResults.some(
    (r) =>
      r.data.toLowerCase().includes("sweepstakes coins") ||
      r.data.toLowerCase().includes("sc"),
  );
  assert(coinsMatch, "at least one result mentions sweepstakes coins or SC");

  // --- Test 6: Custom topK parameter ---
  console.log("\n6. Query with topK=2");
  const twoResults = await queryKnowledge("password reset", 2);
  assert(twoResults.length <= 2, "returns at most 2 results");
  assert(twoResults.length > 0, "returns at least 1 result");

  // --- Test 7: Results are sorted by score (descending) ---
  console.log("\n7. Results sorted by relevance");
  if (signupResults.length >= 2) {
    assert(
      signupResults[0].score >= signupResults[1].score,
      "first result has higher or equal score than second",
    );
  } else {
    assert(true, "only 1 result, sorting trivially correct");
  }

  // --- Test 8: Affiliate query ---
  console.log("\n8. Query: 'How do I become an affiliate?'");
  const affResults = await queryKnowledge("How do I become an affiliate?");
  assert(affResults.length > 0, "returns results");
  const affMatch = affResults.some(
    (r) =>
      r.data.toLowerCase().includes("affiliate") ||
      r.metadata.source_url.includes("affiliate"),
  );
  assert(affMatch, "at least one result is about affiliates");

  // --- Test 9: Account-specific question ---
  console.log("\n9. Query: 'What is my account balance?' (account-specific)");
  const balanceResults = await queryKnowledge("What is my account balance?");
  assert(
    balanceResults.length > 0,
    "returns results (even for account-specific queries)",
  );
  console.log(
    `  (info) Top score: ${balanceResults[0].score.toFixed(3)} — API route will use score threshold for escalation`,
  );

  // --- Summary ---
  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
