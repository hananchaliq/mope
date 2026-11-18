'use client';

import React, { useMemo, useState } from 'react';
import {
  type FoodItemMatch,
  type FoodLogRecord,
  type MealType,
  type TransactionRecord,
} from '@/lib/schemas';
import {
  NUTRITION_DATA_SOURCES,
  VERIFIED_NUTRITION_REFERENCES,
  computeNutrientsForGrams,
  matchFoodComponentToDatabase,
} from '@/lib/nutrition-db';
import {
  computeCombinedFinanceNutritionMetrics,
  formatIDR,
} from '@/lib/finance';
import { formatIndonesianDate, type PeriodWindow } from '@/lib/periods';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Link2,
  Utensils,
  Calculator,
  Info,
  Sparkles,
} from 'lucide-react';

interface NutritionModuleViewProps {
  foodLogs: FoodLogRecord[];
  transactions: TransactionRecord[];
  periodWindow: PeriodWindow;
  geminiConfigured: boolean;
  usdaConfigured: boolean;
  onSaveConfirmedFoodLog: (
    draft: Omit<FoodLogRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    linkedTransactionId?: string
  ) => Promise<void>;
  onDeleteFoodLog: (id: string) => Promise<void>;
}

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Sarapan (Makan Utama)',
  lunch: 'Makan Siang (Makan Utama)',
  dinner: 'Makan Malam (Makan Utama)',
  snack: 'Camilan / Jajan',
  drinks: 'Minuman / Kopi',
};

/**
 * Compresses image on client via HTML5 Canvas (longest side <= 1280px, JPEG 0.82),
 * stripping all EXIF and GPS metadata before upload.
 */
async function compressAndStripExif(file: File): Promise<{ base64: string; mimeType: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1280;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context tidak tersedia.'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve({
        base64: dataUrl,
        mimeType: 'image/jpeg',
        width,
        height,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Gagal membaca file gambar.'));
    };
    img.src = objectUrl;
  });
}

