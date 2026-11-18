import {
  type AccountRecord,
  type BudgetRecord,
  type CategoryRecord,
  type FoodLogRecord,
  type TransactionRecord,
  type AppNotification,
  JAJAN_CATEGORY_IDS,
  MAKAN_UTAMA_CATEGORY_IDS,
} from './schemas';
import {
  type PeriodWindow,
  formatJakartaDateKey,
  isWithinRange,
  listJakartaDatesInRange,
  resolvePeriod,
  toJakartaParts,
} from './periods';

const idrFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatIDR(amount: number | bigint): string {
  const safeVal = typeof amount === 'bigint' ? amount : Math.round(amount);
  return idrFormatter.format(safeVal);
}

export interface ComputedAccountBalance {
  account: AccountRecord;
  incomeTotal: number;
  expenseTotal: number;
  transferInTotal: number;
  transferOutTotal: number;
  currentBalance: number;
}

/**
 * Computes account balances dynamically from openingBalance + all transactions.
 * Transfers move money atomically between accounts without inflating income/expense.
 */
export function calculateAccountBalances(
  accounts: AccountRecord[],
  transactions: TransactionRecord[]
): ComputedAccountBalance[] {
  return accounts.map((account) => {
    let incomeTotal = 0;
    let expenseTotal = 0;
    let transferInTotal = 0;
    let transferOutTotal = 0;

    for (const tx of transactions) {
      if (tx.type === 'income' && tx.accountId === account.id) {
        incomeTotal += tx.amount;
      } else if (tx.type === 'expense' && tx.accountId === account.id) {
        expenseTotal += tx.amount;
      } else if (tx.type === 'transfer') {
        if (tx.accountId === account.id) {
          transferOutTotal += tx.amount;
        }
        if (tx.toAccountId === account.id) {
          transferInTotal += tx.amount;
        }
      }
    }

    const currentBalance =
      account.openingBalance + incomeTotal - expenseTotal - transferOutTotal + transferInTotal;

    return {
      account,
      incomeTotal,
      expenseTotal,
      transferInTotal,
      transferOutTotal,
      currentBalance,
    };
  });
}

export interface ComparisonMetric {
  currentValue: number;
  previousValue: number;
  deltaAmount: number;
  percentChange: number | null;
  statusLabel: 'baru' | 'naik' | 'turun' | 'tetap';
}

export function compareMetric(currentValue: number, previousValue: number): ComparisonMetric {
  const deltaAmount = currentValue - previousValue;
  if (previousValue === 0) {
    return {
      currentValue,
      previousValue,
      deltaAmount,
      percentChange: null,
      statusLabel: currentValue > 0 ? 'baru' : 'tetap',
    };
  }
  const percentChange = Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
  const statusLabel = deltaAmount > 0 ? 'naik' : deltaAmount < 0 ? 'turun' : 'tetap';
  return {
    currentValue,
    previousValue,
    deltaAmount,
    percentChange,
    statusLabel,
  };
}

export interface DailySeriesPoint {
  dateKey: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
}

export interface CategoryDistributionItem {
  categoryId: string;
  categoryName: string;
  groupName: string;
  color: string;
  amount: number;
  percentage: number;
  transactionCount: number;
}

export interface PeriodAnalyticsSummary {
  window: PeriodWindow;
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  transactionCount: number;
  dailyAverageExpense: number;
  dailyAverageFormula: string;
  largestExpense: TransactionRecord | null;
  dominantCategory: CategoryDistributionItem | null;
  incomeComparison: ComparisonMetric;
  expenseComparison: ComparisonMetric;
  dailySeries: DailySeriesPoint[];
  categoryDistribution: CategoryDistributionItem[];
  filteredTransactions: TransactionRecord[];
}

