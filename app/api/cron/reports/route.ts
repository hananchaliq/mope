import { NextRequest, NextResponse } from 'next/server';
import { getServerEnv, isRealCredential } from '@/lib/env';
import { getTelegramPairingSession } from '@/lib/telegram-store';

declare global {
  var _moneyScopeDispatchedReportKeys: Set<string> | undefined;
}

function getDispatchedSet(): Set<string> {
  if (!global._moneyScopeDispatchedReportKeys) {
    global._moneyScopeDispatchedReportKeys = new Set<string>();
  }
  return global._moneyScopeDispatchedReportKeys;
}

/**
 * Idempotent Cron Endpoint (`/api/cron/reports`)
 * Protected by `CRON_SECRET`. Prevents duplicate report delivery for the same `(preferenceId, periodStart, periodEnd)`.
 */
export async function POST(req: NextRequest) {
  const env = getServerEnv();
  const authHeader = req.headers.get('authorization');
  const cronHeader = req.headers.get('x-cron-secret');

  if (isRealCredential(env.CRON_SECRET)) {
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : cronHeader;
    if (bearer !== env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized: CRON_SECRET tidak cocok.' }, { status: 401 });
    }
  }

  let body: {
    preferenceId?: string;
    periodStart?: string;
    periodEnd?: string;
    channel?: 'telegram' | 'whatsapp';
    reportText?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const preferenceId = body.preferenceId || 'default_pref';
  const periodStart = body.periodStart || new Date().toISOString().slice(0, 10);
  const periodEnd = body.periodEnd || periodStart;
  const dedupeKey = `${preferenceId}:${periodStart}:${periodEnd}`;

  const dispatched = getDispatchedSet();
  if (dispatched.has(dedupeKey)) {
    return NextResponse.json({
      status: 'skipped_duplicate',
      dedupeKey,
      message: 'Laporan untuk periode dan preferensi ini sudah pernah dikirim (idempoten).',
    });
  }

  if (body.channel === 'telegram') {
    if (!isRealCredential(env.TELEGRAM_BOT_TOKEN)) {
      return NextResponse.json(
        {
          status: 'waiting_configuration',
          dedupeKey,
          error: 'TELEGRAM_BOT_TOKEN belum dikonfigurasi.',
        },
        { status: 503 }
      );
    }
    const session = getTelegramPairingSession();
    if (!session.chatId) {
      return NextResponse.json(
        {
          status: 'failed',
          dedupeKey,
          error: 'Telegram belum dipasangkan (chat_id kosong).',
        },
        { status: 400 }
      );
    }
  }

  dispatched.add(dedupeKey);
  return NextResponse.json({
    status: 'queued_idempotent',
    dedupeKey,
    executedAt: new Date().toISOString(),
  });
}
