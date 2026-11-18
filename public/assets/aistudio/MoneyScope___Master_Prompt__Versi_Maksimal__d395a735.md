# MoneyScope — Master Prompt (Versi Maksimal)

*AI-Powered Personal Finance & Nutrition Intelligence Platform*

Prompt ini siap ditempel ke AI code agent (Claude Code, Cursor, dll). Struktur: peran → misi → aturan keras → keputusan teknis → data model → fitur per modul → fase kerja dengan acceptance criteria → definition of done.

---

## 0. PERAN & CARA KERJA

Kamu adalah tim gabungan: Senior Full-Stack Engineer, Database Architect, Product/UI-UX Designer, dan AI Integration Engineer. Bangun **MoneyScope**: PWA personal finance yang bisa diinstal di Android, iOS, dan desktop, dengan modul analisis nutrisi dari foto makanan dan laporan otomatis via Telegram/WhatsApp.

**Cara kerja (wajib):**

1. Sebelum menulis kode, baca seluruh prompt ini lalu hasilkan `docs/ARCHITECTURE.md` (struktur folder, ERD, alur data, daftar env var, keputusan teknis + alasannya). Tunggu tidak perlu; lanjut kerja setelah dokumen dibuat.
2. Kerjakan per fase (Bagian 14). Di akhir tiap fase: jalankan lint, typecheck, test, dan build; laporkan hasilnya jujur (apa yang lulus, apa yang belum). Jangan lanjut fase berikutnya jika fase sekarang gagal.
3. Jika ada ambiguitas kecil, ambil keputusan terbaik, catat di `docs/DECISIONS.md`, lalu lanjut. Hanya berhenti bertanya jika menyangkut credential yang memang tidak mungkin kamu miliki.
4. Jangan klaim sesuatu "sudah berfungsi" tanpa pernah menjalankannya. Bedakan: *ditulis*, *dites otomatis*, *dites manual*, *butuh credential*.
5. Kurangi dependency. Setiap library baru harus punya alasan tertulis.

---

## 1. VISI PRODUK

MoneyScope menjawab empat pertanyaan: **ke mana uangku pergi, kapan, kebiasaan apa yang paling menguras uang, dan bagaimana pola makanku.**

Empat pilar:

1. **Financial Tracking**: catat pemasukan/pengeluaran/transfer dengan cepat (target: ≤ 5 detik dari buka app sampai tersimpan).
2. **Financial Intelligence**: grafik dan insight yang dihitung dari data nyata.
3. **Nutrition Intelligence**: foto makanan → komponen → cocokkan ke database nutrisi terverifikasi → estimasi nutrisi.
4. **Automated Reporting**: laporan terjadwal ke Telegram/WhatsApp.

**Bukan tujuan (non-goals):** saran medis/diagnosis, integrasi bank/open banking, investasi/trading, multi-user/keluarga (boleh jadi roadmap, jangan dibangun sekarang).

---

## 2. ATURAN KERAS (TIDAK BOLEH DILANGGAR)

### 2.1 Real Data Policy

DILARANG: transaksi dummy, statistik hardcoded, analitik palsu, nilai nutrisi karangan, respons API palsu, status koneksi palsu, "AI recognition" palsu, fallback nutrisi hasil tebakan LLM.

- Database kosong → empty state yang ramah + CTA tambah data pertama.
- API gagal → pesan error jelas, bisa dicoba ulang, tanpa angka palsu.
- Integrasi belum dikonfigurasi → status **"Belum terhubung"** / **"Menunggu konfigurasi"**.
- Data tidak tersedia → tampilkan "Tidak tersedia", bukan angka kira-kira.
- Seed/mock data hanya boleh ada di `/supabase/seed.dev.sql` dan `/tests/fixtures`, tidak pernah ikut build production, dan harus diberi guard (`NODE_ENV !== 'production'`).

### 2.2 Keamanan