export function aggregatePeriodMetrics(
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
  window: PeriodWindow
): PeriodAnalyticsSummary {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const currentTxs = transactions.filter((tx) => isWithinRange(tx.occurredAt, window.start, window.end));
  const previousTxs = transactions.filter((tx) =>
    isWithinRange(tx.occurredAt, window.previousStart, window.previousEnd)
  );

  let totalIncome = 0;
  let totalExpense = 0;
  let largestExpense: TransactionRecord | null = null;

  const byCategory = new Map<string, { amount: number; count: number }>();
  const byDate = new Map<string, { income: number; expense: number; count: number }>();

  for (const dateKey of listJakartaDatesInRange(window.start, window.end)) {
    byDate.set(dateKey, { income: 0, expense: 0, count: 0 });
  }

  for (const tx of currentTxs) {
    const dateKey = formatJakartaDateKey(new Date(tx.occurredAt));
    const bucket = byDate.get(dateKey) ?? { income: 0, expense: 0, count: 0 };
    bucket.count += 1;

    if (tx.type === 'income') {
      totalIncome += tx.amount;
      bucket.income += tx.amount;
    } else if (tx.type === 'expense') {
      totalExpense += tx.amount;
      bucket.expense += tx.amount;
      if (!largestExpense || tx.amount > largestExpense.amount) {
        largestExpense = tx;
      }
      const catEntry = byCategory.get(tx.categoryId) ?? { amount: 0, count: 0 };
      catEntry.amount += tx.amount;
      catEntry.count += 1;
      byCategory.set(tx.categoryId, catEntry);
    }
    byDate.set(dateKey, bucket);
  }

  let prevIncome = 0;
  let prevExpense = 0;
  for (const tx of previousTxs) {
    if (tx.type === 'income') prevIncome += tx.amount;
    if (tx.type === 'expense') prevExpense += tx.amount;
  }

  const dailyAverageExpense = Math.round(totalExpense / Math.max(1, window.totalDays));
  const dailyAverageFormula = `${formatIDR(totalExpense)} ÷ ${window.totalDays} hari periode = ${formatIDR(dailyAverageExpense)}/hari`;

  const categoryDistribution: CategoryDistributionItem[] = Array.from(byCategory.entries())
    .map(([categoryId, stats]) => {
      const cat = categoryMap.get(categoryId);
      return {
        categoryId,
        categoryName: cat?.name ?? 'Tanpa Kategori',
        groupName: cat?.groupName ?? 'Lainnya',
        color: cat?.color ?? 'slate',
        amount: stats.amount,
        percentage: totalExpense > 0 ? Number(((stats.amount / totalExpense) * 100).toFixed(1)) : 0,
        transactionCount: stats.count,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const dailySeries: DailySeriesPoint[] = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, d]) => ({
      dateKey,
      income: d.income,
      expense: d.expense,
      net: d.income - d.expense,
      transactionCount: d.count,
    }));

  return {
    window,
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    transactionCount: currentTxs.length,
    dailyAverageExpense,
    dailyAverageFormula,
    largestExpense,
    dominantCategory: categoryDistribution[0] ?? null,
    incomeComparison: compareMetric(totalIncome, prevIncome),
    expenseComparison: compareMetric(totalExpense, prevExpense),
    dailySeries,
    categoryDistribution,
    filteredTransactions: currentTxs.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    ),
  };
}

export interface EvaluatedBudget {
  budget: BudgetRecord;
  categoryName: string;
  usedAmount: number;
  remainingAmount: number;
  percentUsed: number;
  projectedAmount: number;
  projectionFormula: string;
  elapsedDays: number;
  totalDays: number;
  status: 'safe' | 'warning' | 'danger' | 'exceeded';
  triggeredThresholds: number[];
}

