import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv, isRealCredential } from '@/lib/env';
import {
  createTelegramPairingSession,
  disconnectTelegramSession,
  getTelegramPairingSession,
} from '@/lib/telegram-store';

export async function GET() {
  const env = getServerEnv();
  const tokenConfigured = isRealCredential(env.TELEGRAM_BOT_TOKEN);
  const session = getTelegramPairingSession();

  return NextResponse.json({
    tokenConfigured,
    webhookSecretConfigured: isRealCredential(env.TELEGRAM_WEBHOOK_SECRET),
    botUsername: isRealCredential(env.TELEGRAM_BOT_USERNAME) ? env.TELEGRAM_BOT_USERNAME : null,
    session: {
      status: tokenConfigured ? session.status : 'waiting_configuration',
      chatId: session.chatId,
      telegramUsername: session.telegramUsername,
      expiresAt: session.expiresAtMs ? new Date(session.expiresAtMs).toISOString() : null,
      lastError: session.lastError,
    },
  });
}

export async function POST(req: NextRequest) {
  const env = getServerEnv();
  const tokenConfigured = isRealCredential(env.TELEGRAM_BOT_TOKEN);

  let body: { action?: string; chatId?: string; reportText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload JSON tidak valid.' }, { status: 400 });
  }

  const { action } = body;

  if (action === 'generate_pairing_code') {
    const { code, expiresAtIso } = createTelegramPairingSession();
    return NextResponse.json({
      code,
      expiresAtIso,
      tokenConfigured,
      instruction: `Kirim perintah "/start ${code}" ke bot Telegram Anda dalam waktu 10 menit.`,
    });
  }

  if (action === 'disconnect') {
    disconnectTelegramSession();
    return NextResponse.json({ status: 'not_connected', message: 'Koneksi Telegram diputuskan dan chat_id dihapus.' });
  }

  if (!tokenConfigured) {
    return NextResponse.json(
      {
        status: 'waiting_configuration',
        error: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi di environment server. Status: Menunggu konfigurasi.',
      },
      { status: 503 }
    );
  }

  const botToken = env.TELEGRAM_BOT_TOKEN!;

  if (action === 'test_connection') {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: { username?: string; first_name?: string };
        description?: string;
      };
      if (!res.ok || !data.ok) {
        return NextResponse.json(
          {
            status: 'error',
            error: data.description || 'Token Bot Telegram ditolak oleh server Telegram.',
          },
          { status: 400 }
        );
      }
      return NextResponse.json({
        status: 'ok',
        botUsername: data.result?.username ?? null,
        botName: data.result?.first_name ?? 'Telegram Bot',
      });
    } catch (err) {
      return NextResponse.json(
        {
          status: 'error',
          error: err instanceof Error ? err.message : 'Gagal menghubungi API Telegram.',
        },
        { status: 502 }
      );
    }
  }

  if (action === 'send_report') {
    const session = getTelegramPairingSession();
    const targetChatId = body.chatId?.trim() || session.chatId;
    if (!targetChatId) {
      return NextResponse.json(
        {
          error: 'Belum ada chat_id Telegram yang terhubung. Selesaikan pairing /start <kode> atau masukkan chat_id tujuan.',
        },
        { status: 400 }
      );
    }
    if (!body.reportText) {
      return NextResponse.json({ error: 'Isi laporan (reportText) kosong.' }, { status: 400 });
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: body.reportText,
        }),
        signal: AbortSignal.timeout(6000),
      });

      const data = (await res.json()) as { ok?: boolean; error_code?: number; description?: string };
      if (!res.ok || !data.ok) {
        if (data.error_code === 403) {
          disconnectTelegramSession();
        }
        return NextResponse.json(
          {
            error: data.description || 'Gagal mengirim pesan ke Telegram.',
            code: data.error_code,
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        status: 'sent',
        sentAt: new Date().toISOString(),
        chatId: targetChatId,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Koneksi ke Telegram gagal.' },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: 'Aksi tidak dikenali.' }, { status: 400 });
}