- Tidak ada secret di client bundle: Gemini key, Supabase **service role** key, Telegram bot token, WhatsApp token, USDA key. Hanya `NEXT_PUBLIC_SUPABASE_URL` dan anon key yang boleh publik.
- Semua panggilan API eksternal dari server (Route Handler / Server Action).
- RLS aktif di **setiap** tabel berisi data pribadi. Tes RLS wajib (lihat 12).
- `localStorage` bukan database utama. IndexedDB hanya untuk antrian offline.

### 2.3 Kejujuran nutrisi

- Hasil visual = **estimasi**, bukan pengukuran lab. Setiap layar yang menampilkan nutrisi harus memuat label "Estimasi" dan sumber data.
- Tidak ada klaim kesehatan atau rekomendasi medis.

### 2.4 Kualitas

- TypeScript strict, tanpa `any` yang tidak dijustifikasi.
- Tidak ada `console.log` sisa, tidak ada TODO tanpa issue.

---

## 3. KEPUTUSAN TEKNIS

| Area | Keputusan |
| --- | --- |
| Framework | Next.js (App Router, versi stabil terbaru saat implementasi), React, TypeScript strict |
| UI | Tailwind CSS v4, shadcn/ui, Lucide, Motion (Framer Motion) |
| Form & validasi | React Hook Form + Zod; **skema Zod yang sama dipakai client & server** |
| Chart | Recharts (lazy-loaded per halaman) |
| Data fetching | Server Components untuk baca; Server Actions/Route Handlers untuk tulis; TanStack Query hanya jika benar-benar perlu (mis. optimistic update di quick add) |
| Backend | Supabase (Postgres, Auth, Storage, RLS), migrations via Supabase CLI |
| AI | Google Gemini via SDK resmi (`@google/genai`); nama model dibaca dari env `GEMINI_MODEL`, **jangan hardcode**; cek dokumentasi resmi untuk model vision yang tersedia saat implementasi |
| Nutrisi | USDA FoodData Central API (wajib) + dataset komposisi pangan Indonesia (TKPI) jika bisa diakses secara legal; simpan sumber & lisensinya |
| Jadwal laporan | Vercel Cron memanggil endpoint terproteksi `CRON_SECRET` (atau Supabase pg\_cron); idempotent |
| PWA | Manifest + Service Worker (Serwist atau Workbox, pilih satu), Background Sync dengan fallback untuk Safari/iOS |
| Test | Vitest (unit), Playwright (E2E), pgTAP atau skrip SQL (RLS) |
| Deploy | Vercel + Supabase |

**Uang:** simpan sebagai `bigint` dalam satuan Rupiah (IDR tidak punya desimal bermakna). Dilarang pakai `float`. Format tampilan dengan `Intl.NumberFormat('id-ID', {style:'currency', currency:'IDR', maximumFractionDigits:0})`.

**Waktu:** simpan `timestamptz` (UTC) + kolom `occurred_at`. Semua perhitungan periode (hari/minggu/bulan) memakai zona **Asia/Jakarta** di sisi database (`AT TIME ZONE 'Asia/Jakarta'`), bukan zona browser. Minggu dimulai **Senin**. Tampilan tanggal: `DD MMMM YYYY`, bahasa Indonesia.

---

## 4. DESAIN & PENGALAMAN VISUAL

Terasa seperti fintech premium, bukan template dashboard AI generik. Referensi kualitas (jangan disalin): Linear, Raycast, Revolut, Apple Wallet, Stripe Dashboard.