export function evaluateBudgets(
  budgets: BudgetRecord[],
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
  referenceNow: Date = new Date()
): { evaluated: EvaluatedBudget[]; newNotifications: Omit<AppNotification, 'id' | 'userId'>[] } {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const evaluated: EvaluatedBudget[] = [];
  const newNotifications: Omit<AppNotification, 'id' | 'userId'>[] = [];

  for (const budget of budgets) {
    const win = resolvePeriod(budget.period === 'weekly' ? 'this_week' : 'this_month', referenceNow);
    const periodKey = `${budget.period}_${formatJakartaDateKey(win.start)}`;

    const relevantExpenses = transactions.filter((tx) => {
      if (tx.type !== 'expense') return false;
      if (!isWithinRange(tx.occurredAt, win.start, win.end)) return false;
      if (budget.scope === 'category' && tx.categoryId !== budget.categoryId) return false;
      return true;
    });

    const usedAmount = relevantExpenses.reduce((sum, tx) => sum + tx.amount, 0);
    const remainingAmount = budget.limitAmount - usedAmount;
    const percentUsed = Number(((usedAmount / budget.limitAmount) * 100).toFixed(1));
    const projectedAmount = Math.round((usedAmount / Math.max(1, win.elapsedDays)) * win.totalDays);
    const projectionFormula = `${formatIDR(usedAmount)} ÷ ${win.elapsedDays} hari berjalan × ${win.totalDays} total hari = ${formatIDR(projectedAmount)} (Proyeksi linear)`;

    const sortedThresholds = [...budget.alertThresholds].sort((a, b) => a - b);
    const triggeredThresholds = sortedThresholds.filter((t) => percentUsed >= t);

    let status: EvaluatedBudget['status'] = 'safe';
    if (percentUsed > 100) status = 'exceeded';
    else if (percentUsed >= 80) status = 'danger';
    else if (percentUsed >= 50) status = 'warning';

    const categoryName =
      budget.scope === 'total'
        ? 'Semua Kategori'
        : (categoryMap.get(budget.categoryId)?.name ?? 'Kategori');

    for (const threshold of triggeredThresholds) {
      const dedupeKey = `budget_${budget.id}_${periodKey}_${threshold}`;
      newNotifications.push({
        type: 'budget_threshold',
        title:
          threshold >= 100
            ? `Anggaran "${budget.name}" Mencapai ${percentUsed}%`
            : `Peringatan Anggaran "${budget.name}" (${threshold}%)`,
        body: `Terpakai ${formatIDR(usedAmount)} dari batas ${formatIDR(budget.limitAmount)} (${percentUsed}%).`,
        dedupeKey,
        readAt: null,
        createdAt: referenceNow.toISOString(),
      });
    }

    evaluated.push({
      budget,
      categoryName,
      usedAmount,
      remainingAmount,
      percentUsed,
      projectedAmount,
      projectionFormula,
      elapsedDays: win.elapsedDays,
      totalDays: win.totalDays,
      status,
      triggeredThresholds,
    });
  }

  return { evaluated, newNotifications };
}

export interface DeterministicInsight {
  id: string;
  severity: 'info' | 'warning' | 'positive';
  title: string;
  text: string;
  evidence: {
    metric: string;
    value: string;
    comparison: string;
    formula: string;
  };
  minDataRequired: string;
}

const INDONESIAN_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/**
 * Deterministic Rule-Based Smart Insights Engine (Section 6.4).
 * Never uses LLM guesses; only emits insights when minimum data threshold is satisfied.
 */
