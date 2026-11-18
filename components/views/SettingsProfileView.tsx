'use client';

import React, { useState } from 'react';
import type { AuditLogEntry } from '@/lib/schemas';
import {
  Sun,
  Moon,
  Monitor,
  Download,
  Shield,
  Trash2,
  FileJson,
  FileSpreadsheet,
  History,
} from 'lucide-react';

interface SettingsProfileViewProps {
  displayName: string;
  userEmail: string | null;
  storageMode: 'firebase_cloud' | 'local_workspace';
  theme: 'dark' | 'light' | 'system';
  auditLogs: AuditLogEntry[];
  onChangeTheme: (theme: 'dark' | 'light' | 'system') => void;
  onUpdateDisplayName: (name: string) => Promise<void>;
  onExportJson: () => void;
  onExportCsv: () => void;
  onDeleteAllAccountData: () => Promise<void>;
}

export function SettingsProfileView({
  displayName,
  userEmail,
  storageMode,
  theme,
  auditLogs,
  onChangeTheme,
  onUpdateDisplayName,
  onExportJson,
  onExportCsv,
  onDeleteAllAccountData,
}: SettingsProfileViewProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    await onUpdateDisplayName(nameInput.trim());
    setSavedNotice('Profil berhasil diperbarui.');
    setTimeout(() => setSavedNotice(null), 2500);
  };

  const handleConfirmDeleteAccount = async () => {
    if (confirmDeleteText.trim().toUpperCase() !== 'HAPUS AKUN') {
      setDeleteError('Ketik persis "HAPUS AKUN" untuk mengonfirmasi penghapusan seluruh data.');
      return;
    }
    setDeleteError(null);
    await onDeleteAllAccountData();
    setConfirmDeleteText('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Pengaturan, Privasi & Profil Pengguna
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Kelola tema tampilan, transparansi privasi AI, ekspor data penuh, audit log, dan penghapusan akun terverifikasi
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Profile & Theme Settings */}
        <div className="lg:col-span-6 space-y-6">
          <form
            onSubmit={handleSaveProfile}
            className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-4"
          >
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Profil & Zona Waktu
            </h3>
            <div>
              <label
                htmlFor="profile-name-input"
                className="block text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-1"
              >
                Nama Tampilan
              </label>
              <input
                id="profile-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-3 text-sm text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
                <span className="text-neutral-500 block">Mode Penyimpanan</span>
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {storageMode === 'firebase_cloud'
                    ? `Cloud Firestore (${userEmail || 'Terautentikasi'})`
                    : 'Ruang Kerja Lokal Terisolasi'}
                </strong>
              </div>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
                <span className="text-neutral-500 block">Zona Waktu & Mata Uang</span>
                <strong className="text-neutral-900 dark:text-neutral-100 font-mono">
                  Asia/Jakarta (WIB) · IDR
                </strong>
              </div>
            </div>

            {savedNotice && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {savedNotice}
              </p>
            )}

            <button
              type="submit"
              className="min-h-[42px] px-4 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold"
            >
              Simpan Perubahan Profil
            </button>
          </form>

          {/* Theme Switcher */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Tema Visual (Tanpa Flash Saat Load)
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'dark', label: 'Gelap (Dark)', icon: Moon },
                  { id: 'light', label: 'Terang (Light)', icon: Sun },
                  { id: 'system', label: 'Sistem', icon: Monitor },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = theme === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChangeTheme(item.id)}
                    className={`min-h-[44px] rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Data Export */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Hak Portabilitas & Ekspor Seluruh Data
              </h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Unduh seluruh data transaksi, akun, anggaran, dan jurnal nutrisi Anda kapan saja dalam format standar terbuka.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                type="button"
                onClick={onExportCsv}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <span>Ekspor Transaksi (CSV)</span>
              </button>
              <button
                type="button"
                onClick={onExportJson}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2"
              >
                <FileJson className="w-4 h-4 text-sky-500" />
                <span>Ekspor Seluruh Data (JSON)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Privacy Notice, Audit Logs & Account Deletion */}
        <div className="lg:col-span-6 space-y-6">
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Transparansi Privasi & Pemrosesan Pihak Ketiga
              </h3>
            </div>
            <div className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              <p>
                <strong>1. Data Keuangan Pribadi:</strong> Nominal transaksi, saldo akun, dan anggaran Anda disimpan secara terisolasi per pengguna dan <strong>tidak pernah dikirim ke model AI (Gemini) maupun USDA</strong>.
              </p>
              <p>
                <strong>2. Foto Makanan (Google Gemini Vision):</strong> Saat Anda menggunakan fitur analisis foto makanan, gambar dikompresi dan seluruh metadata lokasi/kamera (EXIF/GPS) dihapus di browser sebelum dikirim ke server untuk mendeteksi nama komponen makanan.
              </p>
              <p>
                <strong>3. Pencarian Gizi (USDA FoodData Central & TKPI):</strong> Hanya teks nama makanan generik (misal &ldquo;grilled chicken breast&rdquo;) yang dikirim ke API USDA FDC tanpa identitas pengguna.
              </p>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Audit Log Operasi Penting ({auditLogs.length})
              </h3>
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-neutral-500">Belum ada aktivitas sensitif yang tercatat.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto text-xs font-mono">
                {auditLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg bg-neutral-50 dark:bg-neutral-950 px-3 py-2 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2"
                  >
                    <span className="truncate">
                      [{log.action}] {log.entity}: {log.metadataSummary}
                    </span>
                    <span className="text-neutral-400 shrink-0">{log.createdAt.slice(11, 19)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Danger Zone: Verified Account & Data Deletion */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 className="w-4 h-4" />
              <h3 className="text-sm font-semibold">
                Hapus Akun & Seluruh Data Permanen
              </h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300">
              Tindakan ini akan menghapus seluruh transaksi, akun, anggaran, jurnal nutrisi, antrian IndexedDB offline, dan cache sesi Anda secara permanen. Ketik <strong>HAPUS AKUN</strong> di bawah untuk mengonfirmasi:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={confirmDeleteText}
                onChange={(e) => {
                  setDeleteError(null);
                  setConfirmDeleteText(e.target.value);
                }}
                placeholder='Ketik "HAPUS AKUN"'
                aria-label="Konfirmasi ketik HAPUS AKUN"
                className="flex-1 min-h-[42px] rounded-xl border border-rose-500/40 bg-white dark:bg-neutral-950 px-3 text-xs font-mono text-neutral-900 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold whitespace-nowrap"
              >
                Hapus Seluruh Data
              </button>
            </div>
            {deleteError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{deleteError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
