import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIDR,
  calculateAccountBalances,
  aggregatePeriodMetrics,
  evaluateBudgets,
  generateSmartInsights,
  parseTransactionsCsv,
  computeCombinedFinanceNutritionMetrics,
  compareMetric,
} from './finance';
import { DEFAULT_SYSTEM_CATEGORIES, type AccountRecord, type CategoryRecord, type TransactionRecord } from './schemas';
import { fromJakartaCalendar, resolvePeriod } from './periods';

const mockCategories: CategoryRecord[] = DEFAULT_SYSTEM_CATEGORIES.map((c) => ({
  ...c,
  userId: 'u1',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}));

const mockAccounts: AccountRecord[] = [
  {
    id: 'acc_bca',
    userId: 'u1',
    name: 'BCA Tahapan',
    type: 'bank',
    openingBalance: 1_000_000,
    currency: 'IDR',
    isArchived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: 'acc_gopay',
    userId: 'u1',
    name: 'GoPay',
    type: 'ewallet',
    openingBalance: 100_000,
    currency: 'IDR',
    isArchived: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

test('IDR formatting and zero-previous-value comparison ("baru" instead of Infinity)', () => {
  const formatted = formatIDR(25000);
  assert.ok(formatted.includes('25.000'));

  const cmpZero = compareMetric(150000, 0);
  assert.equal(cmpZero.percentChange, null);
  assert.equal(cmpZero.statusLabel, 'baru');

  const cmpGrowth = compareMetric(150000, 100000);
  assert.equal(cmpGrowth.percentChange, 50);
  assert.equal(cmpGrowth.statusLabel, 'naik');
});

test('Account balances & atomic transfers exclude transfers from income/expense analytics', () => {
  const txs: TransactionRecord[] = [
    {
      id: 'tx_1',
      userId: 'u1',
      type: 'income',
      amount: 500_000,
      accountId: 'acc_bca',
      toAccountId: '',
      categoryId: 'cat_inc_gaji',
      description: 'Bonus proyek',
      merchant: 'Kantor',
      paymentMethod: 'Transfer Bank',
      occurredAt: '2026-11-10T03:00:00.000Z',
      notes: '',
      clientId: 'c1',
      linkedFoodLogId: '',
      createdAt: '2026-11-10T03:00:00.000Z',
      updatedAt: '2026-11-10T03:00:00.000Z',
    },
    {
      id: 'tx_2',
      userId: 'u1',
      type: 'transfer',
      amount: 200_000,
      accountId: 'acc_bca',
      toAccountId: 'acc_gopay',
      categoryId: '',
      description: 'Topup GoPay',
      merchant: '',
      paymentMethod: 'Transfer',
      occurredAt: '2026-11-11T04:00:00.000Z',
      notes: '',
      clientId: 'c2',
      linkedFoodLogId: '',
      createdAt: '2026-11-11T04:00:00.000Z',
      updatedAt: '2026-11-11T04:00:00.000Z',
    },
    {
      id: 'tx_3',
      userId: 'u1',
      type: 'expense',
      amount: 30_000,
      accountId: 'acc_gopay',
      toAccountId: '',
      categoryId: 'cat_exp_makan_siang',
      description: 'Nasi ayam bakar',
      merchant: 'Warung Sunda',
      paymentMethod: 'QRIS',
      occurredAt: '2026-11-12T05:30:00.000Z',
      notes: '',
      clientId: 'c3',
      linkedFoodLogId: 'fl_1',
      createdAt: '2026-11-12T05:30:00.000Z',
      updatedAt: '2026-11-12T05:30:00.000Z',
    },
  ];

  const balances = calculateAccountBalances(mockAccounts, txs);
  const bca = balances.find((b) => b.account.id === 'acc_bca')!;
  const gopay = balances.find((b) => b.account.id === 'acc_gopay')!;

  // BCA: 1,000,000 + 500,000 - 200,000 transferOut = 1,300,000
  assert.equal(bca.currentBalance, 1_300_000);
  // GoPay: 100,000 + 200,000 transferIn - 30,000 expense = 270,000
  assert.equal(gopay.currentBalance, 270_000);

  const ref = fromJakartaCalendar(2026, 11, 15, 12, 0, 0);
  const win = resolvePeriod('this_month', ref);
  const summary = aggregatePeriodMetrics(txs, mockCategories, win);

  // Transfers must NOT be counted in totalIncome or totalExpense
  assert.equal(summary.totalIncome, 500_000);
  assert.equal(summary.totalExpense, 30_000);
  assert.equal(summary.netCashFlow, 470_000);
  // Daily average expense divides by 30 days of November, not 1 transaction day
  assert.equal(summary.dailyAverageExpense, 1000);
});

test('Budget evaluation, linear projection, and Smart Insights minimum data gating', () => {
  const ref = fromJakartaCalendar(2026, 11, 15, 12, 0, 0); // 15 elapsed days out of 30 in Nov
  const txs: TransactionRecord[] = [
    {
      id: 'tx_a',
      userId: 'u1',
      type: 'expense',
      amount: 600_000,
      accountId: 'acc_bca',
      toAccountId: '',
      categoryId: 'cat_exp_makan_siang',
      description: 'Katering',
      merchant: 'Dapur Sehat',
      paymentMethod: 'QRIS',
      occurredAt: '2026-11-05T05:00:00.000Z',
      notes: '',
      clientId: 'ca',
      linkedFoodLogId: '',
      createdAt: '2026-11-05T05:00:00.000Z',
      updatedAt: '2026-11-05T05:00:00.000Z',
    },
  ];

  // Insights should NOT appear when fewer than 3 expense transactions exist
  assert.equal(generateSmartInsights(txs, mockCategories, ref).length, 0);

  const { evaluated, newNotifications } = evaluateBudgets(
    [
      {
        id: 'b_1',
        userId: 'u1',
        name: 'Anggaran Makan',
        scope: 'category',
        categoryId: 'cat_exp_makan_siang',
        period: 'monthly',
        limitAmount: 1_000_000,
        alertThresholds: [50, 80, 100],
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    txs,
    mockCategories,
    ref
  );

  assert.equal(evaluated[0].usedAmount, 600_000);
  assert.equal(evaluated[0].percentUsed, 60);
  // 600,000 / 15 elapsed days * 30 total days = 1,200,000 linear projection
  assert.equal(evaluated[0].projectedAmount, 1_200_000);
  assert.equal(newNotifications.length, 1);
  assert.ok(newNotifications[0].dedupeKey.includes('50'));
});

test('CSV parser row validation and combined finance x nutrition cost per gram protein', () => {
  const csv = [
    'tanggal,tipe,nominal,kategori,akun,deskripsi',
    '2026-11-12,expense,25000,Makan siang,BCA Tahapan,Nasi ayam dada',
    'invalid-date,expense,-100,Makan siang,BCA Tahapan,Data rusak',
  ].join('\n');

  const parsed = parseTransactionsCsv(csv, [], mockCategories, mockAccounts);
  assert.equal(parsed.validCount, 1);
  assert.equal(parsed.errorCount, 1);
  assert.equal(parsed.rows[1].errors.length, 2);

  const ref = fromJakartaCalendar(2026, 11, 15, 12, 0, 0);
  const win = resolvePeriod('this_month', ref);
  const combined = computeCombinedFinanceNutritionMetrics(
    [
      {
        id: 'tx_food_1',
        userId: 'u1',
        type: 'expense',
        amount: 36_000,
        accountId: 'acc_bca',
        toAccountId: '',
        categoryId: 'cat_exp_makan_siang',
        description: 'Nasi + Dada Ayam Bakar',
        merchant: 'Resto',
        paymentMethod: 'QRIS',
        occurredAt: '2026-11-12T05:00:00.000Z',
        notes: '',
        clientId: 'cf1',
        linkedFoodLogId: 'fl_1',
        createdAt: '2026-11-12T05:00:00.000Z',
        updatedAt: '2026-11-12T05:00:00.000Z',
      },
    ],
    [
      {
        id: 'fl_1',
        userId: 'u1',
        mealType: 'lunch',
        title: 'Nasi + Dada Ayam Bakar',
        eatenAt: '2026-11-12T05:00:00.000Z',
        transactionId: 'tx_food_1',
        userConfirmed: true,
        modelName: 'gemini-4-hydrogen',
        items: [],
        totalCalories: 480,
        totalProteinG: 36,
        totalCarbsG: 45,
        totalFatG: 12,
        totalFiberG: 3,
        totalSodiumMg: 420,
        validItemCount: 2,
        totalItemCount: 2,
        itemsSummary: 'Nasi Putih (150g), Dada Ayam Bakar (120g)',
        createdAt: '2026-11-12T05:00:00.000Z',
        updatedAt: '2026-11-12T05:00:00.000Z',
      },
    ],
    win
  );

  // Rp 36.000 / 36g protein = Rp 1.000 / gram protein
  assert.equal(combined.costPerGramProtein, 1000);
  assert.equal(combined.costPerGramProteinSampleCount, 1);
});