export function generateSmartInsights(
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
  referenceNow: Date = new Date()
): DeterministicInsight[] {
  const expenseTxs = transactions.filter((tx) => tx.type === 'expense');
  if (expenseTxs.length < 3) {
    return [];
  }

  const insights: DeterministicInsight[] = [];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Rule 1: Dominant Category This Month (Requires >= 3 expense transactions in this_month)
  const monthWindow = resolvePeriod('this_month', referenceNow);
  const monthSummary = aggregatePeriodMetrics(transactions, categories, monthWindow);
  const monthExpenseTxs = monthSummary.filteredTransactions.filter((t) => t.type === 'expense');

  if (monthExpenseTxs.length >= 3 && monthSummary.dominantCategory) {
    const dom = monthSummary.dominantCategory;
    insights.push({
      id: 'insight_dominant_category_month',
      severity: dom.percentage >= 45 ? 'warning' : 'info',
      title: `Kategori Terbesar Bulan Ini: ${dom.categoryName}`,
      text: `${dom.categoryName} menyerap ${dom.percentage}% dari seluruh pengeluaran bulan ini (${formatIDR(dom.amount)} dari ${dom.transactionCount} transaksi).`,
      evidence: {
        metric: `Total ${dom.categoryName} (Bulan ini)`,
        value: formatIDR(dom.amount),
        comparison: `${dom.percentage}% dari total pengeluaran ${formatIDR(monthSummary.totalExpense)}`,
        formula: `${formatIDR(dom.amount)} ÷ ${formatIDR(monthSummary.totalExpense)} × 100% = ${dom.percentage}%`,
      },
      minDataRequired: 'Minimal 3 transaksi pengeluaran pada bulan berjalan',
    });
  }

  // Rule 2: Jajan vs Makan Utama Ratio (Requires both Jajan & Makan Utama transactions in last 30 days)
  const last14Window = resolvePeriod('last_14_days', referenceNow);
  const recentExpenses = transactions.filter(
    (t) => t.type === 'expense' && isWithinRange(t.occurredAt, last14Window.start, last14Window.end)
  );
  if (recentExpenses.length >= 3) {
    const jajanSum = recentExpenses
      .filter((t) => JAJAN_CATEGORY_IDS.has(t.categoryId) || categoryMap.get(t.categoryId)?.name.toLowerCase().includes('jajan'))
      .reduce((s, t) => s + t.amount, 0);
    const makanSum = recentExpenses
      .filter((t) => MAKAN_UTAMA_CATEGORY_IDS.has(t.categoryId))
      .reduce((s, t) => s + t.amount, 0);

    if (jajanSum > 0 && makanSum > 0) {
      const ratioPct = Number(((jajanSum / (jajanSum + makanSum)) * 100).toFixed(1));
      insights.push({
        id: 'insight_jajan_vs_makan',
        severity: ratioPct >= 40 ? 'warning' : 'positive',
        title: 'Proporsi Jajan vs Makan Utama (14 Hari Terakhir)',
        text: `Pengeluaran Jajan & Minuman mencapai ${formatIDR(jajanSum)} (${ratioPct}% dari gabungan belanja konsumsi ${formatIDR(jajanSum + makanSum)}).`,
        evidence: {
          metric: 'Rasio Jajan terhadap Total Konsumsi',
          value: `${ratioPct}% (${formatIDR(jajanSum)})`,
          comparison: `Makan utama: ${formatIDR(makanSum)}`,
          formula: `${formatIDR(jajanSum)} ÷ (${formatIDR(jajanSum)} + ${formatIDR(makanSum)}) × 100% = ${ratioPct}%`,
        },
        minDataRequired: 'Minimal 3 transaksi pengeluaran dalam 14 hari terakhir dengan kategori Makan & Jajan',
      });
    }
  }

  // Rule 3: Peak Spending Day of Week in Asia/Jakarta (Requires >= 4 expense transactions)
  if (expenseTxs.length >= 4) {
    const dayTotals = new Map<number, { amount: number; count: number }>();
    for (const tx of expenseTxs) {
      const { dayOfWeek } = toJakartaParts(new Date(tx.occurredAt));
      const curr = dayTotals.get(dayOfWeek) ?? { amount: 0, count: 0 };
      curr.amount += tx.amount;
      curr.count += 1;
      dayTotals.set(dayOfWeek, curr);
    }
    const topDay = Array.from(dayTotals.entries()).sort((a, b) => b[1].amount - a[1].amount)[0];
    if (topDay) {
      const dayName = INDONESIAN_DAYS[topDay[0]];
      const totalAllExpense = expenseTxs.reduce((s, t) => s + t.amount, 0);
      const sharePct = Number(((topDay[1].amount / totalAllExpense) * 100).toFixed(1));
      insights.push({
        id: 'insight_peak_day_of_week',
        severity: 'info',
        title: `Hari Paling Boros: ${dayName}`,
        text: `Hari ${dayName} mencatat akumulasi pengeluaran tertinggi sebesar ${formatIDR(topDay[1].amount)} (${topDay[1].count} transaksi).`,
        evidence: {
          metric: `Akumulasi Pengeluaran Hari ${dayName} (WIB)`,
          value: formatIDR(topDay[1].amount),
          comparison: `${sharePct}% dari total ${expenseTxs.length} transaksi pengeluaran`,
          formula: `Σ pengeluaran hari ${dayName} (Asia/Jakarta) = ${formatIDR(topDay[1].amount)} dari ${topDay[1].count} transaksi`,
        },
        minDataRequired: 'Minimal 4 transaksi pengeluaran tercatat',
      });
    }
  }

  // Rule 4: Peak Transaction Hour Window in Asia/Jakarta (Requires >= 4 expense transactions)
  if (expenseTxs.length >= 4) {
    const hourBuckets = new Map<string, { count: number; amount: number }>();
    for (const tx of expenseTxs) {
      const { hour } = toJakartaParts(new Date(tx.occurredAt));
      const label =
        hour >= 5 && hour < 11
          ? 'Pagi (05:00–10:59 WIB)'
          : hour >= 11 && hour < 15
            ? 'Siang (11:00–14:59 WIB)'
            : hour >= 15 && hour < 19
              ? 'Sore (15:00–18:59 WIB)'
              : 'Malam (19:00–04:59 WIB)';
      const b = hourBuckets.get(label) ?? { count: 0, amount: 0 };
      b.count += 1;
      b.amount += tx.amount;
      hourBuckets.set(label, b);
    }
    const topBucket = Array.from(hourBuckets.entries()).sort((a, b) => b[1].count - a[1].count)[0];
    if (topBucket) {
      insights.push({
        id: 'insight_peak_hour_jakarta',
        severity: 'info',
        title: `Waktu Transaksi Terpadat: ${topBucket[0]}`,
        text: `${topBucket[1].count} dari ${expenseTxs.length} transaksi pengeluaran terjadi pada rentang waktu ${topBucket[0]} dengan nilai ${formatIDR(topBucket[1].amount)}.`,
        evidence: {
          metric: 'Frekuensi Jam Transaksi (Asia/Jakarta)',
          value: `${topBucket[1].count} transaksi`,
          comparison: `Total nominal pada rentang ini: ${formatIDR(topBucket[1].amount)}`,
          formula: `Pengelompokan jam occurred_at AT TIME ZONE 'Asia/Jakarta' → ${topBucket[1].count}/${expenseTxs.length} transaksi`,
        },
        minDataRequired: 'Minimal 4 transaksi pengeluaran tercatat',
      });
    }
  }

  return insights;
}

