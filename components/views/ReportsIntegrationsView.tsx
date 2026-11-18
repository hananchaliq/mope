'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  type FoodLogRecord,
  type ReportPreferenceRecord,
  type ScheduledReportLog,
  type TransactionRecord,
  type CategoryRecord,
  JAJAN_CATEGORY_IDS,
  MAKAN_UTAMA_CATEGORY_IDS,
} from '@/lib/schemas';
import { formatIDR, type PeriodAnalyticsSummary } from '@/lib/finance';
import {
  Send,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Link2Off,
  Terminal,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface ReportsIntegrationsViewProps {
  periodSummary: PeriodAnalyticsSummary;
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  foodLogs: FoodLogRecord[];
  preferences: ReportPreferenceRecord[];
  reportLogs: ScheduledReportLog[];
  onSavePreference: (pref: Omit<ReportPreferenceRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onRecordReportLog: (log: ScheduledReportLog) => void;
}

function buildUnicodeBar(percent: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function ReportsIntegrationsView({
  periodSummary,
  transactions,
  categories,
  foodLogs,
  preferences,
  reportLogs,
  onSavePreference,
  onRecordReportLog,
}: ReportsIntegrationsViewProps) {
  const [telegramState, setTelegramState] = useState<{
    tokenConfigured: boolean;
    webhookSecretConfigured: boolean;
    botUsername: string | null;
    status: string;
    chatId: string | null;
    pairingCode: string | null;
    expiresAt: string | null;
    feedbackMsg: string | null;
  }>({
    tokenConfigured: false,
    webhookSecretConfigured: false,
    botUsername: null,
    status: 'waiting_configuration',
    chatId: null,
    pairingCode: null,
    expiresAt: null,
    feedbackMsg: null,
  });

  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappFeedback, setWhatsappFeedback] = useState<string | null>(null);
  const [manualChatId, setManualChatId] = useState('');

  // Schedule preference form state
  const [reportType, setReportType] = useState<'financial' | 'nutrition'>('financial');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom_cron'>('weekly');
  const [sendTime, setSendTime] = useState('20:00');
  const [channel, setChannel] = useState<'telegram' | 'whatsapp'>('telegram');
  const [customCron, setCustomCron] = useState('0 20 * * 1');

  const fetchIntegrationStatus = async () => {
    try {
      const [tgRes, sysRes] = await Promise.all([
        fetch('/api/integrations/telegram'),
        fetch('/api/integrations/status'),
      ]);
      if (tgRes.ok) {
        const tgData = await tgRes.json();
        setTelegramState((prev) => ({
          ...prev,
          tokenConfigured: Boolean(tgData.tokenConfigured),
          webhookSecretConfigured: Boolean(tgData.webhookSecretConfigured),
          botUsername: tgData.botUsername ?? null,
          status: tgData.session?.status ?? 'not_connected',
          chatId: tgData.session?.chatId ?? null,
          expiresAt: tgData.session?.expiresAt ?? null,
        }));
      }
      if (sysRes.ok) {
        const sysData = await sysRes.json();
        setWhatsappConfigured(Boolean(sysData.status?.whatsappConfigured));
      }
    } catch {
      // Offline or unreachable
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchIntegrationStatus();
    });
  }, []);


  // Build live Financial & Nutrition report text from the single source of truth (`periodSummary`)
  const liveReportPreview = useMemo(() => {
    const periodTxs = periodSummary.filteredTransactions;
    const makanTotal = periodTxs
      .filter((t) => t.type === 'expense' && MAKAN_UTAMA_CATEGORY_IDS.has(t.categoryId))
      .reduce((s, t) => s + t.amount, 0);
    const jajanTotal = periodTxs
      .filter((t) => t.type === 'expense' && JAJAN_CATEGORY_IDS.has(t.categoryId))
      .reduce((s, t) => s + t.amount, 0);

    if (reportType === 'financial') {
      const topCats = periodSummary.categoryDistribution.slice(0, 4);
      const catLines =
        topCats.length > 0
          ? topCats
              .map(
                (c) =>
                  `• ${c.categoryName}: ${formatIDR(c.amount)} (${c.percentage}%)\n  ${buildUnicodeBar(c.percentage)}`
              )
              .join('\n')
          : '• Belum ada pengeluaran pada periode ini.';

      return [
        `📊 LAPORAN KEUANGAN MONEYSCOPE`,
        `Periode: ${periodSummary.window.label} (Asia/Jakarta)`,
        `────────────────────────────`,
        `➕ Total Pemasukan : ${formatIDR(periodSummary.totalIncome)}`,
        `➖ Total Pengeluaran: ${formatIDR(periodSummary.totalExpense)}`,
        `💰 Arus Kas Bersih  : ${formatIDR(periodSummary.netCashFlow)}`,
        `🧾 Jumlah Transaksi : ${periodSummary.transactionCount} transaksi`,
        `📅 Rata-rata Harian : ${formatIDR(periodSummary.dailyAverageExpense)}/hari`,
        `────────────────────────────`,
        `🍛 Pengeluaran Makan Utama: ${formatIDR(makanTotal)}`,
        `🧋 Pengeluaran Jajan/Kopi : ${formatIDR(jajanTotal)}`,
        `────────────────────────────`,
        `📌 Distribusi Kategori Terbesar:`,
        catLines,
      ].join('\n');
    }

    const confirmedLogs = foodLogs.filter((f) => f.userConfirmed);
    const totalCal = confirmedLogs.reduce((s, f) => s + f.totalCalories, 0);
    const totalProt = confirmedLogs.reduce((s, f) => s + f.totalProteinG, 0).toFixed(1);
    const totalCarb = confirmedLogs.reduce((s, f) => s + f.totalCarbsG, 0).toFixed(1);
    const totalFat = confirmedLogs.reduce((s, f) => s + f.totalFatG, 0).toFixed(1);
    const mainMeals = confirmedLogs.filter((f) => ['breakfast', 'lunch', 'dinner'].includes(f.mealType)).length;
    const snacks = confirmedLogs.filter((f) => ['snack', 'drinks'].includes(f.mealType)).length;

    return [
      `🥗 LAPORAN NUTRISI MONEYSCOPE (ESTIMASI)`,
      `Periode: ${periodSummary.window.label} (Asia/Jakarta)`,
      `────────────────────────────`,
      `🔥 Total Estimasi Kalori : ${totalCal} kkal`,
      `🥩 Estimasi Protein      : ${totalProt} g`,
      `🍚 Estimasi Karbohidrat  : ${totalCarb} g`,
      `🥑 Estimasi Lemak        : ${totalFat} g`,
      `🍽️ Frekuensi Makan Utama : ${mainMeals} kali`,
      `🍪 Frekuensi Jajan/Minum : ${snacks} kali`,
      `────────────────────────────`,
      `⚠️ Catatan: Nilai merupakan ESTIMASI berdasarkan pencocokan TKPI Kemenkes RI & USDA FoodData Central, bukan saran medis.`,
    ].join('\n');
  }, [periodSummary, foodLogs, reportType]);

  const handleGeneratePairingCode = async () => {
    const res = await fetch('/api/integrations/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_pairing_code' }),
    });
    const data = await res.json();
    if (res.ok) {
      setTelegramState((prev) => ({
        ...prev,
        pairingCode: data.code,
        expiresAt: data.expiresAtIso,
        status: prev.tokenConfigured ? 'pending' : 'waiting_configuration',
        feedbackMsg: data.instruction,
      }));
    }
  };

  const handleTestTelegramConnection = async () => {
    const res = await fetch('/api/integrations/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test_connection' }),
    });
    const data = await res.json();
    setTelegramState((prev) => ({
      ...prev,
      feedbackMsg: res.ok
        ? `Terhubung ke Bot @${data.botUsername || data.botName} (getMe berhasil).`
        : data.error,
    }));
  };

  const handleSendTelegramReportNow = async () => {
    const res = await fetch('/api/integrations/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_report',
        chatId: manualChatId || telegramState.chatId || '',
        reportText: liveReportPreview,
      }),
    });
    const data = await res.json();
    const nowIso = new Date().toISOString();
    const periodStart = periodSummary.window.start.toISOString().slice(0, 10);
    const periodEnd = periodSummary.window.end.toISOString().slice(0, 10);

    onRecordReportLog({
      id: `rep_${Date.now()}`,
      preferenceId: 'manual_trigger',
      reportType,
      channel: 'telegram',
      periodStart,
      periodEnd,
      dedupeKey: `manual_telegram_${periodStart}_${periodEnd}`,
      status: res.ok ? 'sent' : 'failed',
      previewText: liveReportPreview,
      sentAt: nowIso,
      error: res.ok ? undefined : data.error,
    });

    setTelegramState((prev) => ({
      ...prev,
      feedbackMsg: res.ok
        ? `Laporan berhasil dikirim ke chat_id ${data.chatId}.`
        : data.error,
    }));
  };

  const handleDisconnectTelegram = async () => {
    await fetch('/api/integrations/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    });
    setTelegramState((prev) => ({
      ...prev,
      chatId: null,
      pairingCode: null,
      status: prev.tokenConfigured ? 'not_connected' : 'waiting_configuration',
      feedbackMsg: 'Integrasi Telegram diputuskan dan chat_id telah dihapus.',
    }));
  };

  const handleSendWhatsappTemplate = async () => {
    const res = await fetch('/api/integrations/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'send_template_report',
        recipientPhone: whatsappPhone,
        templateName:
          reportType === 'financial'
            ? 'moneyscope_financial_summary'
            : 'moneyscope_nutrition_summary',
        templateVariables: [
          periodSummary.window.label,
          formatIDR(periodSummary.totalIncome),
          formatIDR(periodSummary.totalExpense),
          formatIDR(periodSummary.netCashFlow),
        ],
      }),
    });
    const data = await res.json();
    setWhatsappFeedback(res.ok ? 'Template laporan berhasil dikirim via WhatsApp Cloud API.' : data.error);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Automated Reporting & Integrasi Chat (Telegram / WhatsApp)
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Seluruh angka laporan dihitung dari satu sumber kebenaran database Anda. Status koneksi ditampilkan secara jujur sesuai konfigurasi server.
        </p>
      </div>

      {/* Integration Status Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Telegram Card */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Integrasi Telegram Bot Resmi
              </h3>
              <p className="text-xs text-neutral-500">
                Pairing kode sekali pakai (kedaluwarsa 10 menit, disimpan sebagai hash SHA-256)
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
              {telegramState.status === 'connected'
                ? 'Terhubung'
                : telegramState.tokenConfigured
                  ? 'Belum Terhubung'
                  : 'Menunggu Konfigurasi'}
            </span>
          </div>

          {!telegramState.tokenConfigured && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Status: Menunggu konfigurasi.</strong> Variabel <code>TELEGRAM_BOT_TOKEN</code> belum diisi di server. Anda tetap dapat membuat kode pairing 10 menit dan meninjau format laporan nyata di bawah.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGeneratePairingCode}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold flex items-center gap-1.5"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Buat Kode Pairing (10 Menit)</span>
            </button>

            <button
              type="button"
              onClick={handleTestTelegramConnection}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Test Connection (getMe)</span>
            </button>

            {telegramState.chatId && (
              <button
                type="button"
                onClick={handleDisconnectTelegram}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-rose-500/30 text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1.5"
              >
                <Link2Off className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            )}
          </div>

          {telegramState.pairingCode && (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5 space-y-1.5 text-xs">
              <p className="text-neutral-500">Kirim perintah berikut ke Bot Telegram Anda:</p>
              <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 select-all">
                /start {telegramState.pairingCode}
              </p>
              <p className="text-[11px] text-neutral-500">
                Webhook: <code>/api/webhooks/telegram</code> (verifikasi header <code>X-Telegram-Bot-Api-Secret-Token</code>) · Kedaluwarsa: {telegramState.expiresAt?.slice(11, 19)} UTC
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="tg-manual-chatid"
              className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
            >
              Chat ID Tujuan (Terisi otomatis saat webhook pairing sukses)
            </label>
            <div className="flex gap-2">
              <input
                id="tg-manual-chatid"
                type="text"
                value={manualChatId || telegramState.chatId || ''}
                onChange={(e) => setManualChatId(e.target.value)}
                placeholder="Contoh: 123456789"
                className="flex-1 min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={handleSendTelegramReportNow}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Now</span>
              </button>
            </div>
          </div>

          {telegramState.feedbackMsg && (
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-950 p-2.5 rounded-lg">
              {telegramState.feedbackMsg}
            </p>
          )}
        </div>

        {/* WhatsApp Business Cloud API Card */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                WhatsApp Business Cloud API (Resmi Meta WABA)
              </h3>
              <p className="text-xs text-neutral-500">
                Verifikasi signature <code>X-Hub-Signature-256</code> & dukungan Template 24-Jam
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
              {whatsappConfigured ? 'Terhubung' : 'Menunggu Konfigurasi'}
            </span>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
            <p className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Persyaratan WhatsApp Business Cloud API:</span>
            </p>
            <p>
              Pengiriman laporan terjadwal di luar jendela percakapan 24 jam wajib menggunakan <strong>Message Template</strong> yang disetujui di Meta Business Suite (tanpa scraping WhatsApp Web).
            </p>
            <p className="font-mono text-[11px] bg-white dark:bg-neutral-900 p-2 rounded border border-neutral-200 dark:border-neutral-800">
              Template: <strong>moneyscope_financial_summary</strong><br />
              Variabel: {'{{1}}'} Periode · {'{{2}}'} Pemasukan · {'{{3}}'} Pengeluaran · {'{{4}}'} Saldo Bersih
            </p>
          </div>

          <div>
            <label
              htmlFor="wa-recipient-phone"
              className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
            >
              Nomor WhatsApp Tujuan (Format Internasional 628xxx)
            </label>
            <div className="flex gap-2">
              <input
                id="wa-recipient-phone"
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="6281234567890"
                className="flex-1 min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={handleSendWhatsappTemplate}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Uji Kirim Template</span>
              </button>
            </div>
          </div>

          {whatsappFeedback && (
            <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-neutral-950 p-2.5 rounded-lg">
              {whatsappFeedback}
            </p>
          )}
        </div>
      </div>

      {/* Report Schedule Preferences & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Jadwal Laporan Otomatis (Idempoten)
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Jenis Laporan
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as 'financial' | 'nutrition')}
                className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
              >
                <option value="financial">Laporan Keuangan (Arus Kas, Makan vs Jajan, Kategori)</option>
                <option value="nutrition">Laporan Nutrisi (Estimasi Kalori, Protein, Frekuensi)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Frekuensi Kirim
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
                >
                  <option value="daily">Harian</option>
                  <option value="weekly">Mingguan (Senin)</option>
                  <option value="biweekly">Tiap 2 Minggu</option>
                  <option value="monthly">Bulanan</option>
                  <option value="quarterly">Tiap 3 Bulan</option>
                  <option value="custom_cron">Custom Cron</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Jam Kirim (WIB)
                </label>
                <input
                  type="time"
                  value={sendTime}
                  onChange={(e) => setSendTime(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            {frequency === 'custom_cron' && (
              <div>
                <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                  Ekspresi Cron (5 Kolom)
                </label>
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1">
                Kanal Pengiriman
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as 'telegram' | 'whatsapp')}
                className="w-full min-h-[40px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-xs text-neutral-900 dark:text-neutral-100"
              >
                <option value="telegram">Telegram Bot</option>
                <option value="whatsapp">WhatsApp Business Cloud API</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() =>
                onSavePreference({
                  reportType,
                  frequency,
                  customCron,
                  sendTime,
                  channel,
                  isEnabled: true,
                  timezone: 'Asia/Jakarta',
                })
              }
              className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Jadwal Laporan</span>
            </button>
          </div>

          {preferences.length > 0 && (
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-800 space-y-2">
              <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Jadwal Aktif ({preferences.length}):
              </p>
              {preferences.map((p) => (
                <div
                  key={p.id}
                  className="text-xs flex items-center justify-between rounded-lg bg-neutral-50 dark:bg-neutral-950 px-3 py-2 border border-neutral-200 dark:border-neutral-800"
                >
                  <span>
                    <strong>{p.reportType === 'financial' ? 'Keuangan' : 'Nutrisi'}</strong> · {p.frequency} · {p.sendTime} WIB
                  </span>
                  <span className="font-mono uppercase text-emerald-600 dark:text-emerald-400">
                    {p.channel}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Report Preview */}
        <div className="lg:col-span-7 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Pratinjau Pesan Laporan Nyata (Live Data Preview)
              </h3>
              <p className="text-xs text-neutral-500">
                Dihitung langsung dari {transactions.length} transaksi & {foodLogs.length} jurnal makanan Anda
              </p>
            </div>
            <span className="text-xs font-mono text-neutral-500">
              {categories.length} kategori aktif
            </span>
          </div>

          <pre className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-950 text-neutral-100 p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed overflow-x-auto">
            {liveReportPreview}
          </pre>

          {reportLogs.length > 0 && (
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                Riwayat Pengiriman & Status Laporan:
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {reportLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-2.5 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-semibold uppercase">{log.channel}</span> · {log.reportType} ·{' '}
                      <span className="font-mono text-neutral-500">{log.dedupeKey}</span>
                      {log.error && (
                        <p className="text-rose-600 dark:text-rose-400 mt-0.5">{log.error}</p>
                      )}
                    </div>
                    <span
                      className={`font-mono font-semibold ${
                        log.status === 'sent' ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