- **Gaya:** minimalis, elegan, data-centric, tipografi bersih, permukaan kaca halus, hierarki visual kuat, spacing konsisten (skala 4/8 px).
- **Warna (design tokens via CSS variables):** background charcoal/warm neutral; surface sedikit lebih terang; primary emerald/muted green; accent lime (dipakai hemat); income = hijau; expense = merah redup; netral = slate/gray. Kontras minimal WCAG AA.
- **Tema:** dark, light, system. Tidak ada flash saat load (set class sebelum hydrate).
- **Layout:** mobile-first; bottom navigation di mobile, sidebar di desktop; safe-area iOS; target sentuh ≥ 44 px.
- **Animasi (terukur):** transisi halaman, counter angka animasi, transisi chart, hover halus, transisi modal/sheet, skeleton loading, progress animasi. Hormati `prefers-reduced-motion`. Anggarkan performa untuk HP kelas menengah (tanpa blur berat berlapis, animasikan `transform`/`opacity` saja).
- **Aksesibilitas:** label form, fokus terlihat, navigasi keyboard, `aria-*` pada chart interaktif, warna bukan satu-satunya pembeda (income/expense juga pakai ikon/tanda +/−).
- Sediakan komponen: empty state, error state, skeleton, toast, confirm dialog destruktif.

---

## 5. DATA MODEL (PostgreSQL)

Semua PK `uuid default gen_random_uuid()`. Semua tabel punya `created_at`, `updated_at` (trigger), dan `user_id uuid references auth.users` (kecuali tabel referensi publik). Index pada `(user_id, occurred_at desc)` dan kolom filter utama.

**Tabel minimal** (kolom inti; tambahkan yang perlu):

- `profiles`: id (=auth.uid), display\_name, avatar\_path, locale default `id-ID`, timezone default `Asia/Jakarta`.
- `accounts`: name, type (cash/bank/ewallet/other), opening\_balance bigint, currency default IDR, is\_archived. Saldo = opening\_balance + Σ transaksi (view/function, bukan kolom yang bisa menyimpang).
- `categories`: name, kind (income/expense), parent\_id (subkategori), icon, color, is\_system, sort\_order. Unik per (user\_id, kind, parent\_id, lower(name)).
- `transactions`: type (income/expense/transfer), amount bigint **> 0** (check constraint), account\_id, to\_account\_id (transfer), category\_id, description, merchant, payment\_method, occurred\_at, notes, attachment\_path, `client_id uuid` (unik per user, untuk idempotensi sinkronisasi offline), deleted\_at (soft delete opsional).
- `budgets` & `budget_periods`: scope (total/kategori), period (weekly/monthly/custom), limit\_amount bigint, alert\_thresholds int\[\] default `{50,80,100}`, start/end per period.
- `food_logs`: meal\_type (breakfast/lunch/dinner/snack/drinks), eaten\_at, photo\_path, transaction\_id (nullable, FK ke transaksi terkait), user\_confirmed bool.
- `food_items`: food\_log\_id, name\_detected, name\_confirmed, quantity\_grams, serving\_unit, source\_match\_id, match\_status (`verified_match` | `estimated_portion` | `uncertain` | `unavailable`), confidence numeric(3,2), calories, protein\_g, carbs\_g, fat\_g, fiber\_g null, sodium\_mg null.
- `nutrition_analyses`: food\_log\_id, model\_name, model\_version, raw\_response jsonb (untuk audit), status, error, latency\_ms.
- `nutrition_sources`: code (usda\_fdc, tkpi, …), name, url, license\_note, version/retrieved\_at.
- `report_preferences`: report\_type (financial/nutrition), frequency (daily/weekly/biweekly/monthly/quarterly/custom\_cron), send\_time, channel, is\_enabled, timezone.
- `integrations`: provider (telegram/whatsapp), status (`not_connected` | `pending` | `connected` | `error`), external\_id (chat\_id / nomor), secrets terenkripsi (Supabase Vault / `pgsodium`; **tidak pernah dikirim ke client**), verified\_at, last\_error.
- `scheduled_reports`: preference\_id, period\_start, period\_end, status (queued/sent/failed), payload\_snapshot jsonb, sent\_at, error, **unique(preference\_id, period\_start, period\_end)** agar tidak terkirim ganda.
- `notifications`: type, title, body, read\_at, dedupe\_key (unik per user, agar threshold budget tidak spam).
- `user_settings`: theme, default\_account\_id, default\_meal\_reminders, dll.
- `audit_logs`: action, entity, entity\_id, metadata jsonb, ip\_hash (operasi penting: hapus akun, ubah integrasi, kirim laporan, export).