export interface CsvImportPreviewRow {
  rowNumber: number;
  rawDate: string;
  rawType: string;
  rawAmount: string;
  rawCategory: string;
  rawAccount: string;
  rawDescription: string;
  parsedAmount: number | null;
  occurredAtIso: string | null;
  type: 'income' | 'expense' | 'transfer' | null;
  categoryId: string | null;
  accountId: string | null;
  isDuplicate: boolean;
  errors: string[];
}

export function parseTransactionsCsv(
  csvText: string,
  existingTransactions: TransactionRecord[],
  categories: CategoryRecord[],
  accounts: AccountRecord[]
): { rows: CsvImportPreviewRow[]; validCount: number; errorCount: number; duplicateCount: number } {
  const lines = csvText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return { rows: [], validCount: 0, errorCount: 0, duplicateCount: 0 };
  }

  const defaultAccount = accounts[0]?.id ?? null;
  const rows: CsvImportPreviewRow[] = [];
  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  // Expected header: tanggal,tipe,nominal,kategori,akun,deskripsi
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const [rawDate = '', rawType = '', rawAmount = '', rawCategory = '', rawAccount = '', rawDescription = ''] = cols;
    const errors: string[] = [];

    const parsedDate = new Date(rawDate);
    const occurredAtIso = Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString();
    if (!occurredAtIso) {
      errors.push('Tanggal tidak valid (gunakan YYYY-MM-DD atau ISO)');
    }

    const normType = rawType.toLowerCase();
    let type: 'income' | 'expense' | 'transfer' | null = null;
    if (normType === 'income' || normType === 'pemasukan') type = 'income';
    else if (normType === 'expense' || normType === 'pengeluaran') type = 'expense';
    else if (normType === 'transfer') type = 'transfer';
    else errors.push('Tipe harus income/pemasukan atau expense/pengeluaran');

    const cleanDigits = rawAmount.replace(/[^0-9\-]/g, '');
    const numericAmount = cleanDigits ? Number.parseInt(cleanDigits, 10) : Number.NaN;
    const parsedAmount = Number.isInteger(numericAmount) && numericAmount > 0 ? numericAmount : null;
    if (!parsedAmount) {
      errors.push('Nominal harus bilangan bulat positif (> 0)');
    }

    const matchedCat =
      categories.find((c) => c.name.toLowerCase() === rawCategory.toLowerCase()) ??
      categories.find((c) => c.kind === (type === 'income' ? 'income' : 'expense')) ??
      null;
    if (!matchedCat) {
      errors.push(`Kategori "${rawCategory}" tidak ditemukan`);
    }

    const matchedAcc =
      accounts.find((a) => a.name.toLowerCase() === rawAccount.toLowerCase())?.id ?? defaultAccount;
    if (!matchedAcc) {
      errors.push('Akun tidak ditemukan');
    }

    const isDuplicate =
      parsedAmount !== null &&
      occurredAtIso !== null &&
      existingTransactions.some(
        (tx) =>
          tx.amount === parsedAmount &&
          formatJakartaDateKey(new Date(tx.occurredAt)) === formatJakartaDateKey(new Date(occurredAtIso)) &&
          tx.description.toLowerCase() === rawDescription.toLowerCase()
      );

    if (isDuplicate) duplicateCount += 1;
    if (errors.length > 0) errorCount += 1;
    else if (!isDuplicate) validCount += 1;

    rows.push({
      rowNumber: i + 1,
      rawDate,
      rawType,
      rawAmount,
      rawCategory,
      rawAccount,
      rawDescription,
      parsedAmount,
      occurredAtIso,
      type,
      categoryId: matchedCat?.id ?? null,
      accountId: matchedAcc,
      isDuplicate,
      errors,
    });
  }

  return { rows, validCount, errorCount, duplicateCount };
}