export function NutritionModuleView({
  foodLogs,
  transactions,
  periodWindow,
  geminiConfigured,
  usdaConfigured,
  onSaveConfirmedFoodLog,
  onDeleteFoodLog,
}: NutritionModuleViewProps) {
  const [subTab, setSubTab] = useState<'analyzer' | 'journal' | 'combined'>('analyzer');
  const [mealType, setMealType] = useState<MealType>('lunch');
  const [mealTitle, setMealTitle] = useState<string>('');
  const [eatenAtStr, setEatenAtStr] = useState<string>(() =>
    new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 16)
  );

  const [linkedTxId, setLinkedTxId] = useState<string>('');
  const [userNote, setUserNote] = useState<string>('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'review' | 'error'>('idle');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [detectedModelName, setDetectedModelName] = useState<string>('manual_tkpi_usda');
  const [draftItems, setDraftItems] = useState<FoodItemMatch[]>([]);

  // Manual component selector state
  const [selectedRefId, setSelectedRefId] = useState<string>(VERIFIED_NUTRITION_REFERENCES[0].id);
  const [manualGrams, setManualGrams] = useState<string>('150');
  const [customComponentName, setCustomComponentName] = useState<string>('');
  const [showFormulaCard, setShowFormulaCard] = useState<string | null>(null);

  const expenseTransactions = useMemo(
    () => transactions.filter((t) => t.type === 'expense').slice(0, 30),
    [transactions]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalysisError(null);

    if (file.size > 10 * 1024 * 1024) {
      setAnalysisStatus('error');
      setAnalysisError('Ukuran foto asli terlalu besar (> 10 MB). Pilih foto maksimal 10 MB.');
      return;
    }

    try {
      const compressed = await compressAndStripExif(file);
      setPreviewDataUrl(compressed.base64);
      setImageDimensions({ width: compressed.width, height: compressed.height });
    } catch (err) {
      setAnalysisStatus('error');
      setAnalysisError(err instanceof Error ? err.message : 'Gagal memproses gambar.');
    }
  };

  const handleAnalyzePhotoWithGemini = async () => {
    if (!previewDataUrl) {
      setAnalysisStatus('error');
      setAnalysisError('Pilih atau ambil foto makanan terlebih dahulu.');
      return;
    }

    setAnalysisStatus('analyzing');
    setAnalysisError(null);

    try {
      const res = await fetch('/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: previewDataUrl,
          mimeType: 'image/jpeg',
          userNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAnalysisStatus('error');
        setAnalysisError(
          data.error || 'Analisis foto gagal. Anda tetap dapat memilih komponen makanan dari database TKPI/USDA di bawah.'
        );
        return;
      }

      setDetectedModelName(data.modelName || 'gemini-4-hydrogen');
      if (data.mealTitleSuggestion && !mealTitle) {
        setMealTitle(data.mealTitleSuggestion);
      }
      setDraftItems(data.items ?? []);
      setAnalysisStatus('review');
    } catch (err) {
      setAnalysisStatus('error');
      setAnalysisError(
        err instanceof Error
          ? err.message
          : 'Koneksi ke server analisis terputus. Silakan coba lagi atau gunakan input manual.'
      );
    }
  };

  const handleAddVerifiedReferenceItem = () => {
    const ref = VERIFIED_NUTRITION_REFERENCES.find((r) => r.id === selectedRefId);
    if (!ref) return;
    const grams = Math.max(1, Math.min(3000, Number.parseInt(manualGrams, 10) || ref.defaultServingGrams));
    const nutrients = computeNutrientsForGrams(ref, grams);

    const newItem: FoodItemMatch = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nameDetected: ref.nameId,
      nameConfirmed: ref.nameId,
      cookingMethod: ref.cookingMethod,
      quantityGrams: grams,
      servingUnit: 'gram',
      sourceCode: ref.sourceCode,
      sourceName: ref.sourceName,
      sourceMatchId: ref.id,
      matchStatus: previewDataUrl ? 'estimated_portion' : 'verified_match',
      confidence: 0.98,
      ...nutrients,
    };

    setDraftItems((prev) => [...prev, newItem]);
    if (!mealTitle) {
      setMealTitle(ref.nameId);
    }
    setAnalysisStatus('review');
  };

  const handleSearchCustomComponent = () => {
    if (!customComponentName.trim()) return;
    const grams = Math.max(1, Math.min(3000, Number.parseInt(manualGrams, 10) || 100));
    const matched = matchFoodComponentToDatabase({
      id: `item_${Date.now()}`,
      nameId: customComponentName.trim(),
      quantityGrams: grams,
      confidence: 0.85,
      isFromPhoto: Boolean(previewDataUrl),
    });
    setDraftItems((prev) => [...prev, matched]);
    if (!mealTitle) {
      setMealTitle(customComponentName.trim());
    }
    setCustomComponentName('');
    setAnalysisStatus('review');
  };

  const handleUpdateItemGrams = (itemId: string, newGrams: number) => {
    const safeGrams = Math.max(1, Math.min(3000, Math.round(newGrams || 1)));
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const ref = VERIFIED_NUTRITION_REFERENCES.find((r) => r.id === item.sourceMatchId);
        if (!ref) {
          return { ...item, quantityGrams: safeGrams };
        }
        const recalculated = computeNutrientsForGrams(ref, safeGrams);
        return {
          ...item,
          quantityGrams: safeGrams,
          ...recalculated,
        };
      })
    );
  };

  const handleChangeItemReference = (itemId: string, newRefId: string) => {
    const ref = VERIFIED_NUTRITION_REFERENCES.find((r) => r.id === newRefId);
    if (!ref) return;
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const recalculated = computeNutrientsForGrams(ref, item.quantityGrams);
        return {
          ...item,
          nameConfirmed: ref.nameId,
          cookingMethod: ref.cookingMethod,
          sourceCode: ref.sourceCode,
          sourceName: ref.sourceName,
          sourceMatchId: ref.id,
          matchStatus: previewDataUrl ? 'estimated_portion' : 'verified_match',
          confidence: 0.95,
          ...recalculated,
        };
      })
    );
  };

  const handleRemoveDraftItem = (itemId: string) => {
    setDraftItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Aggregate draft totals (strictly ignoring null/unavailable items rather than treating null as 0)
  const draftTotals = useMemo(() => {
    const validItems = draftItems.filter((i) => i.matchStatus !== 'unavailable' && i.calories !== null);
    return {
      totalCalories: Math.round(validItems.reduce((s, i) => s + (i.calories ?? 0), 0)),
      totalProteinG: Number(validItems.reduce((s, i) => s + (i.proteinG ?? 0), 0).toFixed(1)),
      totalCarbsG: Number(validItems.reduce((s, i) => s + (i.carbsG ?? 0), 0).toFixed(1)),
      totalFatG: Number(validItems.reduce((s, i) => s + (i.fatG ?? 0), 0).toFixed(1)),
      totalFiberG: Number(validItems.reduce((s, i) => s + (i.fiberG ?? 0), 0).toFixed(1)),
      totalSodiumMg: Math.round(validItems.reduce((s, i) => s + (i.sodiumMg ?? 0), 0)),
      validItemCount: validItems.length,
      totalItemCount: draftItems.length,
    };
  }, [draftItems]);

  const handleConfirmAndSaveJournal = async () => {
    if (draftItems.length === 0) {
      setAnalysisError('Tambahkan minimal 1 komponen makanan sebelum menyimpan ke jurnal.');
      return;
    }

    const eatenDate = eatenAtStr.includes('T')
      ? new Date(`${eatenAtStr}:00+07:00`)
      : new Date(eatenAtStr);
    const eatenIso = Number.isNaN(eatenDate.getTime())
      ? new Date().toISOString()
      : eatenDate.toISOString();

    const itemsSummary = draftItems
      .map((i) => `${i.nameConfirmed} (${i.quantityGrams}g · ${i.calories !== null ? `${i.calories} kkal` : 'Data tidak tersedia'})`)
      .join(', ');

    await onSaveConfirmedFoodLog(
      {
        mealType,
        title: mealTitle.trim() || draftItems.map((i) => i.nameConfirmed).join(' + '),
        eatenAt: eatenIso,
        transactionId: linkedTxId,
        userConfirmed: true,
        modelName: detectedModelName,
        items: draftItems,
        ...draftTotals,
        itemsSummary: itemsSummary.slice(0, 1950),
      },
      linkedTxId || undefined
    );

    // Reset draft and switch to journal view
    setDraftItems([]);
    setMealTitle('');
    setPreviewDataUrl(null);
    setAnalysisStatus('idle');
    setSubTab('journal');
  };

  // Aggregate confirmed journal stats
  const journalStats = useMemo(() => {
    const confirmed = foodLogs.filter((l) => l.userConfirmed);
    const totalCalories = confirmed.reduce((s, l) => s + l.totalCalories, 0);
    const totalProteinG = Number(confirmed.reduce((s, l) => s + l.totalProteinG, 0).toFixed(1));
    const totalCarbsG = Number(confirmed.reduce((s, l) => s + l.totalCarbsG, 0).toFixed(1));
    const totalFatG = Number(confirmed.reduce((s, l) => s + l.totalFatG, 0).toFixed(1));
    const totalFiberG = Number(confirmed.reduce((s, l) => s + l.totalFiberG, 0).toFixed(1));
    const totalSodiumMg = confirmed.reduce((s, l) => s + l.totalSodiumMg, 0);

    const mainMealCount = confirmed.filter((l) =>
      ['breakfast', 'lunch', 'dinner'].includes(l.mealType)
    ).length;
    const snackDrinkCount = confirmed.filter((l) =>
      ['snack', 'drinks'].includes(l.mealType)
    ).length;

    return {
      count: confirmed.length,
      totalCalories,
      totalProteinG,
      totalCarbsG,
      totalFatG,
      totalFiberG,
      totalSodiumMg,
      mainMealCount,
      snackDrinkCount,
    };
  }, [foodLogs]);

  const combinedMetrics = useMemo(
    () => computeCombinedFinanceNutritionMetrics(transactions, foodLogs, periodWindow),
    [transactions, foodLogs, periodWindow]
  );

  return (
    <div className="space-y-6">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Nutrition Intelligence & Food Journal
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Deteksi komponen makanan terverifikasi TKPI Kemenkes RI & USDA FoodData Central — Tanpa angka tebakan LLM
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-neutral-100 dark:bg-neutral-900 p-1">
          {(
            [
              { id: 'analyzer', label: 'Analisis & Input Makanan' },
              { id: 'journal', label: `Jurnal & Dashboard (${foodLogs.length})` },
              { id: 'combined', label: 'Keuangan × Nutrisi' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                subTab === tab.id
                  ? 'bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 shadow-xs'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'analyzer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Photo Capture & Verified Component Picker */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  1. Analisis Foto Makanan (Gemini Vision)
                </h3>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {geminiConfigured ? 'Gemini Siap' : 'Menunggu Konfigurasi'}
                </span>
              </div>

              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                Foto dikompresi (maks 1280px) dan metadata lokasi EXIF dihapus di perangkat Anda. Gemini hanya mendeteksi nama komponen & estimasi gram; angka gizi dihitung murni dari database TKPI/USDA.
              </p>

              <div>
                <label
                  htmlFor="food-photo-input"
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-emerald-500 p-5 cursor-pointer transition-colors bg-neutral-50 dark:bg-neutral-950"
                >
                  <Camera className="w-6 h-6 text-emerald-500 mb-2" />
                  <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    Pilih atau Ambil Foto Makanan (JPEG/PNG/WebP ≤ 5 MB)
                  </span>
                  <span className="text-[11px] text-neutral-500 mt-1">
                    {imageDimensions
                      ? `Terkompresi: ${imageDimensions.width}×${imageDimensions.height}px (EXIF bersih)`
                      : 'Klik untuk memilih dari kamera atau galeri'}
                  </span>
                  <input
                    id="food-photo-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
              </div>

              {previewDataUrl && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-950 aspect-video flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewDataUrl}
                      alt="Pratinjau foto makanan"
                      referrerPolicy="no-referrer"
                      className="max-h-48 object-contain"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="photo-note-input"
                      className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                    >
                      Catatan Porsi Tambahan (Opsional)
                    </label>
                    <input
                      id="photo-note-input"
                      type="text"
                      value={userNote}
                      onChange={(e) => setUserNote(e.target.value)}
                      placeholder="Misal: Nasi setengah porsi, dada ayam tanpa kulit"
                      className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyzePhotoWithGemini}
                    disabled={analysisStatus === 'analyzing'}
                    className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {analysisStatus === 'analyzing'
                        ? 'Mendeteksi Komponen Visual...'
                        : 'Deteksi Komponen Makanan dengan AI'}
                    </span>
                  </button>
                </div>
              )}

              {analysisError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{analysisError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Verified Database Component Picker (Always Available / Fallback) */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  2. Tambah Komponen dari Database TKPI / USDA
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Pilih langsung pangan terverifikasi atau uji pencarian pencocokan nama komponen
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="verified-food-select"
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                  >
                    Daftar Referensi Terverifikasi (TKPI Kemenkes RI & USDA)
                  </label>
                  <select
                    id="verified-food-select"
                    value={selectedRefId}
                    onChange={(e) => {
                      setSelectedRefId(e.target.value);
                      const found = VERIFIED_NUTRITION_REFERENCES.find((r) => r.id === e.target.value);
                      if (found) setManualGrams(String(found.defaultServingGrams));
                    }}
                    className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                  >
                    {VERIFIED_NUTRITION_REFERENCES.map((ref) => (
                      <option key={ref.id} value={ref.id}>
                        {ref.nameId} ({ref.per100g.calories} kkal / {ref.per100g.proteinG}g prot per 100g · {ref.sourceName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="manual-grams-input"
                      className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                    >
                      Berat Porsi (Gram)
                    </label>
                    <input
                      id="manual-grams-input"
                      type="number"
                      min={1}
                      max={3000}
                      value={manualGrams}
                      onChange={(e) => setManualGrams(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono tabular-nums text-neutral-900 dark:text-neutral-100"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleAddVerifiedReferenceItem}
                      className="w-full min-h-[42px] rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Tambah ke Review</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <label
                    htmlFor="custom-search-food-input"
                    className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                  >
                    Atau Ketik Nama Komponen (Tes Pencocokan Otomatis / Unavailable Status)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="custom-search-food-input"
                      type="text"
                      value={customComponentName}
                      onChange={(e) => setCustomComponentName(e.target.value)}
                      placeholder="Misal: Ayam goreng, Tempe, atau makanan langka"
                      className="flex-1 min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={handleSearchCustomComponent}
                      className="px-3.5 min-h-[40px] rounded-xl border border-neutral-300 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 whitespace-nowrap"
                    >
                      Cocokkan
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Mandatory User Review & Edit Screen */}
          <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  3. Layar Review & Konfirmasi Wajib Sebelum Simpan
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Ubah kandidat makanan atau sesuaikan gramasi — nutrisi dihitung ulang otomatis dari database
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-neutral-500">
                Cakupan data: {draftTotals.validItemCount} dari {draftTotals.totalItemCount} item tersedia
              </span>
            </div>

            {/* Metadata Form: Title, MealType, EatenAt, Linked Transaction */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="review-meal-title"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Nama Hidangan
                </label>
                <input
                  id="review-meal-title"
                  type="text"
                  value={mealTitle}
                  onChange={(e) => setMealTitle(e.target.value)}
                  placeholder="Contoh: Makan Siang Nasi Ayam & Sayur Bayam"
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label
                  htmlFor="review-meal-type"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Waktu Makan (Makan Utama vs Jajan)
                </label>
                <select
                  id="review-meal-type"
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((mt) => (
                    <option key={mt} value={mt}>
                      {MEAL_TYPE_LABELS[mt]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="review-eaten-at"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Waktu Konsumsi (Asia/Jakarta)
                </label>
                <input
                  id="review-eaten-at"
                  type="datetime-local"
                  value={eatenAtStr}
                  onChange={(e) => setEatenAtStr(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div>
                <label
                  htmlFor="review-linked-tx"
                  className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
                >
                  Tautkan ke Transaksi Pengeluaran (Opsional)
                </label>
                <select
                  id="review-linked-tx"
                  value={linkedTxId}
                  onChange={(e) => setLinkedTxId(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="">-- Tanpa Tautan Transaksi --</option>
                  {expenseTransactions.map((tx) => (
                    <option key={tx.id} value={tx.id}>
                      {formatIDR(tx.amount)} · {tx.description} ({tx.occurredAt.slice(0, 10)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Component Items List */}
            {draftItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-8 text-center space-y-2">
                <Utensils className="w-7 h-7 text-neutral-400 mx-auto" />
                <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Belum ada komponen makanan di daftar review
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Unggah foto makanan untuk dideteksi AI atau tambahkan langsung komponen dari daftar referensi TKPI/USDA di sebelah kiri.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {draftItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {item.nameConfirmed}
                        </span>
                        <span className="mx-1.5 text-neutral-400">·</span>
                        <span className="text-neutral-500">
                          Status:{' '}
                          <strong className="text-neutral-700 dark:text-neutral-300">
                            {item.matchStatus}
                          </strong>
                        </span>
                        <span className="mx-1.5 text-neutral-400">·</span>
                        <span className="text-neutral-500">{item.sourceName}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveDraftItem(item.id)}
                        aria-label={`Hapus komponen ${item.nameConfirmed}`}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-neutral-500 mb-1">
                          Ganti Padanan Database TKPI/USDA
                        </label>
                        <select
                          value={item.sourceMatchId || ''}
                          onChange={(e) => handleChangeItemReference(item.id, e.target.value)}
                          className="w-full min-h-[36px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 text-xs text-neutral-900 dark:text-neutral-100"
                        >
                          <option value="">-- Pilih Padanan Terverifikasi --</option>
                          {VERIFIED_NUTRITION_REFERENCES.map((ref) => (
                            <option key={ref.id} value={ref.id}>
                              {ref.nameId} ({ref.sourceName})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-neutral-500 mb-1">
                          Berat Estimasi (Gram)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={3000}
                          value={item.quantityGrams}
                          onChange={(e) => handleUpdateItemGrams(item.id, Number(e.target.value))}
                          className="w-full min-h-[36px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2.5 text-xs font-mono tabular-nums text-neutral-900 dark:text-neutral-100"
                        />
                      </div>
                    </div>

                    {item.matchStatus === 'unavailable' || item.calories === null ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Data nutrisi tidak tersedia untuk &ldquo;{item.nameDetected}&rdquo; (nilai null, tidak dihitung sebagai 0). Pilih padanan di atas jika ingin menyertakan estimasi.
                      </p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-neutral-600 dark:text-neutral-300 pt-1">
                        <span>Estimasi: <strong>{item.calories} kkal</strong></span>
                        <span>·</span>
                        <span>Protein: <strong>{item.proteinG}g</strong></span>
                        <span>·</span>
                        <span>Karbo: <strong>{item.carbsG}g</strong></span>
                        <span>·</span>
                        <span>Lemak: <strong>{item.fatG}g</strong></span>
                        <span>·</span>
                        <span>Serat: <strong>{item.fiberG}g</strong></span>
                        <span>·</span>
                        <span>Natrium: <strong>{item.sodiumMg}mg</strong></span>
                      </div>
                    )}
                  </div>
                ))}

                {/* Summary Box before confirmation */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                      Total Estimasi Hidangan ({draftTotals.validItemCount} dari {draftTotals.totalItemCount} item memiliki data sumber)
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {draftTotals.totalCalories} kkal
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                    <span>Protein: {draftTotals.totalProteinG}g</span>
                    <span>·</span>
                    <span>Karbohidrat: {draftTotals.totalCarbsG}g</span>
                    <span>·</span>
                    <span>Lemak: {draftTotals.totalFatG}g</span>
                    <span>·</span>
                    <span>Serat: {draftTotals.totalFiberG}g</span>
                    <span>·</span>
                    <span>Natrium: {draftTotals.totalSodiumMg}mg</span>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleConfirmAndSaveJournal}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Konfirmasi & Simpan ke Food Journal</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'journal' && (
        <div className="space-y-6">
          {/* Nutrition Macro Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Estimasi Kalori', val: `${journalStats.totalCalories} kkal` },
              { label: 'Estimasi Protein', val: `${journalStats.totalProteinG} g` },
              { label: 'Estimasi Karbohidrat', val: `${journalStats.totalCarbsG} g` },
              { label: 'Estimasi Lemak', val: `${journalStats.totalFatG} g` },
              { label: 'Estimasi Serat', val: `${journalStats.totalFiberG} g` },
              { label: 'Makan Utama vs Jajan', val: `${journalStats.mainMealCount} vs ${journalStats.snackDrinkCount}` },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
              >
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{stat.label}</p>
                <p className="mt-1.5 text-lg font-bold font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                  {stat.val}
                </p>
              </div>
            ))}
          </div>

          {foodLogs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-10 text-center space-y-3">
              <Utensils className="w-8 h-8 text-neutral-400 mx-auto" />
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Food Journal Masih Kosong
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                Belum ada catatan makanan terkonfirmasi. Analisis foto makanan atau pilih komponen dari database TKPI/USDA untuk mulai memantau asupan gizi.
              </p>
              <button
                type="button"
                onClick={() => setSubTab('analyzer')}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Catat Makanan Pertama</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-800">
              {foodLogs.map((log) => {
                const linkedTx = transactions.find((t) => t.id === log.transactionId);
                return (
                  <div key={log.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {MEAL_TYPE_LABELS[log.mealType]}
                        </span>
                        <span>·</span>
                        <span>{formatIndonesianDate(new Date(log.eatenAt), true)}</span>
                        <span>·</span>
                        <span>
                          Cakupan: {log.validItemCount}/{log.totalItemCount} item (Estimasi)
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {log.title}
                      </h4>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400">{log.itemsSummary}</p>
                      {linkedTx && (
                        <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1 pt-0.5">
                          <Link2 className="w-3.5 h-3.5" />
                          <span>
                            Tertaut Transaksi: {formatIDR(linkedTx.amount)} ({linkedTx.description})
                          </span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right font-mono tabular-nums">
                        <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                          {log.totalCalories} kkal (Estimasi)
                        </p>
                        <p className="text-xs text-neutral-500">
                          P: {log.totalProteinG}g · K: {log.totalCarbsG}g · L: {log.totalFatG}g
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteFoodLog(log.id)}
                        aria-label={`Hapus jurnal ${log.title}`}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'combined' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Average Daily Food Cost */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Biaya Konsumsi Rata-rata per Hari
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setShowFormulaCard(showFormulaCard === 'daily_food' ? null : 'daily_food')
                  }
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Cara menghitung</span>
                </button>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                {formatIDR(combinedMetrics.averageDailyFoodCost)}
              </p>
              <p className="text-xs text-neutral-500">
                Makan Utama: {formatIDR(combinedMetrics.totalMakanUtamaMonth)} · Jajan:{' '}
                {formatIDR(combinedMetrics.totalJajanMonth)}
              </p>
              {showFormulaCard === 'daily_food' && (
                <p className="text-xs font-mono bg-neutral-100 dark:bg-neutral-950 p-2.5 rounded-lg text-neutral-700 dark:text-neutral-300">
                  {combinedMetrics.averageDailyFoodFormula}
                </p>
              )}
            </div>

            {/* Card 2: Cost Per Gram of Protein */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Biaya per Gram Protein (Estimasi)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setShowFormulaCard(showFormulaCard === 'protein_cost' ? null : 'protein_cost')
                  }
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Cara menghitung</span>
                </button>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-neutral-900 dark:text-neutral-100">
                {combinedMetrics.costPerGramProtein !== null
                  ? `${formatIDR(combinedMetrics.costPerGramProtein)} / g`
                  : 'Tidak tersedia'}
              </p>
              <p className="text-xs text-neutral-500">
                Berdasarkan {combinedMetrics.costPerGramProteinSampleCount} sampel food log yang tertaut transaksi
              </p>
              {showFormulaCard === 'protein_cost' && (
                <p className="text-xs font-mono bg-neutral-100 dark:bg-neutral-950 p-2.5 rounded-lg text-neutral-700 dark:text-neutral-300">
                  {combinedMetrics.costPerGramProteinFormula}
                </p>
              )}
            </div>

            {/* Card 3: Meal Time Expense Breakdown */}
            <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-2">
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Perbandingan Biaya Waktu Makan ({periodWindow.label})
              </span>
              <div className="space-y-1.5 pt-1 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Sarapan:</span>
                  <span className="font-semibold">{formatIDR(combinedMetrics.mealTimeCostBreakdown.sarapan)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Makan Siang:</span>
                  <span className="font-semibold">{formatIDR(combinedMetrics.mealTimeCostBreakdown.makanSiang)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600 dark:text-neutral-400">Makan Malam:</span>
                  <span className="font-semibold">{formatIDR(combinedMetrics.mealTimeCostBreakdown.makanMalam)}</span>
                </div>
                <div className="flex justify-between text-amber-600 dark:text-amber-400">
                  <span>Jajan & Minuman:</span>
                  <span className="font-semibold">{formatIDR(combinedMetrics.mealTimeCostBreakdown.jajanMinuman)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Persistent Nutrition Disclaimer Footer (Section 2.3 & 7.2) */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-3.5 text-xs text-neutral-600 dark:text-neutral-400 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-neutral-800 dark:text-neutral-200">
            Pernyataan Kejujuran Nutrisi: Estimasi Berdasarkan Foto & Database Terverifikasi (Bukan Saran Medis)
          </p>
          <p>
            Seluruh angka nutrisi di atas adalah <strong>Estimasi</strong> yang dihitung dari pencocokan ke{' '}
            {NUTRITION_DATA_SOURCES.map((s) => `${s.name} (${s.version})`).join(' dan ')}{' '}
            {usdaConfigured ? '(Live USDA API Aktif)' : '(Referensi Terverifikasi Lokal)'}. Bukan hasil uji laboratorium dan tidak ditujukan sebagai diagnosis atau saran medis.
          </p>
        </div>
      </div>
    </div>
  );
}
