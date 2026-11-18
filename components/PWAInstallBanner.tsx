'use client';

import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X, RefreshCw, WifiOff } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS, setIsIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  });
  const [showModal, setShowModal] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setSwUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
      }
      return;
    }
    setShowModal(true);
  };

  if (isInstalled && !swUpdateAvailable) return null;

  return (
    <>
      {swUpdateAvailable && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Versi Baru Tersedia · Muat Ulang</span>
        </button>
      )}

      {!isInstalled && (
        <button
          type="button"
          onClick={handleInstallClick}
          aria-label="Instal Aplikasi MoneyScope"
          className={
            compact
              ? 'flex items-center gap-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors whitespace-nowrap shrink-0 min-h-[40px]'
              : 'flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0 min-h-[44px]'
          }
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span>{isIOS ? 'Instal di iOS' : 'Instal Aplikasi'}</span>
        </button>
      )}

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-emerald-500" />
                <h3 id="pwa-install-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                  Pasang MoneyScope di Perangkat Anda
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                aria-label="Tutup panduan instalasi"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
              <p>
                MoneyScope adalah Progressive Web App (PWA) yang mendukung layar penuh mandiri dan antrian pencatatan transaksi saat offline.
              </p>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5 space-y-2 text-xs">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Panduan iPhone / iPad (Safari):
                </p>
                <p>1. Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</p>
                <p>2. Pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.</p>
              </div>
              <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-3.5 space-y-2 text-xs">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Panduan Android / Desktop (Chrome / Edge):
                </p>
                <p>1. Klik ikon <strong>Instal MoneyScope</strong> di bilah alamat browser atau menu tiga titik.</p>
                <p>2. Konfirmasi instalasi untuk membuka aplikasi secara mandiri.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-semibold"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineConnectivityBanner({
  isOnline,
  pendingCount,
  onSyncNow,
}: {
  isOnline: boolean;
  pendingCount: number;
  onSyncNow: () => void;
}) {
  if (isOnline && pendingCount === 0) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          {!isOnline
            ? `Mode Offline Aktif — Hanya pencatatan transaksi yang tersedia (${pendingCount} menunggu sinkron).`
            : `${pendingCount} transaksi offline siap disinkronkan.`}
        </span>
      </div>
      {isOnline && pendingCount > 0 && (
        <button
          type="button"
          onClick={onSyncNow}
          className="px-3 py-1 rounded-md bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors whitespace-nowrap shrink-0"
        >
          Sinkronkan Sekarang
        </button>
      )}
    </div>
  );
}
