import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/email';
import { setUserStatus, getUserStatus } from '@/lib/kv';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId');
  const sig = request.nextUrl.searchParams.get('sig');

  if (!userId || !sig) {
    return new NextResponse(page('Invalid Link', 'The approval link is missing required parameters.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!verifySignature(userId, sig)) {
    return new NextResponse(page('Invalid Signature', 'This approval link is invalid or has been tampered with.'), {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const currentStatus = await getUserStatus(userId);
  if (currentStatus === 'approved') {
    return new NextResponse(page('Already Approved', 'This user has already been approved.'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  await setUserStatus(userId, 'approved');

  return new NextResponse(page('User Approved', 'The user has been approved and can now log in to My Patient Dashboard.'), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function page(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;">
  <div style="text-align:center;max-width:400px;padding:32px;">
    <h1 style="font-size:24px;margin:0 0 12px;">${title}</h1>
    <p style="color:#4b5563;line-height:1.6;">${message}</p>
  </div>
</body>
</html>`;
}