**RLS pola standar:** `using (user_id = auth.uid()) with check (user_id = auth.uid())` untuk select/insert/update/delete. Storage bucket (`attachments`, `food-photos`) **privat**, path `user_id/uuid.ext`, policy berdasar prefix folder, akses lewat signed URL berumur pendek.

**Integritas:** transfer dibuat atomik (satu RPC/transaction DB, dua sisi konsisten). Constraint: transfer tidak boleh ke akun yang sama; kategori harus bertipe sama dengan transaksi.

---

## 6. MODUL KEUANGAN

### 6.1 Transaksi

Quick add (FAB di semua halaman utama): keypad nominal dengan format Rupiah otomatis, toggle income/expense/transfer, kategori terbaru + saran berdasar histori (frekuensi + jam), akun default, tanggal/jam default sekarang (Asia/Jakarta). Lengkap: edit, hapus (dengan konfirmasi + undo singkat), detail, lampiran foto struk, pencarian teks, filter (tanggal, kategori, akun, tipe, rentang nominal), infinite list/pagination server-side, **export CSV**, **import CSV** (pratinjau, validasi baris per baris, laporan error per baris, deteksi duplikat, mapping kolom, batas ukuran).

### 6.2 Kategori

Seed **kategori default per user saat onboarding** (bukan data transaksi): Makanan (Sarapan, Makan siang, Makan malam, **Jajan**, Camilan, Minuman, Kopi, Fast food, Restoran), Kebutuhan (Belanja, Transportasi, Pendidikan, Kesehatan, Tagihan, Kebutuhan pribadi), Hiburan (Game, Entertainment, Subscription, Hobi), Lainnya (Sedekah, Hadiah, Pengeluaran lainnya); pemasukan: Gaji, Uang saku, Freelance, Bisnis, Investasi, Hadiah, Pemasukan lainnya. User bisa tambah/edit/hapus. **Makan dan Jajan harus tetap kategori terpisah.** Menghapus kategori yang punya transaksi → wajib pilih kategori pengganti (reassign), tidak boleh memutus data.

### 6.3 Periode & Analitik

Implementasikan sebagai **satu modul murni** `lib/periods.ts` (fungsi murni, teruji unit) yang menghasilkan `{start, end, previousStart, previousEnd, kind: 'rolling' | 'calendar'}`.

Periode: Hari ini, Kemarin, 7 hari terakhir *(rolling)*, Minggu ini, Minggu sebelumnya *(calendar, Senin–Minggu)*, 14 hari terakhir *(rolling)*, 2 minggu pertama *(tgl 1–14 bulan berjalan)*, 2 minggu terakhir *(tgl 15–akhir bulan)*, Bulan ini, Bulan sebelumnya, 3 bulan terakhir, 6 bulan terakhir *(rolling bulan penuh; definisikan eksplisit di DECISIONS.md)*, Tahun ini, Tahun sebelumnya, Custom range.

Aturan: periode pembanding = rentang sama panjang tepat sebelumnya (untuk calendar → periode kalender sebelumnya). Tangani bulan 28/29/30/31 hari, pergantian tahun, dan DST-free Asia/Jakarta. **Wajib punya tes unit untuk setiap periode, termasuk tepi bulan & tahun kabisat.**

Untuk setiap periode tampilkan: total pemasukan, total pengeluaran, net cash flow, jumlah transaksi, rata-rata pengeluaran harian (bagi dengan jumlah hari periode, bukan jumlah hari bertransaksi; tuliskan rumusnya), pengeluaran terbesar, kategori dominan, perbandingan vs periode sebelumnya (% dan selisih; jika pembanding 0 tampilkan "baru", bukan ∞), grafik harian pemasukan & pengeluaran, distribusi kategori.

