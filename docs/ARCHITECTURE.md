# MoneyScope — Architecture & System Design (`docs/ARCHITECTURE.md`)

## 1. Ikhtisar Sistem

**MoneyScope** adalah Progressive Web Application (PWA) untuk intelijen keuangan pribadi (*Personal Finance Intelligence*) dan analisis nutrisi berbasis foto (*Nutrition Intelligence*) yang dirancang dengan empat pilar utama:

1. **Financial Tracking**: Pencatatan pemasukan, pengeluaran, dan transfer antar-akun dengan target waktu $\le 5$ detik melalui Quick Add FAB, validasi skema Zod di client & server, antrian offline berbasis IndexedDB (`clientId` idempoten), serta fitur impor/ekspor CSV dengan validasi baris demi baris.
2. **Financial Intelligence**: Mesin periode murni (`lib/periods.ts`) berbasis zona waktu `Asia/Jakarta` (WIB, minggu dimulai Senin), agregasi keuangan akurat dalam satuan Rupiah (`integer`/`bigint` tanpa `float`), drill-down interaktif (klik tanggal atau kategori yang tersinkron ke URL query string), serta mesin *Smart Insights* deterministik berbasis aturan.
3. **Nutrition Intelligence**: Pipeline analisis foto makanan di mana gambar dikompresi & dibersihkan dari metadata EXIF di browser, dikirim ke endpoint server `/api/nutrition/analyze` menggunakan SDK resmi `@google/genai` (dengan nama model dari `process.env.GEMINI_MODEL` dan JSON Schema terstruktur) **hanya untuk mendeteksi komponen visual dan estimasi gramasi**, kemudian dicocokkan secara deterministik terhadap database nutrisi terverifikasi (**USDA FoodData Central API** dan **Tabel Komposisi Pangan Indonesia / TKPI**). Pengguna wajib meninjau/mengedit hasil sebelum disimpan ke *Food Journal*.
4. **Automated Reporting**: Sistem pelaporan terjadwal ke **Telegram Bot API** (melalui pairing kode sekali pakai berumur 10 menit dan verifikasi header `X-Telegram-Bot-Api-Secret-Token`) dan **WhatsApp Business Cloud API** (dengan verifikasi `X-Hub-Signature-256` dan dukungan template WABA), lengkap dengan endpoint cron idempoten (`/api/cron/reports`).

---

## 2. Struktur Direktori

```text
/
├── app/
│   ├── api/
│   │   ├── cron/reports/route.ts       # Endpoint cron idempoten (CRON_SECRET)
│   │   ├── integrations/status/route.ts# Status env & koneksi nyata Telegram/WhatsApp/USDA/Gemini
│   │   ├── integrations/telegram/route.ts # Pairing kode 10 menit, test connection, send report
│   │   ├── integrations/whatsapp/route.ts # Test connection & kirim template WhatsApp Cloud API
│   │   ├── nutrition/analyze/route.ts  # Pipeline Gemini Vision (komponen) + USDA/TKPI matcher
│   │   ├── webhooks/telegram/route.ts  # Webhook resmi Telegram Bot (/start <kode>, /status, /stop)
│   │   └── webhooks/whatsapp/route.ts  # Webhook resmi Meta WhatsApp Cloud API
│   ├── globals.css                     # Tailwind CSS v4 + @custom-variant dark + design tokens
│   ├── layout.tsx                      # Root layout, font pairing, metadata, theme script anti-FOUC
│   ├── manifest.ts                     # Web App Manifest standar PWA (standalone, id, icons)
│   └── page.tsx                        # Entry point aplikasi MoneyScope
├── components/
│   ├── MoneyScopeApp.tsx               # Shell aplikasi utama, navigasi responsif, state & sync
│   ├── ErrorBoundary.tsx               # React Error Boundary dengan diagnostik terstruktur
│   ├── PWAInstallBanner.tsx            # Prompt instalasi Android/Desktop + panduan iOS Safari
│   └── modals/
│       └── QuickAddModal.tsx           # Keypad nominal cepat <= 5 detik + saran kategori pintar
├── lib/
│   ├── env.ts                          # Validasi environment variables dengan Zod
│   ├── firebase.ts                     # Inisialisasi Firebase Auth, Firestore, & Error Handler
│   ├── periods.ts                      # Modul murni 15 periode keuangan (Asia/Jakarta, Senin-Minggu)
│   ├── periods.test.ts                 # Unit test komprehensif untuk seluruh periode & tahun kabisat
│   ├── finance.ts                      # Kalkulasi saldo, budget, proyeksi linear, insights, CSV parser
│   ├── finance.test.ts                 # Unit test kalkulasi keuangan, nutrisi gabungan, & CSV
│   ├── nutrition-db.ts                 # Database referensi terverifikasi TKPI & USDA + algoritma skor
│   ├── offline-queue.ts                # Antrian offline IndexedDB dengan clientId unik & sinkronisasi
│   └── schemas.ts                      # Skema Zod bersama (Client & Server) + kategori default
├── docs/
│   ├── ARCHITECTURE.md                 # Dokumen arsitektur, ERD, alur data, dan env vars
│   └── DECISIONS.md                    # Catatan keputusan teknis & trade-off rekayasa
├── firebase-blueprint.json             # Blueprint IR entitas dan koleksi Firestore
├── DRAFT_firestore.rules               # Draft aturan keamanan Firestore untuk audit ESLint
├── firestore.rules                     # Aturan keamanan produksi Zero-Trust (Eight Pillars)
├── security_spec.md                    # Spesifikasi TDD keamanan & Dirty Dozen payloads
└── firestore.rules.test.ts             # Pengujian logika aturan keamanan & isolasi multi-user
```

