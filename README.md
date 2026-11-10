# MALAQBI CPMK Assistant (Chrome Extension MV3)

Ekstensi browser Google Chrome berbasis Manifest V3 dengan Side Panel dan kecerdasan buatan (Google Gemini & OpenAI) untuk mengotomasi penginputan data **Capaian Pembelajaran Mata Kuliah (CPMK)** dan **Sub-CPMK** ke sistem akademik MALAQBI Universitas Sulawesi Barat (`https://malaqbi.unsulbar.ac.id/admin/cpmk`).

---

## 🌟 Fitur Utama

1. **Otomasi Antrian Multi-Halaman Cerdas:**
   - Berjalan secara antrian otomatis (`queue`).
   - Mengisi formulir pada `/admin/cpmk/create` lalu otomatis mengirim form (klik *Simpan CPMK*).
   - Mendeteksi redirect kembali ke halaman `/admin/cpmk`, mengeklik tombol *+ Tambah CPMK*, dan melanjutkan baris antrian berikutnya secara persisten via `chrome.storage.local`.
   - Tombol kontrol fleksibel: **Mulai**, **Jeda (Pause)**, dan **Stop / Reset**.

2. **Deteksi Kolom & Deduplikasi Excel Pintar:**
   - Membaca file `.xlsx`, `.xls`, dan `.csv` langsung di sisi klien menggunakan SheetJS (`xlsx.full.min.js`).
   - **Multi-Sheet Support:** Mendukung pemilihan sheet (misal sheet `Rincian`, `Rekap_MK`, dsb).
   - **Auto-Skip Banner:** Melewati baris judul dokumen dan menemukan baris header tabel sesungguhnya.
   - **Deduplikasi Otomatis:** Menyatukan baris-baris Sub-CPMK (336 baris di sheet `Rincian` otomatis dideteksi menjadi 168 data CPMK unik) sehingga tidak terjadi error duplikasi saat disimpan ke server MALAQBI.
   - **Filter Mata Kuliah:** Memungkinkan penginputan untuk satu mata kuliah tertentu atau seluruh mata kuliah sekaligus.

3. **Mesin Pencocokan Dinamis (Multi-Akun & Lintas Prodi):**
   - Mendeteksi opsi mata kuliah dan CPL yang berbeda-beda pada setiap akun prodi/dosen di MALAQBI.
   - Mencocokkan mata kuliah berdasarkan:
     1. Kode MK dalam kurung siku `[PTI061225]`
     2. Teks lengkap opsi `[PTI061225] Aplikasi Komputer`
     3. Nama mata kuliah bersih `Aplikasi Komputer`
   - Mencocokkan radio CPL berdasarkan kode `CPL-03` / `CPL-3` / `CPL 3` maupun uraian capaian.

30. **Integrasi AI (Google Gemini & OpenAI):**
31.    - **Google Gemini:** Mendukung model generasi aktif Google AI Studio: `gemini-3.5-flash-lite` (sangat direkomendasikan, kuota hemat, tercepat & bebas kendala antrean), `gemini-3.8-flash` (Interactions API resmi), `gemini-3.6-flash`, `gemini-4-argon`, serta **Model Kustom (Manual Input)**. Model legacy yang telah dinonaktifkan Google (`gemini-2.0-flash` dan `gemini-2.5-flash`) otomatis dimigrasikan ke model aktif.
32.    - **Auto-Failover Cerdas:** Jika model mengalami lonjakan antrian pengguna (*"high demand"* / 503 / 429 / resource exhausted / no longer available), sistem secara otomatis mengalihkan koneksi ke model alternatif yang aktif dalam fallback chain dan menyinkronkan status di antarmuka.
33.    - **OpenAI:** `gpt-4o-mini` (sangat direkomendasikan & stabil), `gpt-4o`, `o3-mini`, serta dukungan **Custom Base URL** (untuk proxy lokal, Groq, OpenRouter).
   - Fitur **"Deteksi AI"** (`fa-wand-magic-sparkles`): Menganalisis sampel header dan baris data Excel secara semantik untuk memetakan kolom secara otomatis.
   - Fitur **"Tes Koneksi API"** (`fa-vial-circle-check`): Pengujian koneksi API Key langsung dari panel ekstensi dengan feedback real-time.