**Drill-down:** klik kategori di chart → daftar transaksi kategori itu di periode itu; klik tanggal → transaksi tanggal itu. State filter disimpan di URL (search params) agar bisa di-share/refresh.

Agregasi dilakukan di database (SQL view/RPC dengan `date_trunc` zona Jakarta), bukan menarik semua baris ke client.

### 6.4 Smart Insights

Engine berbasis aturan (deterministik), bukan LLM. Tiap insight = `{id, severity, text, evidence:{metric, value, comparison}, minDataRequired}`. **Insight hanya muncul jika data cukup** (mis. butuh ≥ 2 periode dengan ≥ N transaksi); jika tidak, tidak tampil apa-apa. Contoh aturan: pengeluaran Makanan naik > X% vs minggu lalu; kategori terbesar bulan ini; jam transaksi terbanyak (Asia/Jakarta); pemasukan bulan ini < bulan lalu; hari paling boros dalam seminggu. Setiap insight punya tombol "Lihat perhitungan" yang menampilkan angka sumber.

### 6.5 Budget

Budget bulanan/mingguan/per kategori/khusus. Tampilkan limit, terpakai, sisa, % terpakai, **proyeksi** (rumus linear: terpakai ÷ hari berjalan × total hari; tampilkan rumusnya, tandai sebagai proyeksi). Threshold default 50/80/100% + status "melewati batas", semuanya bisa diatur user. Notifikasi dibuat saat transaksi disimpan (trigger/RPC) dengan `dedupe_key` per budget-period-threshold supaya tidak dobel. Notifikasi in-app + opsional ke Telegram.

### 6.6 Akun

Multi-akun (tunai, bank, e-wallet). Saldo dihitung dari data. Transfer antar akun tidak dihitung sebagai income/expense di analitik.

---

## 7. NUTRITION INTELLIGENCE

### 7.1 Pipeline analisis foto (server-side)

1. **Client:** ambil dari kamera/galeri, kompres & resize (sisi terpanjang ≤ \~1280 px, JPEG/WebP), hapus metadata EXIF/GPS, validasi tipe & ukuran (mis. ≤ 5 MB), opsi isi porsi/catatan.
2. **Upload:** ke bucket privat `food-photos`; buat `food_logs` status `analyzing`.
3. **Server → Gemini:** kirim gambar dengan **structured output (JSON schema)**. Diminta HANYA: daftar komponen terlihat, nama makanan (Indonesia + Inggris untuk pencarian), estimasi berat gram + rentang, metode masak (goreng/rebus/…), confidence 0–1, dan catatan ketidakpastian. **Prompt ke Gemini dilarang meminta angka kalori/makro.** Validasi output dengan Zod; jika tidak valid → retry terbatas → gagal dengan jujur.
4. **Pencocokan database:** untuk tiap komponen, cari di USDA FDC (dan TKPI bila ada) memakai nama + metode masak. Pilih kandidat dengan skor kecocokan (nama, kategori, metode masak); simpan `source_match_id`. Hitung nutrisi = nilai per 100 g × gram/100 dari data sumber.
5. **Status per item:** `verified_match` (cocok skor ≥ ambang, data lengkap), `estimated_portion` (cocok tapi berat hasil estimasi visual — **ini default untuk hampir semua porsi dari foto**), `uncertain` (confidence rendah / kandidat ambigu → minta konfirmasi user), `unavailable` (tidak ada data → tampil "Data nutrisi tidak tersedia", kolom angka null).
6. **Review wajib:** layar hasil memungkinkan user mengganti nama, memilih kandidat lain, mengubah gram/porsi, menghapus/menambah komponen. Nutrisi dihitung ulang dari database saat diedit. Tidak tersimpan ke jurnal sebelum user konfirmasi (draft boleh disimpan).
7. **Simpan:** `nutrition_analyses` (model, versi, raw response), `food_items` (sumber & confidence), tautan opsional ke transaksi.

