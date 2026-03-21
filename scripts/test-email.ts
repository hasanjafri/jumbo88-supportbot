import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { sendEscalationEmail } = await import("../lib/email");

  console.log("RESEND_API_KEY set:", !!process.env.RESEND_API_KEY);
  console.log("SUPPORT_EMAIL:", process.env.SUPPORT_EMAIL || "(not set, using default)");
  console.log();

  console.log("Sending test escalation email...");
  const result = await sendEscalationEmail({
    sessionId: "test-session-123",
    reason: "User asked about their account balance — requires account access",
    category: "account_specific",
    conversationSummary:
      "User: What is my account balance?\nBot: I don't have access to account-specific information. Please contact support@jumbo88.com for account-related inquiries.",
  });

  console.log("Result:", JSON.stringify(result, null, 2));

  if (result.success) {
    console.log("\nEmail sent successfully! Check your inbox.");
  } else {
    console.log("\nEmail failed. Check your RESEND_API_KEY and SUPPORT_EMAIL.");
    console.log("Note: Resend free tier only delivers to your Resend account email.");
  }
}

main().catch(console.error);
