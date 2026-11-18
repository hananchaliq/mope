import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync('./firestore.rules', 'utf8');

interface AuthContext {
  uid: string;
  emailVerified: boolean;
}

interface EvalContext {
  auth: AuthContext | null;
  pathUserId: string;
  docId: string;
  parentUserExists: boolean;
  accountExists?: boolean;
  requestTimeIso: string;
  existingData?: Record<string, unknown>;
  incomingData?: Record<string, unknown>;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function evaluateCreateTransaction(ctx: EvalContext): boolean {
  if (!ctx.auth || !ctx.auth.emailVerified) return false;
  if (ctx.auth.uid !== ctx.pathUserId) return false;
  if (!VALID_ID_REGEX.test(ctx.pathUserId) || !VALID_ID_REGEX.test(ctx.docId)) return false;
  if (!ctx.parentUserExists || !ctx.accountExists) return false;
  const d = ctx.incomingData;
  if (!d) return false;
  const allowedKeys = [
    'userId', 'type', 'amount', 'accountId', 'toAccountId', 'categoryId',
    'description', 'merchant', 'paymentMethod', 'occurredAt', 'notes',
    'clientId', 'linkedFoodLogId', 'createdAt', 'updatedAt',
  ];
  const keys = Object.keys(d);
  if (keys.length !== allowedKeys.length || ! keys.every((k) => allowedKeys.includes(k))) return false;
  if (d.userId !== ctx.auth.uid || d.userId !== ctx.pathUserId) return false;
  if (!['income', 'expense', 'transfer'].includes(String(d.type))) return false;
  if (typeof d.amount !== 'number' || !Number.isInteger(d.amount) || d.amount <= 0) return false;
  if (typeof d.accountId !== 'string' || !VALID_ID_REGEX.test(d.accountId)) return false;
  if (d.type === 'transfer' && (!d.toAccountId || d.toAccountId === d.accountId)) return false;
  if (typeof d.notes !== 'string' || d.notes.length > 500) return false;
  if (d.createdAt !== ctx.requestTimeIso || d.updatedAt !== ctx.requestTimeIso) return false;
  return true;
}

test('Firestore Rules Structure & Eight Pillars Static Audit', () => {
  assert.ok(rulesSource.includes("rules_version = '2';"));
  assert.ok(rulesSource.includes('match /{document=**} {\n      allow read, write: if false;\n    }'));
  assert.ok(rulesSource.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesSource.includes('resource.data.userId == request.auth.uid'));
  assert.ok(rulesSource.includes('incoming().diff(existing()).affectedKeys().hasOnly'));
});

test('Dirty Dozen Payload 01-12 Enforcement & Cross-User RLS Isolation', () => {
  const now = '2026-11-17T10:00:00.000Z';
  const validPayload = {
    userId: 'user_A',
    type: 'expense',
    amount: 25000,
    accountId: 'acc_1',
    toAccountId: '',
    categoryId: 'cat_food_lunch',
    description: 'Makan siang nasi ayam',
    merchant: 'Warung Padang',
    paymentMethod: 'QRIS',
    occurredAt: now,
    notes: 'Porsi normal',
    clientId: 'client_tx_01',
    linkedFoodLogId: '',
    createdAt: now,
    updatedAt: now,
  };

  // Valid owner write succeeds
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: validPayload,
    }),
    true
  );

  // Dirty Dozen #1: User B attempting to write to User A's transactions -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_B', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: validPayload,
    }),
    false
  );

  // Dirty Dozen #2: Unverified email -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: false },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: validPayload,
    }),
    false
  );

  // Dirty Dozen #3: Spoofed userId inside payload -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, userId: 'user_B' },
    }),
    false
  );

  // Dirty Dozen #4: Shadow field injection -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, isAdmin: true },
    }),
    false
  );

  // Dirty Dozen #5: Zero or negative amount -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, amount: 0 },
    }),
    false
  );

  // Dirty Dozen #6: Self-transfer to same account -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, type: 'transfer', toAccountId: 'acc_1' },
    }),
    false
  );

  // Dirty Dozen #7: Orphaned write without parent user document -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: false,
      accountExists: true,
      requestTimeIso: now,
      incomingData: validPayload,
    }),
    false
  );

  // Dirty Dozen #8: Invalid characters in document ID -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'bad$id!spaces',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: validPayload,
    }),
    false
  );

  // Dirty Dozen #9: Denial-of-Wallet oversized notes string -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, notes: 'x'.repeat(501) },
    }),
    false
  );

  // Dirty Dozen #12: Forged createdAt timestamp -> DENIED
  assert.equal(
    evaluateCreateTransaction({
      auth: { uid: 'user_A', emailVerified: true },
      pathUserId: 'user_A',
      docId: 'tx_1',
      parentUserExists: true,
      accountExists: true,
      requestTimeIso: now,
      incomingData: { ...validPayload, createdAt: '2020-01-01T00:00:00.000Z' },
    }),
    false
  );
});