5. **Desain UI/UX Standar ODE Design System (ODS), Tema Maroon Unsulbar & Font Awesome:**
   - Menggunakan estetika ODS berbalut **Merah Marun Unsulbar (`#8f2430`)**, efek gradien `var(--tw-gradient-to-position)`, slate cards (`#f8fafc` / `#0f172a`), badge status hierarki, dan rounded corners (12px).
   - Standardisasi ikon antarmuka menggunakan **Font Awesome 6 Free** lokal (`lib/font-awesome.min.css` & `webfonts/`) serta aset ikon ekstensi maroon resolusi multi-tier (16px, 48px, 128px) tanpa emoji, bebas *slop*, dan teruji *zoom-proof*.

---

## 📂 Struktur Berkas

```
malaqbi-cpmk-assistant/
├── manifest.json              # Konfigurasi Manifest V3
├── background.js             # Service Worker koordinasi antrian & tab
├── content.js                # Content script otomasi DOM & form MALAQBI
├── sidepanel.html            # Antarmuka Side Panel Chrome (Font Awesome Icons)
├── sidepanel.css             # Styling berbasis ODE Design System (ODS)
├── sidepanel.js              # Logika UI, SheetJS, antrian, & API caller
├── test-extension.js         # Test suite otomatis (61 pengujian)
├── lib/
│   ├── ai_service.js         # Handler API Gemini & OpenAI
│   ├── matcher.js            # Algoritma heuristik, normalisasi & deduplikasi
│   ├── xlsx.full.min.js      # Library SheetJS parser Excel offline
│   └── font-awesome.min.css  # Webfont stylesheet Font Awesome 6
├── webfonts/                 # File font Font Awesome offline (.woff2)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 Panduan Pemasangan di Google Chrome

1. Buka browser Google Chrome.
2. Masuk ke halaman ekstensi: ketik `chrome://extensions` di address bar lalu tekan Enter.
3. Aktifkan **Developer mode** (Mode Pengembang) di pojok kanan atas.
4. Klik tombol **Load unpacked** (Muat yang belum dibongkar) di pojok kiri atas.
5. Arahkan dan pilih folder:
   `/Users/laodefardin/Dosen/webpti/malaqbi-cpmk-assistant`
6. Ekstensi **MALAQBI CPMK Assistant** akan muncul di daftar ekstensi. Pin ikon ekstensi di toolbar Chrome agar mudah diakses.

---

## 📖 Cara Penggunaan

1. **Buka Portal MALAQBI:**
   - Kunjungi `https://malaqbi.unsulbar.ac.id/admin/cpmk` (atau halaman Tambah CPMK).
2. **Buka Side Panel Ekstensi:**
   - Klik ikon **MALAQBI Assistant** di toolbar Chrome. Side Panel akan terbuka di sisi kanan jendela browser.
   - Perhatikan badge koneksi di atas: jika berwarna hijau/kuning (*Terhubung*), ekstensi sudah mendeteksi halaman MALAQBI.
3. **Atur API AI (Opsional, Direkomendasikan):**
   - Buka tab **Pengaturan & AI**.
   - Pilih provider (Google Gemini atau OpenAI).
   - Masukkan API Key Anda lalu klik tombol **"Tes Koneksi API"**.
   - Klik **"Simpan"**.
4. **Unggah File Excel:**
   - Kembali ke tab **Antrian Data**.
   - Tarik & lepas file Excel Anda (misal `Downloads/CPMK SubCPMK.xlsx`).
   - Pilih sheet yang diinginkan (default: `Rincian`).