---

## 3. Entity Relationship & Data Model (ERD)

Di lingkungan AI Studio saat Cloud SQL tidak tersedia pada proyek pengguna, persistensi utama menggunakan **Firebase Authentication + Cloud Firestore** dengan isolasi per pengguna (`users/{userId}/...`) dan aturan keamanan Zero-Trust (`firestore.rules`) yang setara dengan kebijakan Row-Level Security (RLS) per-baris:

```text
[User Profile: /users/{userId}]
   ├──1:N──> [Accounts: /users/{userId}/accounts/{accountId}]
   │            (id, userId, name, type, openingBalance, currency, isArchived)
   ├──1:N──> [Categories: /users/{userId}/categories/{categoryId}]
   │            (id, userId, name, kind, parentId, icon, color, isSystem, sortOrder)
   ├──1:N──> [Transactions: /users/{userId}/transactions/{transactionId}]
   │            (id, userId, type, amount > 0, accountId, toAccountId, categoryId,
   │             description, merchant, paymentMethod, occurredAt, clientId, notes)
   ├──1:N──> [Budgets: /users/{userId}/budgets/{budgetId}]
   │            (id, userId, name, scope, categoryId, period, limitAmount, alertThresholds)
   ├──1:N──> [FoodLogs: /users/{userId}/foodLogs/{foodLogId}]
   │            (id, userId, mealType, eatenAt, transactionId, userConfirmed, modelName,
   │             items: [{ nameDetected, nameConfirmed, quantityGrams, matchStatus,
   │                       sourceCode, sourceMatchId, confidence, calories, proteinG, ... }])
   ├──1:N──> [ReportPreferences: /users/{userId}/reportPreferences/{prefId}]
   │            (id, userId, reportType, frequency, sendTime, channel, isEnabled, timezone)
   ├──1:N──> [Integrations: /users/{userId}/integrations/{integrationId}]
   │            (id, userId, provider, status, externalId, pairingCodeHash, pairingExpiresAt)
   ├──1:N──> [ScheduledReports: /users/{userId}/scheduledReports/{reportId}]
   │            (id, userId, preferenceId, periodStart, periodEnd, dedupeKey, status, sentAt)
   ├──1:N──> [Notifications: /users/{userId}/notifications/{notificationId}]
   │            (id, userId, type, title, body, dedupeKey, readAt, createdAt)
   └──1:N──> [AuditLogs: /users/{userId}/auditLogs/{logId}]
                (id, userId, action, entity, entityId, metadataSummary, createdAt)
```

---

## 4. Alur Data Utama

