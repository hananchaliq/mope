'use client';

import React, { useState } from 'react';
import {
  type AccountInput,
  type AccountRecord,
  type BudgetInput,
  type CategoryInput,
  type CategoryRecord,
  type TransactionRecord,
  AccountInputSchema,
  BudgetInputSchema,
  CategoryInputSchema,
} from '@/lib/schemas';
import {
  type ComputedAccountBalance,
  type EvaluatedBudget,
  formatIDR,
} from '@/lib/finance';
import {
  Wallet,
  Target,
  Tags,
  Plus,
  Trash2,
  AlertTriangle,
  Calculator,
} from 'lucide-react';

interface BudgetsAccountsCategoriesViewProps {
  accounts: AccountRecord[];
  accountBalances: ComputedAccountBalance[];
  categories: CategoryRecord[];
  transactions: TransactionRecord[];
  evaluatedBudgets: EvaluatedBudget[];
  onCreateAccount: (input: AccountInput) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onCreateBudget: (input: BudgetInput) => Promise<void>;
  onDeleteBudget: (budgetId: string) => Promise<void>;
  onCreateCategory: (input: CategoryInput) => Promise<void>;
  onDeleteCategoryWithReassign: (categoryId: string, reassignToCategoryId: string) => Promise<void>;
}

export function BudgetsAccountsCategoriesView({
  accounts,
  accountBalances,
  categories,
  transactions,
  evaluatedBudgets,
  onCreateAccount,
  onDeleteAccount,
  onCreateBudget,
  onDeleteBudget,
  onCreateCategory,
  onDeleteCategoryWithReassign,
}: BudgetsAccountsCategoriesViewProps) {
  const [subTab, setSubTab] = useState<'budgets' | 'accounts' | 'categories'>('budgets');

  // Budget form state
  const [budgetName, setBudgetName] = useState('');
  const [budgetScope, setBudgetScope] = useState<'total' | 'category'>('total');
  const [budgetCategoryId, setBudgetCategoryId] = useState(
    categories.find((c) => c.kind === 'expense')?.id ?? ''
  );
  const [budgetPeriod, setBudgetPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [budgetLimitStr, setBudgetLimitStr] = useState('');
  const [budgetThresholdsStr, setBudgetThresholdsStr] = useState('50,80,100');
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [openProjectionId, setOpenProjectionId] = useState<string | null>(null);

  // Account form state
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<'cash' | 'bank' | 'ewallet' | 'other'>('bank');
  const [accOpeningStr, setAccOpeningStr] = useState('0');
  const [accError, setAccError] = useState<string | null>(null);

  // Category form & safe delete reassignment state
  const [catName, setCatName] = useState('');
  const [catKind, setCatKind] = useState<'expense' | 'income'>('expense');
  const [catGroup, setCatGroup] = useState('Makanan');
  const [catError, setCatError] = useState<string | null>(null);
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  const expenseCategories = categories.filter((c) => c.kind === 'expense');

  const handleAddBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setBudgetError(null);
    const limitAmount = Number.parseInt(budgetLimitStr.replace(/[^0-9]/g, ''), 10) || 0;
    const thresholds = budgetThresholdsStr
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 200);

    const parsed = BudgetInputSchema.safeParse({
      name: budgetName,
      scope: budgetScope,
      categoryId: budgetScope === 'category' ? budgetCategoryId : '',
      period: budgetPeriod,
      limitAmount,
      alertThresholds: thresholds.length > 0 ? thresholds : [50, 80, 100],
    });

    if (!parsed.success) {
      setBudgetError(parsed.error.issues[0]?.message ?? 'Input anggaran tidak valid.');
      return;
    }

    await onCreateBudget(parsed.data);
    setBudgetName('');
    setBudgetLimitStr('');
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccError(null);
    const openingBalance = Number.parseInt(accOpeningStr.replace(/[^0-9\-]/g, ''), 10) || 0;
    const parsed = AccountInputSchema.safeParse({
      name: accName,
      type: accType,
      openingBalance,
      currency: 'IDR',
      isArchived: false,
    });
    if (!parsed.success) {
      setAccError(parsed.error.issues[0]?.message ?? 'Input akun tidak valid.');
      return;
    }
    await onCreateAccount(parsed.data);
    setAccName('');
    setAccOpeningStr('0');
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCatError(null);
    const exists = categories.some(
      (c) => c.kind === catKind && c.name.toLowerCase() === catName.trim().toLowerCase()
    );
    if (exists) {
      setCatError(`Kategori "${catName}" sudah ada pada kelompok ${catKind}.`);
      return;
    }

    const parsed = CategoryInputSchema.safeParse({
      name: catName,
      kind: catKind,
      groupName: catKind === 'income' ? 'Pemasukan' : catGroup,
      icon: 'Tag',
      color: catGroup.includes('Jajan') ? 'amber' : 'emerald',
      isSystem: false,
      sortOrder: categories.length + 1,
    });

    if (!parsed.success) {
      setCatError(parsed.error.issues[0]?.message ?? 'Nama kategori tidak valid.');
      return;
    }

    await onCreateCategory(parsed.data);
    setCatName('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Anggaran, Multi-Akun & Kategori
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Proyeksi anggaran linear, saldo akun dinamis dari transaksi, serta pemisahan kategori Makan Utama vs Jajan
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 p-1">
          {(
            [
              { id: 'budgets', label: `Anggaran (${evaluatedBudgets.length})`, icon: Target },
              { id: 'accounts', label: `Akun (${accounts.length})`, icon: Wallet },
              { id: 'categories', label: `Kategori (${categories.length})`, icon: Tags },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  subTab === tab.id
                    ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'budgets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Create Budget Form */}
          <form
            onSubmit={handleAddBudget}
            className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Buat Anggaran Baru
            </h3>

            <div>
              <label
                htmlFor="budget-name-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Nama Anggaran
              </label>
              <input
                id="budget-name-input"
                type="text"
                value={budgetName}
                onChange={(e) => setBudgetName(e.target.value)}
                placeholder="Misal: Batas Jajan & Kopi Bulanan"
                className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Cakupan
                </label>
                <select
                  value={budgetScope}
                  onChange={(e) => setBudgetScope(e.target.value as 'total' | 'category')}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="total">Total Semua Pengeluaran</option>
                  <option value="category">Per Kategori Spesifik</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Periode
                </label>
                <select
                  value={budgetPeriod}
                  onChange={(e) => setBudgetPeriod(e.target.value as 'monthly' | 'weekly')}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="monthly">Bulanan</option>
                  <option value="weekly">Mingguan (Senin–Minggu)</option>
                </select>
              </div>
            </div>

            {budgetScope === 'category' && (
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Pilih Kategori
                </label>
                <select
                  value={budgetCategoryId}
                  onChange={(e) => setBudgetCategoryId(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.groupName})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="budget-limit-input"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Batas Nominal (IDR)
                </label>
                <input
                  id="budget-limit-input"
                  type="text"
                  inputMode="numeric"
                  value={budgetLimitStr}
                  onChange={(e) => setBudgetLimitStr(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="Contoh: 1500000"
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono tabular-nums text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label
                  htmlFor="budget-thresholds-input"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Threshold Alert (%)
                </label>
                <input
                  id="budget-thresholds-input"
                  type="text"
                  value={budgetThresholdsStr}
                  onChange={(e) => setBudgetThresholdsStr(e.target.value)}
                  placeholder="50,80,100"
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            {budgetError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{budgetError}</p>
            )}

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Simpan Anggaran</span>
            </button>
          </form>

          {/* Evaluated Budgets List */}
          <div className="lg:col-span-7 space-y-3">
            {evaluatedBudgets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center space-y-2">
                <Target className="w-8 h-8 text-neutral-400 mx-auto" />
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Belum Ada Anggaran Aktif
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Tetapkan anggaran bulanan atau mingguan untuk memantau persentase pemakaian dan proyeksi akhir periode.
                </p>
              </div>
            ) : (
              evaluatedBudgets.map((eb) => (
                <div
                  key={eb.budget.id}
                  className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{eb.categoryName}</span>
                        <span>·</span>
                        <span>{eb.budget.period === 'monthly' ? 'Bulanan' : 'Mingguan'}</span>
                        <span>·</span>
                        <span>
                          Status:{' '}
                          <strong
                            className={
                              eb.status === 'exceeded'
                                ? 'text-rose-600'
                                : eb.status === 'danger'
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }
                          >
                            {eb.status === 'exceeded'
                              ? 'Melewati Batas (>100%)'
                              : `${eb.percentUsed}% Terpakai`}
                          </strong>
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
                        {eb.budget.name}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteBudget(eb.budget.id)}
                      aria-label={`Hapus anggaran ${eb.budget.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(2, eb.percentUsed))}%` }}
                      className={`h-full rounded-full ${
                        eb.status === 'exceeded'
                          ? 'bg-rose-600'
                          : eb.status === 'danger'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-mono tabular-nums pt-1">
                    <div>
                      <span className="text-neutral-500 block">Terpakai</span>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatIDR(eb.usedAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Batas Limit</span>
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {formatIDR(eb.budget.limitAmount)}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Sisa</span>
                      <span
                        className={`font-semibold ${
                          eb.remainingAmount < 0 ? 'text-rose-600' : 'text-emerald-600'
                        }`}
                      >
                        {formatIDR(eb.remainingAmount)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-neutral-600 dark:text-neutral-400 font-mono tabular-nums">
                      Proyeksi Akhir Periode: <strong>{formatIDR(eb.projectedAmount)}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenProjectionId(openProjectionId === eb.budget.id ? null : eb.budget.id)
                      }
                      className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      <Calculator className="w-3.5 h-3.5" />
                      <span>Lihat rumus proyeksi</span>
                    </button>
                  </div>

                  {openProjectionId === eb.budget.id && (
                    <p className="text-xs font-mono bg-neutral-100 dark:bg-neutral-950 p-2.5 rounded-lg text-neutral-700 dark:text-neutral-300">
                      Rumus: {eb.projectionFormula}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'accounts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleAddAccount}
            className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Tambah Akun Keuangan
            </h3>
            <div>
              <label
                htmlFor="acc-name-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Nama Akun
              </label>
              <input
                id="acc-name-input"
                type="text"
                value={accName}
                onChange={(e) => setAccName(e.target.value)}
                placeholder="Misal: BCA Utama, GoPay, Dompet Tunai"
                className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Tipe Akun
                </label>
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as typeof accType)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="bank">Bank</option>
                  <option value="ewallet">E-Wallet</option>
                  <option value="cash">Tunai (Cash)</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="acc-opening-input"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Saldo Awal (IDR)
                </label>
                <input
                  id="acc-opening-input"
                  type="text"
                  inputMode="numeric"
                  value={accOpeningStr}
                  onChange={(e) => setAccOpeningStr(e.target.value.replace(/[^0-9\-]/g, ''))}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono tabular-nums text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            {accError && <p className="text-xs text-rose-600">{accError}</p>}

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Akun</span>
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {accountBalances.map((item) => (
              <div
                key={item.account.id}
                className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-neutral-500">
                    <span className="uppercase font-mono">{item.account.type}</span>
                    <span>·</span>
                    <span>Saldo Awal: {formatIDR(item.account.openingBalance)}</span>
                  </div>
                  <h4 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                    {item.account.name}
                  </h4>
                  <p className="text-xs text-neutral-500 font-mono tabular-nums">
                    +Masuk {formatIDR(item.incomeTotal)} · −Keluar {formatIDR(item.expenseTotal)} · Transfer Bersih{' '}
                    {formatIDR(item.transferInTotal - item.transferOutTotal)}
                  </p>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-xs text-neutral-500 block">Saldo Saat Ini</span>
                    <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {formatIDR(item.currentBalance)}
                    </span>
                  </div>
                  {accounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteAccount(item.account.id)}
                      aria-label={`Hapus akun ${item.account.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleAddCategory}
            className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Tambah Kategori Baru
            </h3>
            <p className="text-xs text-neutral-500">
              Kategori <strong>Makanan Utama</strong> dan <strong>Jajan & Minuman</strong> dipisahkan secara eksplisit.
            </p>

            <div>
              <label
                htmlFor="cat-name-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Nama Kategori
              </label>
              <input
                id="cat-name-input"
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Misal: Katering Sehat, Parkir, Bonus"
                className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Jenis
                </label>
                <select
                  value={catKind}
                  onChange={(e) => setCatKind(e.target.value as 'expense' | 'income')}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="expense">Pengeluaran</option>
                  <option value="income">Pemasukan</option>
                </select>
              </div>

              {catKind === 'expense' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                    Kelompok
                  </label>
                  <select
                    value={catGroup}
                    onChange={(e) => setCatGroup(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    <option value="Makanan">Makanan (Utama)</option>
                    <option value="Jajan & Minuman">Jajan & Minuman</option>
                    <option value="Kebutuhan">Kebutuhan</option>
                    <option value="Hiburan">Hiburan</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
              )}
            </div>

            {catError && <p className="text-xs text-rose-600">{catError}</p>}

            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kategori</span>
            </button>
          </form>

          <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Daftar Kategori Aktif ({categories.length})
            </h3>

            {deletingCatId && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-3 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Pilih Kategori Pengganti Sebelum Menghapus</span>
                </div>
                <p className="text-neutral-600 dark:text-neutral-300">
                  Agar tidak ada data transaksi yang terputus, seluruh transaksi pada kategori ini akan dipindahkan ke kategori pengganti berikut:
                </p>
                <div className="flex gap-2">
                  <select
                    value={reassignTargetId}
                    onChange={(e) => setReassignTargetId(e.target.value)}
                    className="flex-1 min-h-[38px] rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 text-xs"
                  >
                    {categories
                      .filter((c) => c.id !== deletingCatId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.groupName})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!reassignTargetId) return;
                      await onDeleteCategoryWithReassign(deletingCatId, reassignTargetId);
                      setDeletingCatId(null);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 text-white font-semibold"
                  >
                    Pindahkan & Hapus
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingCatId(null)}
                    className="px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
              {categories.map((cat) => {
                const txCount = transactions.filter((t) => t.categoryId === cat.id).length;
                return (
                  <div
                    key={cat.id}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                        {cat.name}
                      </p>
                      <p className="text-neutral-500 truncate">
                        {cat.groupName} · {cat.kind === 'income' ? 'Pemasukan' : 'Pengeluaran'} · {txCount} tx
                      </p>
                    </div>
                    {categories.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const fallback = categories.find((c) => c.id !== cat.id && c.kind === cat.kind)?.id ?? '';
                          setReassignTargetId(fallback);
                          setDeletingCatId(cat.id);
                        }}
                        aria-label={`Hapus kategori ${cat.name}`}
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
