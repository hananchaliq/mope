'use client';

import React, { useMemo, useState } from 'react';
import {
  type AccountRecord,
  type CategoryRecord,
  type FoodLogRecord,
  type TransactionInput,
  type TransactionRecord,
  TransactionInputSchema,
} from '@/lib/schemas';
import { formatIDR } from '@/lib/finance';
import { toJakartaParts } from '@/lib/periods';
import { X, Check, Delete, Zap } from 'lucide-react';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  recentTransactions: TransactionRecord[];
  foodLogs: FoodLogRecord[];
  onSubmitTransaction: (input: TransactionInput) => Promise<void>;
  initialValues?: Partial<TransactionInput>;
}

const QUICK_NOMINAL_PRESETS = [15_000, 25_000, 50_000, 100_000];

export function QuickAddModal({
  isOpen,
  onClose,
  accounts,
  categories,
  recentTransactions,
  foodLogs,
  onSubmitTransaction,
  initialValues,
}: QuickAddModalProps) {
  const activeAccounts = useMemo(() => accounts.filter((a) => !a.isArchived), [accounts]);
  const defaultAccountId = initialValues?.accountId || activeAccounts[0]?.id || '';

  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(
    initialValues?.type ?? 'expense'
  );
  const [amountStr, setAmountStr] = useState<string>(
    initialValues?.amount ? String(initialValues.amount) : ''
  );
  const [accountId, setAccountId] = useState<string>(defaultAccountId);
  const [toAccountId, setToAccountId] = useState<string>(
    initialValues?.toAccountId || activeAccounts[1]?.id || ''
  );

  // Suggest categories intelligently based on Jakarta hour + historical frequency
  const suggestedCategories = useMemo(() => {
    const filtered = categories.filter((c) => c.kind === (type === 'income' ? 'income' : 'expense'));
    const { hour } = toJakartaParts(new Date());
    const freqMap = new Map<string, number>();
    for (const tx of recentTransactions) {
      if (tx.categoryId) {
        freqMap.set(tx.categoryId, (freqMap.get(tx.categoryId) ?? 0) + 1);
      }
    }

    return [...filtered].sort((a, b) => {
      // Time-of-day boost in Asia/Jakarta for meals
      let boostA = freqMap.get(a.id) ?? 0;
      let boostB = freqMap.get(b.id) ?? 0;
      if (type === 'expense') {
        if (hour >= 5 && hour <= 10 && a.id === 'cat_exp_sarapan') boostA += 5;
        if (hour >= 5 && hour <= 10 && b.id === 'cat_exp_sarapan') boostB += 5;
        if (hour >= 11 && hour <= 14 && a.id === 'cat_exp_makan_siang') boostA += 5;
        if (hour >= 11 && hour <= 14 && b.id === 'cat_exp_makan_siang') boostB += 5;
        if (hour >= 15 && hour <= 17 && a.id === 'cat_exp_jajan') boostA += 4;
        if (hour >= 15 && hour <= 17 && b.id === 'cat_exp_jajan') boostB += 4;
        if (hour >= 18 && hour <= 22 && a.id === 'cat_exp_makan_malam') boostA += 5;
        if (hour >= 18 && hour <= 22 && b.id === 'cat_exp_makan_malam') boostB += 5;
      }
      if (boostB !== boostA) return boostB - boostA;
      return a.sortOrder - b.sortOrder;
    });
  }, [categories, recentTransactions, type]);

  const [categoryId, setCategoryId] = useState<string>(
    initialValues?.categoryId || suggestedCategories[0]?.id || ''
  );
  const [description, setDescription] = useState<string>(initialValues?.description ?? '');
  const [merchant, setMerchant] = useState<string>(initialValues?.merchant ?? '');
  const [paymentMethod, setPaymentMethod] = useState<string>(
    initialValues?.paymentMethod ?? 'QRIS'
  );
  const [occurredAt, setOccurredAt] = useState<string>(() =>
    initialValues?.occurredAt
      ? initialValues.occurredAt.slice(0, 16)
      : new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16)
  );

  const [notes, setNotes] = useState<string>(initialValues?.notes ?? '');
  const [linkedFoodLogId, setLinkedFoodLogId] = useState<string>(
    initialValues?.linkedFoodLogId ?? ''
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const numericAmount = Number.parseInt(amountStr.replace(/[^0-9]/g, ''), 10) || 0;
  const effectiveCategoryId =
    suggestedCategories.some((c) => c.id === categoryId)
      ? categoryId
      : (suggestedCategories[0]?.id ?? '');
  const effectiveAccountId = accountId || activeAccounts[0]?.id || '';

  const appendDigit = (digits: string) => {
    setErrorMsg(null);
    setAmountStr((prev) => {
      const next = (prev + digits).replace(/^0+/, '');
      return next.length <= 12 ? next : prev;
    });
  };

  const handleBackspace = () => {
    setAmountStr((prev) => prev.slice(0, -1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Convert Jakarta local datetime input `YYYY-MM-DDTHH:mm` to UTC ISO string
    const occurredDate = occurredAt.includes('T')
      ? new Date(`${occurredAt}:00+07:00`)
      : new Date(occurredAt);
    const occurredIso = Number.isNaN(occurredDate.getTime())
      ? new Date().toISOString()
      : occurredDate.toISOString();

    const candidate: TransactionInput = {
      id: initialValues?.id,
      type,
      amount: numericAmount,
      accountId: effectiveAccountId,
      toAccountId: type === 'transfer' ? toAccountId : '',
      categoryId: type === 'transfer' ? '' : effectiveCategoryId,
      description:
        description.trim() ||
        (type === 'transfer'
          ? 'Transfer antar akun'
          : (suggestedCategories.find((c) => c.id === effectiveCategoryId)?.name ?? 'Transaksi')),
      merchant: merchant.trim(),
      paymentMethod,
      occurredAt: occurredIso,
      notes: notes.trim(),
      linkedFoodLogId,
    };

    const parsed = TransactionInputSchema.safeParse(candidate);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setErrorMsg(firstIssue?.message ?? 'Data transaksi belum lengkap.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitTransaction(parsed.data);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan transaksi.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-add-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            <h2
              id="quick-add-modal-title"
              className="text-base font-semibold text-neutral-900 dark:text-neutral-100"
            >
              {initialValues?.id ? 'Edit Transaksi' : 'Catat Cepat Transaksi (≤ 5 dtk)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal catat transaksi"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Segmented Type Selector */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-950 p-1">
            {(
              [
                { id: 'expense', label: '− Pengeluaran' },
                { id: 'income', label: '+ Pemasukan' },
                { id: 'transfer', label: '⇄ Transfer' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setType(tab.id);
                  setErrorMsg(null);
                }}
                className={`min-h-[40px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  type === tab.id
                    ? tab.id === 'expense'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : tab.id === 'income'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Nominal Display & Input */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="quick-amount-input"
                className="text-xs font-medium text-neutral-500 dark:text-neutral-400"
              >
                Nominal (Rupiah Bulat)
              </label>
              <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {numericAmount > 0 ? formatIDR(numericAmount) : 'Rp 0'}
              </span>
            </div>
            <input
              id="quick-amount-input"
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => {
                setErrorMsg(null);
                setAmountStr(e.target.value.replace(/[^0-9]/g, ''));
              }}
              placeholder="Contoh: 25000"
              className="mt-1 w-full bg-transparent text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-neutral-100 focus:outline-none"
            />

            {/* Quick Nominal Chips */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {QUICK_NOMINAL_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setErrorMsg(null);
                    setAmountStr(String(preset));
                  }}
                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono tabular-nums text-neutral-700 dark:text-neutral-300 hover:border-emerald-500 transition-colors"
                >
                  {formatIDR(preset)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => appendDigit('000')}
                className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 hover:border-emerald-500"
              >
                +000
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                aria-label="Hapus digit terakhir"
                className="ml-auto px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1"
              >
                <Delete className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>
          </div>

          {/* Smart Suggested Categories (Hidden on Transfer) */}
          {type !== 'transfer' && (
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1.5">
                Kategori (Saran Pintar Jam WIB & Frekuensi)
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-0.5">
                {suggestedCategories.map((cat) => {
                  const selected = effectiveCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border whitespace-nowrap ${
                        selected
                          ? 'border-emerald-500 bg-emerald-600 text-white'
                          : 'border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-neutral-700 dark:text-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Account & ToAccount / Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="quick-account-select"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                {type === 'transfer' ? 'Dari Akun' : 'Akun'}
              </label>
              <select
                id="quick-account-select"
                value={effectiveAccountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
              >
                {activeAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {type === 'transfer' ? (
              <div>
                <label
                  htmlFor="quick-to-account-select"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Ke Akun Tujuan
                </label>
                <select
                  id="quick-to-account-select"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
                >
                  <option value="">-- Pilih Akun Tujuan --</option>
                  {activeAccounts
                    .filter((a) => a.id !== effectiveAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type.toUpperCase()})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="quick-datetime-input"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Waktu (Asia/Jakarta)
                </label>
                <input
                  id="quick-datetime-input"
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="quick-description-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Deskripsi Singkat
              </label>
              <input
                id="quick-description-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Misal: Makan siang nasi ayam"
                className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label
                htmlFor="quick-merchant-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Merchant / Tempat (Opsional)
              </label>
              <input
                id="quick-merchant-input"
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="Misal: Warung Padang Sederhana"
                className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
              />
            </div>
          </div>

          {/* Optional link to Food Log */}
          {type === 'expense' && foodLogs.length > 0 && (
            <div>
              <label
                htmlFor="quick-foodlog-select"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Tautkan ke Jurnal Makanan (Untuk Analisis Biaya per Gram Protein)
              </label>
              <select
                id="quick-foodlog-select"
                value={linkedFoodLogId}
                onChange={(e) => setLinkedFoodLogId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
              >
                <option value="">-- Tidak ditautkan --</option>
                {foodLogs.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.title} · {fl.totalCalories} kkal · {fl.totalProteinG}g protein
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400"
            >
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Transaksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
