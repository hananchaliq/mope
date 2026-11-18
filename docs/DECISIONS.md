# MoneyScope — Engineering Decisions Log (`docs/DECISIONS.md`)

Dokumen ini mencatat keputusan arsitektur dan rekayasa yang diambil untuk memastikan keandalan, keamanan, dan kepatuhan terhadap **Real Data Policy**.

---

## ADR-01: Pivot Database ke Firebase Auth & Cloud Firestore dengan Aturan Zero-Trust
- **Konteks**: Spesifikasi awal menyebutkan PostgreSQL/Supabase, namun pada pemeriksaan eligibilitas proyek di lingkungan runtime AI Studio (`cloudsql.CheckFeatureEligibility`), proyek belum memiliki instance Cloud SQL aktif (`NO_VALID_PROJECT`), dan pengguna telah menyetujui provisi **Firebase Authentication & Cloud Firestore**.
- **Keputusan**: Menggunakan Cloud Firestore (`ai-studio-ae3f4e82-cbb1-4de9-9b0b-94f8e2944f62`) untuk persistensi cloud lintas perangkat yang diamankan dengan `firestore.rules` (Eight Pillars Zero-Trust, setara RLS di mana setiap dokumen berada di bawah `/users/{userId}/...` dan hanya dapat diakses oleh `request.auth.uid == userId`), ditambah sinkronisasi lokal/IndexedDB untuk mode *offline queue* dan *workspace sandbox* instan.
- **Alasan**: Memastikan aplikasi benar-benar berjalan secara *end-to-end* di lingkungan preview maupun produksi tanpa kegagalan koneksi database.

## ADR-02: Definisi Eksplisit Periode Keuangan di `lib/periods.ts`
- **Konteks**: Bagian 6.3 meminta 15 periode waktu dalam zona `Asia/Jakarta` (UTC+07:00, bebas DST) dengan minggu dimulai hari **Senin**, serta definisi eksplisit untuk *3 bulan terakhir* dan *6 bulan terakhir*.
- **Keputusan**:
  - Seluruh kalkulasi tanggal mengonversi timestamp UTC ke komponen kalender `Asia/Jakarta` (`UTC + 7 jam`).
  - **Hari ini (`today`)**: `00:00:00.000` s/d `23:59:59.999` WIB pada tanggal berjalan; pembanding adalah **Kemarin** (durasi 1 hari penuh sebelumnya).
  - **7 hari terakhir (`last_7_days`) & 14 hari terakhir (`last_14_days`)**: *Rolling window* inklusif hingga akhir hari ini (`H-6 s/d H` untuk 7 hari, `H-13 s/d H` untuk 14 hari); pembanding adalah rentang 7 atau 14 hari penuh tepat sebelumnya.
  - **Minggu ini (`this_week`) & Minggu sebelumnya (`last_week`)**: *Calendar week* Senin `00:00:00` s/d Minggu `23:59:59.999` WIB.
  - **2 minggu pertama (`first_half_month`)**: Tanggal `1` s/d `14` bulan berjalan; pembanding adalah tanggal `1` s/d `14` bulan sebelumnya.
  - **2 minggu terakhir (`second_half_month`)**: Tanggal `15` s/d hari terakhir bulan berjalan (28/29/30/31); pembanding adalah tanggal `15` s/d hari terakhir bulan sebelumnya.
  - **3 bulan terakhir (`last_3_months`) & 6 bulan terakhir (`last_6_months`)**: *Rolling full calendar months* yang mencakup bulan berjalan ditambah 2 atau 5 bulan kalender penuh sebelumnya (misal: jika bulan berjalan November 2026, maka 3 bulan terakhir adalah `1 September 2026 00:00:00 WIB` s/d `30 November 2026 23:59:59.999 WIB`, dan pembandingnya adalah 3 bulan kalender penuh tepat sebelumnya yaitu `1 Juni 2026` s/d `31 Agustus 2026`).

## ADR-03: Representasi Uang Rupiah sebagai Bilangan Bulat (`number` safe integer / `bigint`)
- **Konteks**: Rupiah (IDR) tidak menggunakan pecahan sen dalam transaksi ritel sehari-hari, dan aritmatika floating-point (`0.1 + 0.2`) berisiko menghasilkan ketidakakuratan.
- **Keputusan**: Seluruh nominal disimpan sebagai bilangan bulat positif (`Math.round` / integer validation di Zod dan `is int` di `firestore.rules`). Di fungsi kalkulasi murni (`lib/finance.ts`), agregasi besar mendukung `bigint` maupun safe integer hingga `Number.MAX_SAFE_INTEGER` ($\approx 9 \times 10^{15}$ Rupiah) dan diformat dengan `Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })`.

## ADR-04: Pemisahan Ketat AI Vision vs Database Nutrisi Terverifikasi
- **Konteks**: LLM sering berhalusinasi jika diminta menebak angka kalori secara langsung dari foto.
- **Keputusan**:
  - Gemini Vision (`@google/genai`) hanya diizinkan mengembalikan JSON terstruktur berisi daftar komponen makanan yang terlihat, nama pencarian (Indonesia & Inggris), estimasi berat dalam gram, metode pengolahan (`goreng`, `rebus`, `bakar`, `mentah`, `tumis`, `kukus`), dan skor keyakinan (`confidence` 0–1).
  - Angka kalori, protein, karbohidrat, lemak, serat, dan natrium **100% dihitung dari pencocokan terhadap database nutrisi terverifikasi** (API USDA FoodData Central bila `USDA_FDC_API_KEY` dikonfigurasi, serta dataset kurasi resmi **TKPI Kementerian Kesehatan RI & USDA SR Legacy** di `lib/nutrition-db.ts` lengkap dengan kode sumber dan catatan lisensi).
  - Jika suatu item tidak ditemukan di database nutrisi, statusnya ditetapkan menjadi `unavailable` dan nilai nutrisinya `null` (tidak pernah diisi `0` palsu atau hasil karangan AI).

## ADR-05: Komponen Grafik SVG Interaktif Tanpa Dependency Tambahan
- **Konteks**: Aturan Bagian 0 poin 5 menginstruksikan pengurangan dependency dan setiap library baru wajib memiliki alasan kuat.
- **Keputusan**: Membangun komponen grafik interaktif (Grafik Arus Kas Harian & Grafik Distribusi Kategori dengan fitur klik *drill-down* serta *tooltip* aksesibel `aria-label`) menggunakan SVG murni yang di-lazy-load di sisi client, menghindari beban bundle besar dan masalah kompatibilitas React 19 pada library chart pihak ketiga.

## ADR-06: Visualisasi Grafik Laporan Chat Menggunakan Unicode Bar Presisi
- **Konteks**: Bagian 8 mengizinkan pilihan antara render gambar chart di server atau ringkasan teks dengan bar unicode sederhana untuk laporan Telegram/WhatsApp.
- **Keputusan**: Menggunakan **bar proporsional Unicode (`█` dan `░`)** di dalam pesan laporan Telegram dan WhatsApp. Pendekatan ini instan, bebas kegagalan upload media, mudah dibaca di notifikasi layar kunci HP, dan kompatibel 100% dengan template teks WhatsApp Business Cloud API.
