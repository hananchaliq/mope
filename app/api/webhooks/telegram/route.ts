import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv, isRealCredential } from '@/lib/env';
import {
  disconnectTelegramSession,
  getTelegramPairingSession,
  verifyAndCompleteTelegramPairing,
} from '@/lib/telegram-store';

export async function POST(req: NextRequest) {
  const env = getServerEnv();

  if (isRealCredential(env.TELEGRAM_WEBHOOK_SECRET)) {
    const incomingSecret = req.headers.get('x-telegram-bot-api-secret-token');
    if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid Telegram webhook secret token' }, { status: 401 });
    }
  }

  let update: {
    message?: {
      chat?: { id?: number | string; username?: string };
      text?: string;
    };
  };

  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const chatId = update.message?.chat?.id ? String(update.message.chat.id) : null;
  const username = update.message?.chat?.username;
  const text = (update.message?.text ?? '').trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const code = parts[1] ?? '';
    const paired = verifyAndCompleteTelegramPairing(code, chatId, username);
    return NextResponse.json({
      ok: true,
      event: 'start',
      paired,
    });
  }

  if (text === '/status') {
    const session = getTelegramPairingSession();
    return NextResponse.json({
      ok: true,
      event: 'status',
      connected: session.status === 'connected' && session.chatId === chatId,
    });
  }

  if (text === '/stop') {
    disconnectTelegramSession();
    return NextResponse.json({
      ok: true,
      event: 'stop',
      disconnected: true,
    });
  }

  return NextResponse.json({ ok: true });
}
