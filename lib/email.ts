import { createHmac } from 'crypto';
import { Resend } from 'resend';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://www.minierdashboard.com';

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET not configured');
  return secret;
}

/** Generate HMAC-SHA256 signature for a userId */
function sign(userId: string): string {
  return createHmac('sha256', getSecret()).update(userId).digest('hex');
}

/** Verify HMAC-SHA256 signature for a userId */
export function verifySignature(userId: string, sig: string): boolean {
  const expected = sign(userId);
  if (expected.length !== sig.length) return false;
  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Generate the one-click approve URL with HMAC signature */
export function generateApproveUrl(userId: string): string {
  const sig = sign(userId);
  return `${BASE_URL}/api/auth/approve?userId=${encodeURIComponent(userId)}&sig=${sig}`;
}

/** Send approval request email to admin */
export async function sendApprovalEmail(
  adminEmail: string,
  userName: string,
  userEmail: string,
  approveUrl: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY not set — skipping approval email');
    return;
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from: 'Mini ER Dashboard <noreply@minierdashboard.com>',
    to: adminEmail,
    subject: `Access Request: ${userName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <h2 style="margin: 0 0 16px;">New Access Request</h2>
        <p style="color: #374151; line-height: 1.6;">
          <strong>${userName}</strong> (${userEmail}) is requesting access to Mini ER Dashboard.
        </p>
        <a href="${approveUrl}" style="display: inline-block; margin: 24px 0; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500;">
          Approve Access
        </a>
        <p style="color: #6b7280; font-size: 14px;">
          If you did not expect this request, you can ignore this email.
        </p>
      </div>
    `,
  });
}