**Kegagalan:** Gemini/USDA down, kuota habis, gambar bukan makanan, timeout → pesan jelas + tombol coba lagi + opsi input manual (user mengetik nama & gram, nutrisi tetap dari database). **Tidak ada angka dari LLM sebagai pengganti.** Terapkan rate limit per user dan batas harian analisis.

### 7.2 Food Journal & Nutrition Dashboard

Waktu makan: Breakfast, Lunch, Dinner, Snack, Drinks (makan utama dibedakan dari jajan). Dashboard: kalori, protein, karbo, lemak, serat, sodium harian; nutrisi per waktu makan; rata-rata mingguan; distribusi bulanan; riwayat makanan; makanan paling sering. Nilai null (tidak tersedia) **tidak dihitung sebagai 0**: tampilkan cakupan data ("nilai dihitung dari 4 dari 5 item"). Footer tetap: "Estimasi berdasarkan foto & database \<sumber>; bukan saran medis."

Tautan dengan keuangan: saat membuat transaksi Makanan, user bisa melampirkan/menautkan food log (dan sebaliknya). Contoh: Rp18.000 makan siang ↔ nasi, ayam goreng, bayam ↔ estimasi nutrisi ↔ waktu ↔ jenis waktu makan.

### 7.3 Analisis gabungan (keuangan × nutrisi)

Biaya makan rata-rata per hari; total jajan sebulan; perbandingan biaya sarapan/siang/malam; **biaya per gram protein** (hanya dari food log yang tertaut transaksi **dan** protein tersedia; tampilkan jumlah sampel); makanan paling sering; perbandingan pengeluaran makanan antar minggu. Setiap kartu punya "Cara menghitung". Tanpa klaim kesehatan.

---

## 8. LAPORAN TELEGRAM & WHATSAPP

### Telegram

- **Pairing aman:** app membuat kode sekali pakai (acak, kedaluwarsa 10 menit, disimpan hash-nya). User mengirim `/start <kode>` ke bot → webhook memverifikasi `X-Telegram-Bot-Api-Secret-Token`, mencocokkan kode, menyimpan `chat_id`, status `connected`.
- Status `connected` **hanya** setelah webhook pairing benar-benar sukses; "Test connection" memanggil Bot API (`getMe`/kirim pesan uji) dan menampilkan hasil nyata.
- Perintah bot dasar: `/start`, `/status`, `/stop`. Hormati blokir bot oleh user (tandai `error`/`not_connected` saat API membalas 403).

### WhatsApp

- Hanya **WhatsApp Business Cloud API** atau provider resmi. **Dilarang** WhatsApp Web scraping/automasi tak resmi.
- Jelaskan di UI: butuh nomor bisnis & akun WABA, pesan di luar jendela 24 jam harus memakai **template yang disetujui**; sediakan template laporan (harian/mingguan/bulanan) dan contoh variabelnya. Verifikasi webhook Meta dengan signature (`X-Hub-Signature-256`).
- Jika credential belum diisi → status "Menunggu konfigurasi" dengan panduan langkah.

### Penjadwalan & isi

Frekuensi: harian, mingguan, tiap 2 minggu, bulanan, tiap 3 bulan, custom (cron sederhana + validasi). Aktif/nonaktif per laporan & per kanal. Jam kirim & zona waktu bisa diatur.

- **Financial report:** pemasukan, pengeluaran, saldo bersih, kategori terbesar, pengeluaran makanan, jajan, perbandingan periode, insight.
- **Nutrition report:** total estimasi kalori, protein, karbo, lemak, ringkasan waktu makan, frekuensi makan vs jajan (+ label "estimasi").
- Semua angka dari database user, dihitung dengan modul yang sama dengan dashboard (satu sumber kebenaran).
- **Preview** sebelum kirim; tombol: Test connection, Send test report, Send now, Disconnect. Disconnect menghapus secret & chat\_id.
- Job: cron → pilih preferensi yang jatuh tempo (berdasar zona user) → buat `scheduled_reports` (unik per periode, cegah dobel) → kirim → catat status/error → retry dengan backoff terbatas. Laporan gagal tampil di UI Reports.