### 4.1 Pencatatan Transaksi & Antrian Offline
1. Input pengguna divalidasi dengan `TransactionInputSchema` (Zod): nominal wajib bilangan bulat positif (`amount > 0`), transfer wajib memiliki `toAccountId !== accountId`.
2. Jika aplikasi sedang **offline**, transaksi disimpan di IndexedDB (`moneyscope_offline_queue`) dengan `clientId` UUID deterministik dan ditandai **"Menunggu sinkron"**.
3. Saat kembali **online**, antrian dikirim menggunakan `clientId` sebagai ID dokumen sehingga operasi bersifat **idempoten** (bebas duplikasi meskipun dikirim ulang).
4. Setiap penyimpanan transaksi mengevaluasi seluruh budget aktif; jika persentase penggunaan melewati ambang batas (`50%`, `80%`, `100%`), sistem membuat notifikasi dengan `dedupeKey = "${budgetId}:${periodKey}:${threshold}"` agar tidak terjadi spam.

### 4.2 Pipeline Analisis Foto Makanan (Nutrition Intelligence)
1. **Browser Pre-processing**: Gambar di-resize ($\le 1280\text{px}$) melalui HTML5 `<canvas>` dan diekspor ulang sebagai JPEG terkompresi (otomatis menghapus seluruh metadata EXIF/GPS).
2. **Server Route (`/api/nutrition/analyze`)**:
   - Memanggil `@google/genai` (`ai.models.generateContent`) menggunakan model dari `process.env.GEMINI_MODEL` (default `gemini-4-hydrogen`) dan `responseSchema` ketat.
   - Prompt **dilarang keras** meminta angka kalori atau makronutrisi dari LLM; Gemini hanya mengekstrak nama makanan (Indonesia & Inggris), estimasi berat gram, metode masak, dan tingkat keyakinan visual (`confidence`).
   - Output divalidasi dengan `GeminiFoodDetectionSchema` (Zod).
3. **Database Matching**: Setiap komponen dicocokkan ke API **USDA FoodData Central** (jika `USDA_FDC_API_KEY` tersedia) serta basis data terverifikasi **TKPI (Tabel Komposisi Pangan Indonesia) & USDA Reference** (`lib/nutrition-db.ts`).
4. **Kalkulasi & Status**: Nilai nutrisi dihitung murni dari `(nilai_per_100g * quantityGrams) / 100`. Setiap item diberi label status jujur (`verified_match`, `estimated_portion`, `uncertain`, atau `unavailable`).
5. **Mandatory User Review**: Pengguna dapat mengubah nama komponen, mengganti kecocokan item database, mengubah gramasi, dan menautkan ke transaksi keuangan sebelum menekan **Konfirmasi & Simpan ke Jurnal**.

---

## 5. Daftar Environment Variables

| Variabel | Sifat | Kegunaan | Perilaku Saat Kosong |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server-only | Autentikasi ke Google Gemini API (`@google/genai`) | Analisis foto AI menampilkan error jujur & mengarahkan ke mode pilih komponen database manual |
| `GEMINI_MODEL` | Server-only | Nama model vision Gemini (default `gemini-4-hydrogen`) | Fallback aman ke `gemini-4-hydrogen` |
| `USDA_FDC_API_KEY` | Server-only | Akses live ke API USDA FoodData Central | Menggunakan dataset terverifikasi TKPI + USDA lokal & menampilkan sumber secara transparan |
| `TELEGRAM_BOT_TOKEN` | Server-only | Token Bot Telegram untuk pairing & pengiriman laporan | Status integrasi menampilkan **"Menunggu konfigurasi"** |
| `TELEGRAM_WEBHOOK_SECRET` | Server-only | Verifikasi header `X-Telegram-Bot-Api-Secret-Token` | Webhook menolak request yang tidak terverifikasi |
| `WHATSAPP_ACCESS_TOKEN` | Server-only | Token akses resmi Meta WhatsApp Business Cloud API | Status integrasi menampilkan **"Menunggu konfigurasi"** |
| `WHATSAPP_PHONE_NUMBER_ID` | Server-only | ID nomor telepon bisnis WABA | Status integrasi menampilkan **"Menunggu konfigurasi"** |
| `WHATSAPP_VERIFY_TOKEN` | Server-only | Token verifikasi challenge webhook Meta | Endpoint GET webhook menolak verifikasi |
| `WHATSAPP_APP_SECRET` | Server-only | Verifikasi HMAC `X-Hub-Signature-256` webhook Meta | Webhook POST memvalidasi signature bila tersedia |
| `CRON_SECRET` | Server-only | Proteksi endpoint `/api/cron/reports` | Menolak eksekusi cron tanpa header Bearer yang cocok |
| `NEXT_PUBLIC_APP_URL` | Public | URL dasar aplikasi untuk tautan webhook & metadata | Default `http://localhost:3000` |
