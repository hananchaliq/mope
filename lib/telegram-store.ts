import crypto from 'node:crypto';

export interface PairingSession {
  codeHash: string;
  plainCodePreview: string;
  createdAtMs: number;
  expiresAtMs: number;
  chatId: string | null;
  telegramUsername: string | null;
  status: 'not_connected' | 'pending' | 'connected' | 'error';
  lastError?: string;
}

declare global {
  var _moneyScopeTelegramPairing: PairingSession | undefined;
}

export function hashPairingCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function createTelegramPairingSession(): { code: string; expiresAtIso: string } {
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const code = `MS-${randomHex}`;
  const now = Date.now();
  const expiresAtMs = now + 10 * 60 * 1000; // 10 minutes

  global._moneyScopeTelegramPairing = {
    codeHash: hashPairingCode(code),
    plainCodePreview: code,
    createdAtMs: now,
    expiresAtMs,
    chatId: null,
    telegramUsername: null,
    status: 'pending',
  };

  return {
    code,
    expiresAtIso: new Date(expiresAtMs).toISOString(),
  };
}

export function getTelegramPairingSession(): PairingSession {
  const current = global._moneyScopeTelegramPairing;
  if (!current) {
    return {
      codeHash: '',
      plainCodePreview: '',
      createdAtMs: 0,
      expiresAtMs: 0,
      chatId: null,
      telegramUsername: null,
      status: 'not_connected',
    };
  }
  if (current.status === 'pending' && Date.now() > current.expiresAtMs) {
    current.status = 'not_connected';
    current.lastError = 'Kode pairing telah kedaluwarsa (lebih dari 10 menit). Buat kode baru.';
  }
  return current;
}

export function verifyAndCompleteTelegramPairing(
  incomingCode: string,
  chatId: string,
  username?: string
): boolean {
  const current = global._moneyScopeTelegramPairing;
  if (!current || current.status !== 'pending') return false;
  if (Date.now() > current.expiresAtMs) {
    current.status = 'not_connected';
    return false;
  }
  const incomingHash = hashPairingCode(incomingCode);
  if (incomingHash !== current.codeHash) {
    return false;
  }
  current.chatId = chatId;
  current.telegramUsername = username ?? null;
  current.status = 'connected';
  current.lastError = undefined;
  return true;
}

export function disconnectTelegramSession(): void {
  global._moneyScopeTelegramPairing = undefined;
}
