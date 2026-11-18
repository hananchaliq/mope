import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv, isRealCredential } from '@/lib/env';

export async function POST(req: NextRequest) {
  const env = getServerEnv();
  const configured =
    isRealCredential(env.WHATSAPP_ACCESS_TOKEN) && isRealCredential(env.WHATSAPP_PHONE_NUMBER_ID);

  let body: {
    action?: string;
    recipientPhone?: string;
    templateName?: string;
    templateVariables?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!configured) {
    return NextResponse.json(
      {
        status: 'waiting_configuration',
        error:
          'WHATSAPP_ACCESS_TOKEN dan WHATSAPP_PHONE_NUMBER_ID belum dikonfigurasi di server. Status: Menunggu konfigurasi.',
      },
      { status: 503 }
    );
  }

  const endpoint = `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  if (body.action === 'send_template_report') {
    const phone = (body.recipientPhone ?? '').replace(/[^0-9]/g, '');
    if (!phone) {
      return NextResponse.json({ error: 'Nomor tujuan WhatsApp (format 628xxx) wajib diisi.' }, { status: 400 });
    }

    const parameters = (body.templateVariables ?? []).map((text) => ({
      type: 'text',
      text: String(text).slice(0, 500),
    }));

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: body.templateName || 'moneyscope_financial_summary',
            language: { code: 'id' },
            components: [
              {
                type: 'body',
                parameters,
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(6000),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data?.error?.message || 'Gagal mengirim template WhatsApp Cloud API.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        status: 'sent',
        sentAt: new Date().toISOString(),
        response: data,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Gagal menghubungi Meta Graph API.' },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ status: 'ready', configured });
}

export async function GET(req: NextRequest) {
  const env = getServerEnv();
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const token = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && isRealCredential(env.WHATSAPP_VERIFY_TOKEN) && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 });
  }

  return NextResponse.json({
    configured:
      isRealCredential(env.WHATSAPP_ACCESS_TOKEN) && isRealCredential(env.WHATSAPP_PHONE_NUMBER_ID),
    webhookVerifyConfigured: isRealCredential(env.WHATSAPP_VERIFY_TOKEN),
    signatureSecretConfigured: isRealCredential(env.WHATSAPP_APP_SECRET),
  });
}