export function exportTransactionsCsv(
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
  accounts: AccountRecord[]
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const header = 'tanggal,tipe,nominal,kategori,akun,merchant,metode_pembayaran,deskripsi,catatan';
  const lines = transactions.map((tx) => {
    const escapeCsv = (val: string) => `"${(val ?? '').replace(/"/g, '""')}"`;
    return [
      escapeCsv(tx.occurredAt),
      escapeCsv(tx.type),
      String(tx.amount),
      escapeCsv(catMap.get(tx.categoryId) ?? '-'),
      escapeCsv(accMap.get(tx.accountId) ?? '-'),
      escapeCsv(tx.merchant),
      escapeCsv(tx.paymentMethod),
      escapeCsv(tx.description),
      escapeCsv(tx.notes),
    ].join(',');
  });
  return [header, ...lines].join('\n');
}

export interface CombinedFinanceNutritionSummary {
  averageDailyFoodCost: number;
  averageDailyFoodFormula: string;
  totalMakanUtamaMonth: number;
  totalJajanMonth: number;
  mealTimeCostBreakdown: {
    sarapan: number;
    makanSiang: number;
    makanMalam: number;
    jajanMinuman: number;
  };
  costPerGramProtein: number | null;
  costPerGramProteinSampleCount: number;
  costPerGramProteinFormula: string;
  topFoods: { name: string; count: number; avgCalories: number }[];
}

/**
 * Combined Finance × Nutrition Analytics (Section 7.3).
 * Calculates cost per gram of protein strictly from food logs that are linked to a real transaction
 * and have verified protein > 0g.
 */