5. **Verifikasi Pemetaan Kolom:**
   - Ekstensi akan otomatis mendeteksi kolom (Mata Kuliah, Kode MK, Kode CPMK, Deskripsi CPMK, CPL).
   - Anda juga dapat mengeklik tombol **"Deteksi AI"** untuk analisis semantik cerdas.
   - Centang **Deduplikasi Otomatis** (sangat disarankan jika file Excel memuat rincian Sub-CPMK bertingkat).
   - Centang **Lewati Otomatis jika Kode sudah ada** (menangani error SweetAlert *"The kode has already been taken"* secara otomatis).
   - Centang **Otomatis Klik "Simpan CPMK"** jika ingin form langsung dikirim otomatis.
6. **Eksekusi:**
   - Klik tombol **"Mulai Antrian"**.
   - Ekstensi akan mengisi setiap baris CPMK secara berurutan dan berpindah halaman secara otomatis.
   - Jika MALAQBI menampilkan error bahwa kode CPMK sudah terdaftar, ekstensi otomatis mengeklik tombol *"Mengerti"*, menandai data tersebut sebagai **Dilewati (Skipped)**, dan langsung beralih memproses item antrian berikutnya tanpa henti.
   - Status terperinci menampilkan metrik: **Total**, **Antri**, **Sukses**, **Dilewati**, dan **Gagal**.
   - Jika terdapat item yang sempat terhenti karena kegagalan atau false error, tombol **"Ulangi Gagal"** (`fa-rotate-right`) akan muncul otomatis untuk mengulang item tersebut dalam sekali klik.
   - Anda dapat menjeda (**Jeda**) atau menghentikan (**Stop**) kapan saja.
7. **Unduh Riwayat:**
   - Buka tab **Log** untuk melihat catatan proses atau klik **"CSV"** untuk mengekspor riwayat eksekusi.

---

## Cakupan Automated Tests

Ekstensi dilengkapi rangkaian pengujian unit dan integrasi otomatis (`test-extension.js`) dengan **137 assertions (100% Pass)**:
1. Pembacaan Excel 3 Sheet & baris data riil.
2. Deteksi header baris ke-4 dan pemetaan kolom.
3. Ekstraksi 336 baris & deduplikasi tepat ke 168 CPMK unik.
4. Pencocokan fuzzy kode/nama MK dengan 63 opsi form MALAQBI.
5. Pencocokan radio button CPL (CPL-01 s/d CPL-12).
6. Kepatuhan berkas bundle Manifest V3 & font lokal Font Awesome 6.
7. Deteksi regex error duplikasi kode SweetAlert2.
8. Akurasi counter 5 metrik status antrian.
9. Verifikasi ketiadaan karakter emoji unicode pada seluruh antarmuka.
10. Pengecualian tombol baris tabel `<button>Hapus</button>` dari deteksi error dan verifikasi pemulihan false-positive.
11. Tampilan utuh seluruh 168 data CPMK pada tabel antrian tanpa pemotongan batas 50 item dan dukungan *auto-scroll*.
12. Verifikasi tema warna merah marun Unsulbar (`#8f2430`), variabel CSS gradien (`var(--tw-gradient-to-position)`), dan palet warna ikon PNG bundle.
13. Keamanan proteksi API Key (anti-intip DOM, anti-copy/cut/drag/contextmenu, masking bullet in-memory) dan tautan resmi provider AI (Google AI Studio & OpenAI Platform).
14. Tab Pengembang & Informasi Aplikasi (Profil Laode Fardin, PTI FKIP Unsulbar, dan spesifikasi arsitektur ekstensi).
15. Dukungan Google Interactions API (`/v1beta/interactions`) & ekstraksi struktur steps/output_text.
16. Multi-Model Google Gemini aktif (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-4-argon`, manual kustom), auto-migrasi model legacy yang telah dinonaktifkan Google, serta auto-failover cerdas saat lonjakan antrean/overload (*high demand* / 503 / 429).
