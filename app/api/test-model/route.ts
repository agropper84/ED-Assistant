import { NextRequest, NextResponse } from 'next/server';
import { getAnthropicClient } from '@/lib/api-keys';

export async function POST(request: NextRequest) {
  try {
    const { model } = await request.json();
    if (!model) return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });

    const client = await getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Reply with only the word "OK".' }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ success: !!text, response: text, model: response.model });
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || String(error);
    return NextResponse.json({ success: false, error: msg.substring(0, 200) }, { status: 200 });
  }
}