export function computeCombinedFinanceNutritionMetrics(
  transactions: TransactionRecord[],
  foodLogs: FoodLogRecord[],
  window: PeriodWindow
): CombinedFinanceNutritionSummary {
  const txMap = new Map(transactions.map((t) => [t.id, t]));
  const periodTxs = transactions.filter(
    (t) => t.type === 'expense' && isWithinRange(t.occurredAt, window.start, window.end)
  );

  let totalMakanUtamaMonth = 0;
  let totalJajanMonth = 0;
  let sarapan = 0;
  let makanSiang = 0;
  let makanMalam = 0;
  let jajanMinuman = 0;

  for (const tx of periodTxs) {
    if (MAKAN_UTAMA_CATEGORY_IDS.has(tx.categoryId)) {
      totalMakanUtamaMonth += tx.amount;
      if (tx.categoryId === 'cat_exp_sarapan') sarapan += tx.amount;
      else if (tx.categoryId === 'cat_exp_makan_siang') makanSiang += tx.amount;
      else if (tx.categoryId === 'cat_exp_makan_malam') makanMalam += tx.amount;
    } else if (JAJAN_CATEGORY_IDS.has(tx.categoryId)) {
      totalJajanMonth += tx.amount;
      jajanMinuman += tx.amount;
    }
  }

  const totalFoodAndJajan = totalMakanUtamaMonth + totalJajanMonth;
  const averageDailyFoodCost = Math.round(totalFoodAndJajan / Math.max(1, window.totalDays));
  const averageDailyFoodFormula = `(${formatIDR(totalMakanUtamaMonth)} makan utama + ${formatIDR(totalJajanMonth)} jajan) ÷ ${window.totalDays} hari = ${formatIDR(averageDailyFoodCost)}/hari`;

  // Cost per gram of protein from linked transactions with protein > 0
  let linkedCostSum = 0;
  let linkedProteinSum = 0;
  let sampleCount = 0;

  for (const log of foodLogs) {
    if (!log.userConfirmed || !log.transactionId) continue;
    const linkedTx = txMap.get(log.transactionId);
    if (!linkedTx || linkedTx.type !== 'expense') continue;
    if (log.totalProteinG > 0) {
      linkedCostSum += linkedTx.amount;
      linkedProteinSum += log.totalProteinG;
      sampleCount += 1;
    }
  }

  const costPerGramProtein =
    sampleCount > 0 && linkedProteinSum > 0 ? Math.round(linkedCostSum / linkedProteinSum) : null;
  const costPerGramProteinFormula =
    costPerGramProtein !== null
      ? `${formatIDR(linkedCostSum)} total transaksi tertaut ÷ ${linkedProteinSum.toFixed(1)}g estimasi protein (${sampleCount} sampel makanan tertaut) = ${formatIDR(costPerGramProtein)}/g protein`
      : 'Belum ada jurnal makanan berprotein yang ditautkan ke transaksi pengeluaran';

  const foodCounter = new Map<string, { count: number; caloriesSum: number }>();
  for (const log of foodLogs) {
    if (!log.userConfirmed) continue;
    const curr = foodCounter.get(log.title) ?? { count: 0, caloriesSum: 0 };
    curr.count += 1;
    curr.caloriesSum += log.totalCalories;
    foodCounter.set(log.title, curr);
  }

  const topFoods = Array.from(foodCounter.entries())
    .map(([name, s]) => ({
      name,
      count: s.count,
      avgCalories: Math.round(s.caloriesSum / s.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    averageDailyFoodCost,
    averageDailyFoodFormula,
    totalMakanUtamaMonth,
    totalJajanMonth,
    mealTimeCostBreakdown: {
      sarapan,
      makanSiang,
      makanMalam,
      jajanMinuman,
    },
    costPerGramProtein,
    costPerGramProteinSampleCount: sampleCount,
    costPerGramProteinFormula,
    topFoods,
  };
}