Grafik di chat opsional: render gambar chart di server; jika tidak, ringkasan teks dengan bar unicode sederhana. Pilih salah satu dan catat.

---

## 9. HALAMAN APLIKASI

1. Landing, 2) Auth (email+password, magic link/Google via Supabase; reset password), 3) Onboarding (nama, akun pertama + saldo awal, kategori default, budget opsional, izin notifikasi — semua bisa dilewati), 4) Dashboard, 5) Transaksi, 6) Tambah Transaksi, 7) Analitik, 8) Kategori, 9) Budget, 10) Food Journal, 11) AI Food Analysis, 12) Nutrition Dashboard, 13) Reports, 14) Integrations, 15) Accounts, 16) Settings, 17) Profile (termasuk ekspor data & hapus akun).

Setiap halaman: breadcrumb/judul jelas, state loading/empty/error, dan jalur kembali yang konsisten. Route terproteksi via middleware; redirect tepat setelah login.

---

## 10. PWA & OFFLINE

- Manifest lengkap (nama, short\_name, ikon maskable 192/512, theme/background color, `display: standalone`, `lang: id`), splash, halaman offline, install prompt (`beforeinstallprompt` di Android/desktop; panduan "Add to Home Screen" untuk iOS Safari).
- **Cache aman:** precache hanya aset statis (JS/CSS/font/ikon). **Jangan cache respons API/halaman berisi data keuangan atau pribadi di cache bersama**; gunakan `NetworkOnly`/`no-store` untuk request ber-auth. Bersihkan cache & IndexedDB saat logout.
- **Antrian offline:** catat transaksi ke IndexedDB dengan `client_id`, tampilkan status "Menunggu sinkron", sinkron saat online (Background Sync bila ada; fallback: sinkron saat app dibuka/`online` event). Server idempoten via `client_id` unik. Konflik & error ditampilkan, tidak dibuang diam-diam. Cakupan offline: **hanya pencatatan transaksi**; fitur lain menampilkan state "butuh koneksi".
- Update service worker: banner "Versi baru tersedia" dengan tombol muat ulang.
- Progressive enhancement: deteksi fitur, jangan asumsikan semua browser identik.

---

## 11. KEAMANAN & PRIVASI

Auth + sesi aman (cookie httpOnly via `@supabase/ssr`), validasi input server-side (Zod) di setiap endpoint/action, rate limiting (login, analisis AI, kirim laporan, import), pembatasan upload (tipe MIME dicek dari konten, ukuran, nama file di-generate), CSP & security headers, CSRF-aware untuk Route Handler, verifikasi signature semua webhook, secret terenkripsi untuk token integrasi, audit log operasi penting, log error tanpa data sensitif (jangan log nominal/isi transaksi/token). Hak pengguna: hapus transaksi, foto makanan, **hapus akun beserta seluruh data & file storage** (proses terverifikasi, dengan konfirmasi ketik ulang), ekspor seluruh data (CSV/JSON). Halaman Privasi menjelaskan data apa yang dikirim ke Gemini/USDA (foto makanan, nama makanan; bukan data keuangan).

---

## 12. PENGUJIAN

- **Unit (Vitest):** `periods.ts` (semua periode + tepi), kalkulasi saldo/budget/proyeksi/insight, pencocokan & kalkulasi nutrisi, parser CSV, formatter Rupiah.
- **RLS:** tes dengan dua user berbeda — user B tidak bisa select/insert/update/delete data user A di setiap tabel & bucket.
- **Integrasi:** Route Handler dengan Supabase lokal; klien Gemini/USDA/Telegram/WhatsApp dipakai lewat adapter agar bisa diganti **fake hanya di test** (bukan di runtime production).
- **E2E (Playwright):** daftar → onboarding → tambah transaksi → lihat dashboard berubah → filter periode & drill-down → buat budget & picu notifikasi → import CSV → analisis foto (dengan adapter test) → edit hasil → simpan → tautkan transaksi → konfigurasi laporan & preview → mode offline: catat transaksi, kembali online, tersinkron tanpa duplikat → hapus akun.
- Lighthouse PWA & performa (target: LCP < 2,5 dtk di mobile mid-range emulasi; PWA installable), axe untuk aksesibilitas.

