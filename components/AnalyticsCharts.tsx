'use client';

import React from 'react';
import { formatIDR, type CategoryDistributionItem, type DailySeriesPoint } from '@/lib/finance';
import { BarChart3, PieChart, FilterX } from 'lucide-react';

interface DailyCashFlowChartProps {
  series: DailySeriesPoint[];
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string | null) => void;
}

export function DailyCashFlowChart({
  series,
  selectedDateKey,
  onSelectDate,
}: DailyCashFlowChartProps) {
  const hasAnyData = series.some((pt) => pt.income > 0 || pt.expense > 0);
  const maxVal = Math.max(1, ...series.map((pt) => Math.max(pt.income, pt.expense)));

  // Condense to last 31 points max for crisp visual legibility while keeping full series summary
  const visibleSeries = series.length > 31 ? series.slice(series.length - 31) : series;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Arus Kas Harian (Asia/Jakarta)
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Klik batang tanggal untuk memfilter transaksi pada tanggal tersebut (drill-down)
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
            <span>Pemasukan (+)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block" />
            <span>Pengeluaran (−)</span>
          </span>
          {selectedDateKey && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Reset ({selectedDateKey})</span>
            </button>
          )}
        </div>
      </div>

      {!hasAnyData ? (
        <div className="h-48 flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center p-6">
          <BarChart3 className="w-7 h-7 text-neutral-400 mb-2" />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Belum ada arus kas pada periode ini
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Grafik akan terhitung otomatis dari transaksi nyata yang Anda catat.
          </p>
        </div>
      ) : (
        <div
          role="region"
          aria-label="Grafik interaktif pemasukan dan pengeluaran harian"
          className="pt-2"
        >
          <div className="h-48 flex items-end gap-1.5 overflow-x-auto pb-2">
            {visibleSeries.map((pt) => {
              const incHeight = pt.income > 0 ? Math.max(8, Math.round((pt.income / maxVal) * 140)) : 2;
              const expHeight = pt.expense > 0 ? Math.max(8, Math.round((pt.expense / maxVal) * 140)) : 2;
              const isSelected = selectedDateKey === pt.dateKey;
              const shortLabel = pt.dateKey.slice(5); // MM-DD

              return (
                <button
                  key={pt.dateKey}
                  type="button"
                  onClick={() => onSelectDate(isSelected ? null : pt.dateKey)}
                  aria-label={`Tanggal ${pt.dateKey}: Pemasukan ${formatIDR(pt.income)}, Pengeluaran ${formatIDR(pt.expense)}`}
                  aria-pressed={isSelected}
                  className={`group flex-1 min-w-[28px] flex flex-col items-center justify-end rounded-lg p-1 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isSelected
                      ? 'bg-emerald-500/15 ring-1 ring-emerald-500'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/70'
                  }`}
                >
                  <div className="w-full flex items-end justify-center gap-0.5 h-[144px]">
                    <div
                      style={{ height: `${incHeight}px` }}
                      className={`w-2 rounded-t-xs transition-opacity ${
                        pt.income > 0
                          ? 'bg-emerald-500 group-hover:opacity-90'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                    <div
                      style={{ height: `${expHeight}px` }}
                      className={`w-2 rounded-t-xs transition-opacity ${
                        pt.expense > 0
                          ? 'bg-rose-500 group-hover:opacity-90'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                  </div>
                  <span className="mt-1.5 text-[10px] font-mono tabular-nums text-neutral-500 dark:text-neutral-400">
                    {shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface CategoryDistributionChartProps {
  items: CategoryDistributionItem[];
  totalExpense: number;
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

export function CategoryDistributionChart({
  items,
  totalExpense,
  selectedCategoryId,
  onSelectCategory,
}: CategoryDistributionChartProps) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Distribusi Pengeluaran per Kategori
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Klik baris kategori untuk menampilkan daftar transaksinya (Makan & Jajan terpisah)
          </p>
        </div>
        {selectedCategoryId && (
          <button
            type="button"
            onClick={() => onSelectCategory(null)}
            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium hover:underline whitespace-nowrap shrink-0"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Reset Kategori</span>
          </button>
        )}
      </div>

      {items.length === 0 || totalExpense === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 text-center p-6">
          <PieChart className="w-7 h-7 text-neutral-400 mb-2" />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Belum ada pengeluaran pada periode ini
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Distribusi kategori dihitung dari transaksi pengeluaran aktual.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((item) => {
            const isSelected = selectedCategoryId === item.categoryId;
            return (
              <button
                key={item.categoryId}
                type="button"
                onClick={() => onSelectCategory(isSelected ? null : item.categoryId)}
                aria-pressed={isSelected}
                className={`w-full text-left rounded-xl p-2.5 transition-colors border ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/60'
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                      {item.categoryName}
                    </span>
                    <span className="text-neutral-400" aria-hidden="true">·</span>
                    <span className="text-neutral-500 dark:text-neutral-400 truncate">
                      {item.groupName}
                    </span>
                    <span className="text-neutral-400" aria-hidden="true">·</span>
                    <span className="text-neutral-500 dark:text-neutral-400 font-mono tabular-nums">
                      {item.transactionCount}x
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      {formatIDR(item.amount)}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400 w-12 text-right">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    style={{ width: `${Math.max(3, Math.min(100, item.percentage))}%` }}
                    className={`h-full rounded-full ${
                      item.groupName.includes('Jajan')
                        ? 'bg-amber-500'
                        : item.groupName.includes('Makanan')
                          ? 'bg-emerald-500'
                          : 'bg-sky-500'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
