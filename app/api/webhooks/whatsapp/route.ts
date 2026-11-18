import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getServerEnv } from '@/lib/env';

function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const env = getServerEnv();

  if (mode === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'Token verifikasi webhook WhatsApp tidak cocok.' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const env = getServerEnv();
    const rawBody = await req.text();
    const sig = req.headers.get('x-hub-signature-256');

    if (!verifyMetaSignature(rawBody, sig, env.WHATSAPP_APP_SECRET)) {
      return NextResponse.json(
        { error: 'X-Hub-Signature-256 tidak valid atau WHATSAPP_APP_SECRET belum dikonfigurasi.' },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    return NextResponse.json({
      received: true,
      object: payload.object ?? 'whatsapp_business_account',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal memproses webhook WhatsApp.' },
      { status: 500 }
    );
  }
}