---

## 13. STRUKTUR & ENV

Saran struktur: `app/(marketing)`, `app/(auth)`, `app/(app)/…`, `app/api/…` (webhook, cron), `lib/` (periods, money, insights, nutrition, adapters), `components/`, `supabase/migrations`, `supabase/seed.dev.sql`, `tests/`, `docs/`.

Env (buat `.env.example` lengkap + validasi saat boot dengan Zod, error jelas jika hilang): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `USDA_FDC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`. Fitur yang envnya kosong otomatis menampilkan "Menunggu konfigurasi", bukan crash.

---

## 14. FASE KERJA & ACCEPTANCE CRITERIA

**Phase 1 — Fondasi.** Setup project, design tokens & komponen dasar, tema, auth, migrations + RLS semua tabel, PWA dasar (manifest, SW, ikon, installable). ✅ *Selesai jika:* user bisa daftar/login/logout, tes RLS lulus, app lolos cek installable.

**Phase 2 — Keuangan inti.** Akun, kategori, CRUD transaksi, quick add, filter/pencarian, CSV import/export, dashboard + chart interaktif dari DB. ✅ *Selesai jika:* tambah transaksi → dashboard & grafik berubah; empty state benar saat kosong; `periods.ts` lulus semua tes.

**Phase 3 — Analitik & budget.** Semua periode, perbandingan, drill-down, insight engine, budget + notifikasi. ✅ *Selesai jika:* tiap periode menghasilkan angka yang cocok dengan hitungan manual pada fixture tes; insight tidak muncul saat data kurang.

**Phase 4 — Nutrisi.** Upload & kompresi foto, adapter Gemini (structured output), adapter USDA/TKPI, pencocokan, layar review/edit, food journal, nutrition dashboard, tautan ke transaksi, analisis gabungan. ✅ *Selesai jika:* alur foto → review → simpan berjalan; kegagalan API menampilkan error jujur; tidak ada angka tanpa sumber.

**Phase 5 — Laporan.** Pairing Telegram, integrasi WhatsApp Cloud API, preferensi, preview, cron + idempotensi, riwayat/status. ✅ *Selesai jika:* pairing Telegram nyata berhasil (jika token tersedia), laporan tidak terkirim ganda, status akurat saat credential kosong.

**Phase 6 — Pengerasan.** Antrian offline + sync, audit keamanan (cek semua poin Bagian 11), optimasi performa, polish responsif & aksesibilitas, E2E penuh, deploy Vercel + Supabase, dokumentasi setup. ✅ *Selesai jika:* semua tes hijau, Lighthouse memenuhi target, `README` bisa diikuti dari nol sampai deploy.

---

## 15. DEFINITION OF DONE & FORMAT LAPORAN AKHIR

Selesai hanya jika: semua fitur terhubung ke database & API nyata; tidak ada data/fungsi palsu; RLS & keamanan terverifikasi; E2E alur utama lulus; typecheck/lint/build bersih; `.env.example`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` ada.

Laporan akhir wajib berisi tabel jujur: **Fitur → status (Berfungsi & teruji / Berfungsi, belum teruji otomatis / Menunggu credential / Belum dibuat) → bukti (nama tes/langkah verifikasi)**, plus daftar keterbatasan yang diketahui. Jika credential eksternal belum tersedia: integrasi dibuat dengan benar dan UI menampilkan **"Menunggu konfigurasi"** — jangan pernah berpura-pura sudah berjalan.

> **Target akhir:** MoneyScope — platform finance & nutrition intelligence yang benar-benar bisa dipakai tiap hari, bukan dashboard cantik tanpa isi.
