import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Resend free tier only delivers to your verified account email.
// Set SUPPORT_EMAIL to your Resend account email for testing.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "jumbo88support@gmail.com";

// Resend free tier requires sending from onboarding@resend.dev
const FROM_EMAIL = "Jumbo88 AI Support <onboarding@resend.dev>";

interface EscalationEmailParams {
  sessionId: string;
  reason: string;
  category: string;
  conversationSummary: string;
}

/**
 * Send an escalation email to the support team when the AI
 * cannot handle a user's request.
 */
export async function sendEscalationEmail({
  sessionId,
  reason,
  category,
  conversationSummary,
}: EscalationEmailParams): Promise<{ success: boolean; id?: string }> {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: SUPPORT_EMAIL,
      subject: `[Escalation] ${category.replace(/_/g, " ")} — Session ${sessionId.slice(0, 8)}`,
      html: `
        <div style="font-family: 'Nunito Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f1729; color: #e5e5e5; padding: 24px; border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
            <div style="background: #22c55e; color: white; font-weight: 800; font-size: 14px; padding: 8px 12px; border-radius: 8px;">J88</div>
            <div>
              <h2 style="margin: 0; color: white; font-size: 18px;">Escalation Alert</h2>
              <p style="margin: 0; color: #999; font-size: 13px;">AI Support Chat — requires human review</p>
            </div>
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 12px; background: #1a2540; border-radius: 6px 6px 0 0; color: #999; font-size: 13px; width: 120px;">Session ID</td>
              <td style="padding: 8px 12px; background: #1a2540; border-radius: 6px 6px 0 0; color: white; font-size: 13px; font-family: monospace;">${sessionId}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #1e2d4d; color: #999; font-size: 13px;">Category</td>
              <td style="padding: 8px 12px; background: #1e2d4d; color: #22c55e; font-size: 13px; font-weight: 600;">${category.replace(/_/g, " ").toUpperCase()}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #1a2540; border-radius: 0 0 6px 6px; color: #999; font-size: 13px;">Reason</td>
              <td style="padding: 8px 12px; background: #1a2540; border-radius: 0 0 6px 6px; color: white; font-size: 13px;">${reason}</td>
            </tr>
          </table>

          <div style="background: #1a2540; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px 0; color: #999; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Conversation</h3>
            <div style="color: #e5e5e5; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${conversationSummary}</div>
          </div>

          <p style="color: #666; font-size: 12px; text-align: center; margin: 0;">
            Sent by Jumbo88 AI Support Chat
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    console.error("Failed to send escalation email:", err);
    return { success: false };
  }
}
