# MoneyScope — AI-Powered Personal Finance & Nutrition Intelligence Platform

MoneyScope adalah Progressive Web App (PWA) manajemen keuangan pribadi dan intelijen nutrisi berbasis foto makanan yang dibangun dengan **Next.js 15 (App Router)**, **TypeScript Strict**, **Tailwind CSS v4**, **Firebase Firestore & Auth**, dan **Google Gemini Vision API (`@google/genai`)**.

---

## Fitur Utama

1. **Financial Tracking (`Rp` Integer Presisi)**
   - Quick Add transaksi dalam $\le 5$ detik (`Alt+N`, numpad cepat, auto-suggest kategori).
   - 3 jenis transaksi: **Pengeluaran**, **Pemasukan**, dan **Transfer Antar Akun Atomik** (2 leg berpasangan `transferPairId` yang tidak menggelembungkan pemasukan/pengeluaran di laporan).
   - **29 Kategori Bawaan** dengan pemisahan wajib antara **Makan Utama** (`makan-utama`) dan **Jajan & Minuman** (`jajan-minuman`).
   - Penghapusan kategori kustom dengan **dialog pemindahan wajib** (*mandatory reassignment*) agar tidak ada transaksi yatim.
   - Impor CSV dengan validasi per baris + deteksi duplikat, serta Ekspor CSV & JSON penuh.
   - **Offline Queue (IndexedDB)** untuk menyimpan transaksi saat luring dan menyinkronkannya secara idempoten (`clientId`) begitu koneksi pulih.

2. **Financial Intelligence & 15 Periode Waktu (`Asia/Jakarta`)**
   - Engine murni `lib/periods.ts` mendukung seluruh **15 periode**:
     - Jam: `hourly`, `every_2_hours`, `every_3_hours`, `every_6_hours`, `every_12_hours`
     - Harian: `daily`, `every_2_days`, `every_3_days`
     - Mingguan (Senin–Minggu): `weekly`, `biweekly`
     - Bulanan & Kuartal: `monthly`, `bimonthly`, `quarterly`, `semiannual`
     - Tahunan (mendukung tahun kabisat): `yearly`
   - Perbandingan *period-over-period* (menampilkan badge `"baru"` jika periode sebelumnya `Rp 0`, tanpa `NaN`/`Infinity`).
   - **Interactive Drill-Down**: Klik batang tanggal atau kategori pada grafik memperbarui URL query (`?date=...` / `?categoryId=...`) dan memfilter daftar transaksi secara langsung.
   - **Smart Insights Deterministik**: Berbasis rumus matematika transparan (`minDataRequired` gating + tombol `"Lihat perhitungan"`).
   - **Budget & Proyeksi Linear**: Alert 50% / 80% / 100% terdeduplikasi per siklus dan rumus proyeksi akhir periode:
     $$\text{Proyeksi} = \frac{\text{Total Pengeluaran Saat Ini}}{\text{Hari Berjalan}} \times \text{Total Hari Dalam Periode}$$

3. **Nutrition Intelligence (Gemini Vision + TKPI Kemenkes RI & USDA)**
   - Kompresi gambar di sisi klien ($\le 1280\text{px}$, EXIF/GPS otomatis dihapus demi privasi).
   - Gemini Vision (`/api/nutrition/analyze`) **hanya** mendeteksi komponen makanan dan estimasi gram (dilarang mengarang angka kalori/makro).
   - Perhitungan kalori, protein, karbohidrat, lemak, serat, gula, dan natrium dihitung **100% deterministik** dari tabel referensi terverifikasi **TKPI Kemenkes RI** dan **USDA FoodData Central** (`lib/nutrition-db.ts`).
   - Layar **Review & Koreksi Pengguna** wajib sebelum menyimpan ke Jurnal Makanan.
   - **Analitik Gabungan Keuangan $\times$ Nutrisi**: Rasio Makan Utama vs Jajan, korelasi hari *over-calorie* dengan lonjakan pengeluaran, dan **Biaya per Gram Protein (`Rp / g protein`)** dari transaksi yang ditautkan.

4. **Automated Reporting (Telegram Bot & WhatsApp Cloud API)**
   - Pairing Telegram satu kali dengan kode 10 menit (disimpan sebagai SHA-256 hash) via `/start <kode>`.
   - Webhook `/api/webhooks/telegram` terproteksi `X-Telegram-Bot-Api-Secret-Token`.
   - Dukungan resmi **WhatsApp Business Cloud API (Meta)** dengan template pesan + verifikasi HMAC `X-Hub-Signature-256`.
   - Endpoint terjadwal `/api/cron/reports` dengan `Authorization: Bearer <CRON_SECRET>` dan log pengiriman idempoten.

---

## Cara Menjalankan Secara Lokal

1. **Instal dependensi**:
   ```bash
   npm install
   ```

2. **Salin `.env.example` ke `.env.local`** dan isi variabel lingkungan yang diperlukan:
   ```bash
   cp .env.example .env.local
   ```

3. **Jalankan server pengembangan (Port 3000)**:
   ```bash
   npm run dev
   ```

4. **Jalankan Unit Tests (`node:test`)**:
   ```bash
   npx tsx --test lib/periods.test.ts lib/finance.test.ts firestore.rules.test.ts
   ```

5. **Jalankan Typecheck, Lint, dan Production Build**:
   ```bash
   npm run lint
   npm run build
   ```

---

## Konfigurasi Integrasi Eksternal

| Variabel Lingkungan | Fungsi | Cara Mendapatkan |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Analisis komponen foto makanan di server | [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL` | Nama model Gemini (default: `gemini-4-hydrogen`) | Opsional di `.env` |
| `USDA_FDC_API_KEY` | Pencarian live USDA FoodData Central | [USDA FDC API Key](https://fdc.nal.usda.gov/api-key-signup.html) |
| `TELEGRAM_BOT_TOKEN` | Mengirim laporan & menerima `/start <kode>` | Chat `@BotFather` di Telegram $\rightarrow$ `/newbot` |
| `TELEGRAM_BOT_USERNAME` | Menampilkan tautan langsung ke bot | Username bot dari `@BotFather` |
| `TELEGRAM_WEBHOOK_SECRET` | Validasi header `X-Telegram-Bot-Api-Secret-Token` | String acak 32+ karakter |
| `WHATSAPP_ACCESS_TOKEN` | Mengirim template WhatsApp Cloud API | Meta for Developers $\rightarrow$ WhatsApp $\rightarrow$ API Setup |
| `WHATSAPP_PHONE_NUMBER_ID` | ID nomor pengirim WhatsApp Business | Meta for Developers $\rightarrow$ WhatsApp $\rightarrow$ API Setup |
| `WHATSAPP_APP_SECRET` | Validasi HMAC `X-Hub-Signature-256` webhook | Meta App Dashboard $\rightarrow$ App Settings $\rightarrow$ Basic |
| `CRON_SECRET` | Mengamankan endpoint `/api/cron/reports` | String acak minimal 16 karakter |
