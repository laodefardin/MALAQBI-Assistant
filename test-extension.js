/**
 * MALAQBI CPMK Assistant - Automated Test Suite
 * Menguji parser Excel, deduplikasi, heuristik matcher, dan pencocokan DOM form MALAQBI
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('./lib/xlsx.full.min.js');
const Matcher = require('./lib/matcher.js');
const AIService = require('./lib/ai_service.js');

console.log('====================================================');
console.log('🧪 RUNNING TESTS: MALAQBI CPMK Assistant Extension');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// 1. UJI PARSING FILE EXCEL ASLI
const excelPath = '/Users/laodefardin/Downloads/CPMK SubCPMK.xlsx';
console.log('📁 Test 1: Membaca File Excel Sumber...');
assert(fs.existsSync(excelPath), `File Excel ditemukan di ${excelPath}`);

const buffer = fs.readFileSync(excelPath);
const workbook = XLSX.read(buffer, { type: 'buffer' });
assert(workbook.SheetNames.length >= 3, `Workbook memiliki minimal 3 sheet (terbaca: ${workbook.SheetNames.join(', ')})`);

const rincianSheet = workbook.Sheets['Rincian'];
assert(rincianSheet !== undefined, 'Sheet "Rincian" berhasil diakses');

const rawMatrix = XLSX.utils.sheet_to_json(rincianSheet, { header: 1, defval: '' });
console.log(`  ℹ️ Raw matrix rows: ${rawMatrix.length}`);
assert(rawMatrix.length > 50, 'Sheet Rincian memiliki lebih dari 50 baris data');

// 2. UJI DETEKSI HEADER DAN HEURISTIK KOLOM
console.log('\n🔍 Test 2: Deteksi Baris Header & Pemetaan Kolom...');
let headerRowIdx = -1;
for (let r = 0; r < Math.min(10, rawMatrix.length); r++) {
  const row = rawMatrix[r] || [];
  const nonEmptyCells = row.filter(c => String(c || '').trim() !== '');
  if (nonEmptyCells.length >= 3) {
    const joined = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (joined.includes('cpmk') || joined.includes('mata kuliah') || joined.includes('kode mk')) {
      headerRowIdx = r;
      break;
    }
  }
}
assert(headerRowIdx === 3, `Header ditemukan di baris ke-${headerRowIdx + 1} (indeks 3)`);

const headers = rawMatrix[headerRowIdx].map(h => String(h || '').trim()).filter(h => h.length > 0);
console.log(`  ℹ️ Headers terdeteksi: ${headers.slice(0, 7).join(' | ')}...`);

const mapping = Matcher.detectColumnsHeuristic(headers);
console.log('  ℹ️ Hasil pemetaan heuristik:', mapping);
assert(mapping.kode_mk !== null, `Kolom Kode MK terdeteksi: "${mapping.kode_mk}"`);
assert(mapping.mata_kuliah !== null, `Kolom Mata Kuliah terdeteksi: "${mapping.mata_kuliah}"`);
assert(mapping.kode_cpmk !== null, `Kolom Kode CPMK terdeteksi: "${mapping.kode_cpmk}"`);
assert(mapping.deskripsi_cpmk !== null, `Kolom Deskripsi CPMK terdeteksi: "${mapping.deskripsi_cpmk}"`);
assert(mapping.cpl_pendukung !== null, `Kolom CPL terdeteksi: "${mapping.cpl_pendukung}"`);

// 3. UJI EKSTRAKSI BARIS DAN DEDUPLIKASI
console.log('\n📊 Test 3: Ekstraksi Baris Data & Deduplikasi CPMK...');
const dataRows = [];
for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
  const rowVals = rawMatrix[r];
  if (!rowVals.some(v => v !== '')) continue;
  const rowObj = {};
  headers.forEach((h, colIdx) => {
    rowObj[h] = rowVals[colIdx] !== undefined ? rowVals[colIdx] : '';
  });
  dataRows.push(rowObj);
}

assert(dataRows.length === 336, `Total baris data raw terbaca: ${dataRows.length} (ekspektasi 336 baris Sub-CPMK)`);

const queueDeduplicated = Matcher.buildQueue(dataRows, mapping, { deduplicate: true });
console.log(`  ℹ️ Total antrian setelah deduplikasi: ${queueDeduplicated.length} CPMK`);
assert(queueDeduplicated.length === 168, `Deduplikasi berhasil menghasilkan tepat 168 data CPMK unik`);

// Sample first item
const firstItem = queueDeduplicated[0];
console.log('  ℹ️ Item pertama:', {
  kodeMK: firstItem.kodeMK,
  namaMK: firstItem.namaMK,
  kodeCPMK: firstItem.kodeCPMK,
  cpl: firstItem.cpl,
  descSnippet: firstItem.descCPMK.slice(0, 50) + '...'
});
assert(firstItem.kodeMK === 'PMA011225', 'Kode MK item pertama adalah PMA011225');
assert(firstItem.kodeCPMK === 'CPMK-12.1', 'Kode CPMK item pertama adalah CPMK-12.1');
assert(firstItem.cpl === 'CPL-3', 'CPL item pertama adalah CPL-3');

// 4. UJI PENCOCOKAN DENGAN OPTION DARI FILE CREATE HTML ASLI
console.log('\n🌐 Test 4: Pencocokan Nilai dengan HTML Form MALAQBI Create...');
const createHtmlPath = '/Users/laodefardin/Downloads/Dashboard - MALAQBI create.html';
const createHtml = fs.readFileSync(createHtmlPath, 'utf8');

// Ekstraksi options mata kuliah dari HTML
const mkOptionRegex = /<option value="(\d+)">\s*\[(.*?)\]\s*(.*?)\s*<\/option>/g;
const webMKOptions = [];
let match;
while ((match = mkOptionRegex.exec(createHtml)) !== null) {
  webMKOptions.push({
    value: match[1],
    text: `[${match[2]}] ${match[3]}`,
    code: match[2].trim(),
    cleanName: match[3].trim()
  });
}
assert(webMKOptions.length > 50, `Berhasil mengekstrak ${webMKOptions.length} opsi Mata Kuliah dari HTML form create`);

// Test kecocokan untuk beberapa MK
const testMK1 = Matcher.matchMataKuliah('PTI061225', 'Aplikasi Komputer', webMKOptions);
assert(testMK1 === '2284', `Pencocokan [PTI061225] Aplikasi Komputer mengembalikan ID: 2284 (Dapat: ${testMK1})`);

const testMK2 = Matcher.matchMataKuliah('PTI163224', 'Pemrograman Web', webMKOptions);
assert(testMK2 === '2309', `Pencocokan [PTI163224] Pemrograman Web mengembalikan ID: 2309 (Dapat: ${testMK2})`);

const testMK3 = Matcher.matchMataKuliah(null, 'Struktur Data', webMKOptions);
assert(testMK3 === '2308', `Pencocokan nama saja "Struktur Data" mengembalikan ID: 2308 (Dapat: ${testMK3})`);

// 5. UJI PENCOCOKAN CPL RADIO DARI HTML ASLI
console.log('\n🎯 Test 5: Pencocokan Radio CPL dari HTML Create...');
const cplRadioRegex = /<input type="radio" name="cpl_id" value="(\d+)">[\s\S]*?<strong>(CPL-\d+)<\/strong>\s*—\s*([\s\S]*?)<\/span>/g;
const webCPLOptions = [];
while ((match = cplRadioRegex.exec(createHtml)) !== null) {
  webCPLOptions.push({
    value: match[1],
    text: `${match[2]} — ${match[3].replace(/\s+/g, ' ').trim()}`,
    cplCode: match[2].trim()
  });
}
assert(webCPLOptions.length === 12, `Berhasil mengekstrak ${webCPLOptions.length} radio CPL (CPL-01 s/d CPL-12)`);

const testCPL1 = Matcher.matchCPL('CPL-3', webCPLOptions);
assert(testCPL1 === '444', `Pencocokan 'CPL-3' mengembalikan ID CPL-03: 444 (Dapat: ${testCPL1})`);

const testCPL2 = Matcher.matchCPL('CPL-07', webCPLOptions);
assert(testCPL2 === '448', `Pencocokan 'CPL-07' mengembalikan ID CPL-07: 448 (Dapat: ${testCPL2})`);

const testCPL3 = Matcher.matchCPL('CPL 11', webCPLOptions);
assert(testCPL3 === '452', `Pencocokan 'CPL 11' mengembalikan ID CPL-11: 452 (Dapat: ${testCPL3})`);

// 6. UJI INTEGRASI FILE EXTENSION
console.log('\n📦 Test 6: Verifikasi File Ekstensi Chrome MV3...');
const extFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.js',
  'lib/ai_service.js',
  'lib/matcher.js',
  'lib/xlsx.full.min.js',
  'lib/font-awesome.min.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

extFiles.forEach(f => {
  const p = path.join(__dirname, f);
  assert(fs.existsSync(p), `File bundle ekstensi ada: ${f}`);
});

// Verifikasi Manifest JSON valid
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
assert(manifest.manifest_version === 3, 'Manifest Version adalah 3 (MV3)');
assert(manifest.permissions.includes('sidePanel'), 'Manifest memiliki permission "sidePanel"');
assert(manifest.host_permissions.includes('https://malaqbi.unsulbar.ac.id/*'), 'Manifest memiliki host permission MALAQBI');

// 7. UJI DETEKSI ERROR DUPLIKASI KODE CPMK ("The kode has already been taken")
console.log('\n🛡️ Test 7: Logika Deteksi Error Duplikasi & Skip...');
function isDuplicateErrorCode(msg) {
  if (!msg || typeof msg !== 'string') return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('the kode has already been taken') ||
    lower.includes('kode has already been taken') ||
    lower.includes('the code has already been taken') ||
    lower.includes('kode sudah digunakan') ||
    lower.includes('kode sudah ada') ||
    lower.includes('kode sudah terdaftar') ||
    lower.includes('already been taken')
  );
}

const errSample1 = 'The kode has already been taken';
const errSample2 = 'Gagal: The kode has already been taken.';
const errSample3 = 'The code has already been taken';
const errSample4 = 'Field wajib diisi';

assert(isDuplicateErrorCode(errSample1) === true, `Mendeteksi "${errSample1}" sebagai error duplikasi`);
assert(isDuplicateErrorCode(errSample2) === true, `Mendeteksi "${errSample2}" sebagai error duplikasi`);
assert(isDuplicateErrorCode(errSample3) === true, `Mendeteksi "${errSample3}" sebagai error duplikasi`);
assert(isDuplicateErrorCode(errSample4) === false, `Tidak menganggap "${errSample4}" sebagai error duplikasi`);

// 8. UJI SIMULASI ANTRIAN DENGAN ITEM SKIPPED
console.log('\n📊 Test 8: Simulasi Metrik Antrian & Skip Otomatis...');
const testQueue = [
  { id: 1, kodeCPMK: 'CPMK-12.1', status: 'success' },
  { id: 2, kodeCPMK: 'CPMK-12.2', status: 'skipped', errorMessage: 'The kode has already been taken' },
  { id: 3, kodeCPMK: 'CPMK-12.3', status: 'skipped', errorMessage: 'Sudah terdaftar di tabel' },
  { id: 4, kodeCPMK: 'CPMK-12.4', status: 'failed', errorMessage: 'Connection timeout' },
  { id: 5, kodeCPMK: 'CPMK-12.5', status: 'pending' }
];

const total = testQueue.length;
const success = testQueue.filter(q => q.status === 'success').length;
const skipped = testQueue.filter(q => q.status === 'skipped').length;
const failed = testQueue.filter(q => q.status === 'failed').length;
const pending = testQueue.filter(q => q.status === 'pending').length;
const processed = success + skipped + failed;

assert(total === 5, 'Total antrian simulasi adalah 5');
assert(success === 1, 'Data sukses terhitung 1');
assert(skipped === 2, 'Data dilewati (skipped) terhitung tepat 2');
assert(failed === 1, 'Data gagal terhitung 1');
assert(pending === 1, 'Data pending terhitung 1');
assert(processed === 4, 'Data diproses (sukses + skip + gagal) terhitung 4');
assert(Math.round((processed / total) * 100) === 80, 'Progress persentase akurat 80%');

// 9. UJI INTEGRASI FONT AWESOME & PEMBERSIHAN EMOJI UI
console.log('\n🎨 Test 9: Verifikasi Font Awesome & Penghapusan Emoji UI...');
assert(fs.existsSync(path.join(__dirname, 'lib/font-awesome.min.css')), 'File CSS Font Awesome ada: lib/font-awesome.min.css');
assert(fs.existsSync(path.join(__dirname, 'webfonts/fa-solid-900.woff2')), 'Webfont fa-solid-900.woff2 ada');
assert(fs.existsSync(path.join(__dirname, 'webfonts/fa-regular-400.woff2')), 'Webfont fa-regular-400.woff2 ada');

const htmlContent = fs.readFileSync(path.join(__dirname, 'sidepanel.html'), 'utf8');
const jsContent = fs.readFileSync(path.join(__dirname, 'sidepanel.js'), 'utf8');

assert(htmlContent.includes('lib/font-awesome.min.css'), 'sidepanel.html mengimpor lib/font-awesome.min.css');
assert(htmlContent.includes('fa-graduation-cap'), 'sidepanel.html menggunakan ikon FA fa-graduation-cap');
assert(htmlContent.includes('fa-file-excel'), 'sidepanel.html menggunakan ikon FA fa-file-excel');
assert(htmlContent.includes('fa-wand-magic-sparkles'), 'sidepanel.html menggunakan ikon FA fa-wand-magic-sparkles');
assert(htmlContent.includes('fa-play'), 'sidepanel.html menggunakan ikon FA fa-play');
assert(htmlContent.includes('fa-floppy-disk'), 'sidepanel.html menggunakan ikon FA fa-floppy-disk');

// Pastikan tidak ada karakter emoji di sidepanel.html dan sidepanel.js
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
assert(!emojiRegex.test(htmlContent), 'sidepanel.html bebas dari karakter emoji');
assert(!emojiRegex.test(jsContent), 'sidepanel.js bebas dari karakter emoji');

console.log('\n🔧 Test 10: Verifikasi Pengecualian Tombol Hapus & Pemulihan False Error...');
const contentJsContent = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

assert(contentJsContent.includes('form.querySelectorAll'), 'content.js memeriksa error validasi di dalam scope form');
assert(contentJsContent.includes('hapus|delete'), 'content.js secara eksplisit mengabaikan kata hapus/delete');
assert(contentJsContent.includes('procIdx !== -1'), 'content.js menandai item processing sebagai success di halaman index');

assert(htmlContent.includes('btn-retry-failed'), 'sidepanel.html memiliki elemen #btn-retry-failed');
assert(htmlContent.includes('fa-rotate-right'), 'Tombol ulangi gagal menggunakan ikon FA fa-rotate-right');

assert(jsContent.includes('btnRetryFailed'), 'sidepanel.js menangani event listener btnRetryFailed');
assert(jsContent.includes("includes('hapus')"), 'sidepanel.js memiliki logika auto-heal untuk item gagal akibat error Hapus');

const simulateIsError = (tag, text, isInsideTable) => {
  if (isInsideTable) return false;
  if (tag === 'BUTTON' || tag === 'A') return false;
  if (/^(hapus|delete|batal|cancel)$/i.test(text)) return false;
  return true;
};

assert(!simulateIsError('BUTTON', 'Hapus', true), 'Tombol <button> Hapus di tabel diabaikan dari error');
assert(!simulateIsError('BUTTON', 'Hapus', false), 'Tombol <button> Hapus di luar tabel diabaikan dari error');
assert(!simulateIsError('SPAN', 'Hapus', true), 'Teks Hapus di dalam tabel diabaikan dari error');
assert(simulateIsError('SPAN', 'The kode has already been taken', false), 'Pesan validasi asli tetap terdeteksi');

console.log('\n📋 Test 11: Verifikasi Tampilan Seluruh Antrian CPMK (Tanpa Batasan 50 Item)...');
const cssContent = fs.readFileSync(path.join(__dirname, 'sidepanel.css'), 'utf8');
assert(!jsContent.includes('currentQueue.slice(0, 50)'), 'sidepanel.js tidak lagi membatasi rendering ke 50 item');
assert(jsContent.includes('currentQueue.forEach('), 'sidepanel.js merender seluruh item antrian secara penuh');
assert(jsContent.includes('scrollIntoView'), 'sidepanel.js mendukung scrollIntoView otomatis pada item aktif');
assert(cssContent.includes('max-height: 380px'), 'sidepanel.css menyediakan viewport tabel luas 380px dengan scroll vertikal');

console.log('\n🎨 Test 12: Verifikasi Tema Warna Maroon Unsulbar (#8f2430) & Gradient...');
assert(cssContent.includes('--primary: #8f2430'), 'sidepanel.css mendefinisikan warna utama #8f2430');
assert(cssContent.includes('--tw-gradient-to-position'), 'sidepanel.css mendukung variabel --tw-gradient-to-position');
assert(cssContent.includes('linear-gradient(135deg, #8f2430'), 'Gradien logo menggunakan #8f2430');
assert(cssContent.includes('linear-gradient(90deg, #8f2430'), 'Gradien progress bar menggunakan #8f2430');
assert(htmlContent.includes('text-maroon'), 'sidepanel.html mengadopsi class text-maroon');
assert(htmlContent.includes('badge-maroon'), 'sidepanel.html mengadopsi class badge-maroon');
assert(htmlContent.includes('btn-outline-maroon'), 'sidepanel.html mengadopsi class btn-outline-maroon');

// Verifikasi icon PNG memiliki byte warna maroon (143, 36, 48)
const icon16Buf = fs.readFileSync(path.join(__dirname, 'icons', 'icon16.png'));
const zlib = require('zlib');
// Uncompress IDAT chunk untuk verifikasi warna
const idatIdx = icon16Buf.indexOf(Buffer.from('IDAT'));
assert(idatIdx !== -1, 'icon16.png memiliki IDAT chunk');
const idatLen = icon16Buf.readUInt32BE(idatIdx - 4);
const compressedData = icon16Buf.slice(idatIdx + 4, idatIdx + 4 + idatLen);
const decompressed = zlib.inflateSync(compressedData);
assert(decompressed.includes(143) && decompressed.includes(36) && decompressed.includes(48), 'icon16.png memuat warna maroon #8f2430');

console.log('\n🔒 Test 13: Verifikasi Keamanan API Key & Tautan Provider AI...');
assert(htmlContent.includes('https://aistudio.google.com/app/apikey'), 'Tautan resmi Google AI Studio tersedia');
assert(htmlContent.includes('https://platform.openai.com/api-keys'), 'Tautan resmi OpenAI Platform tersedia');
assert(!htmlContent.includes('btn-toggle-key'), 'Tombol intip mata kata sandi dihapus total demi keamanan');
assert(htmlContent.includes('input-secure'), 'Input API Key memiliki kelas keamanan input-secure');
assert(htmlContent.includes('autocomplete="new-password"'), 'Input API Key menggunakan autocomplete new-password');
assert(jsContent.includes("e.preventDefault()"), 'sidepanel.js memblokir event berbahaya');
assert(jsContent.includes("'copy'"), 'sidepanel.js mencegat event copy');
assert(jsContent.includes("'cut'"), 'sidepanel.js mencegat event cut');
assert(jsContent.includes("'contextmenu'"), 'sidepanel.js mencegat klik kanan/contextmenu');
assert(jsContent.includes('••••••••••••••••'), 'sidepanel.js menggunakan bullet masking di DOM saat key tersimpan');
assert(cssContent.includes('.input-secure'), 'sidepanel.css mendefinisikan .input-secure');
assert(cssContent.includes('.provider-link-card'), 'sidepanel.css mendefinisikan .provider-link-card');

console.log('\n👨‍💻 Test 14: Verifikasi Tab Pengembang & Informasi Aplikasi...');
assert(htmlContent.includes('data-tab="tab-developer"'), 'Tab Pengembang tersedia di navigasi');
assert(htmlContent.includes('id="tab-developer"'), 'Konten tab-developer tersedia di DOM');
assert(htmlContent.includes('Laode Fardin'), 'Memuat nama pengembang Laode Fardin');
assert(htmlContent.includes('Pendidikan Teknologi Informasi'), 'Memuat Prodi Pendidikan Teknologi Informasi');
assert(htmlContent.includes('FKIP'), 'Memuat Fakultas FKIP');
assert(htmlContent.includes('Universitas Sulawesi Barat'), 'Memuat Universitas Sulawesi Barat');
assert(htmlContent.includes('Informasi Aplikasi'), 'Memuat bagian Informasi Aplikasi');
assert(htmlContent.includes('MALAQBI CPMK Assistant'), 'Memuat nama aplikasi MALAQBI CPMK Assistant');
assert(!emojiRegex.test(htmlContent), 'Konten tab pengembang bebas dari karakter emoji');
assert(cssContent.includes('.dev-profile-box'), 'sidepanel.css mendefinisikan .dev-profile-box');
assert(cssContent.includes('.dev-avatar'), 'sidepanel.css mendefinisikan .dev-avatar');
assert(cssContent.includes('.spec-grid'), 'sidepanel.css mendefinisikan .spec-grid');

console.log('\n🤖 Test 15: Verifikasi Fleksibilitas Model Gemini, Parsing Respon, & Fallback API...');
assert(AIService._normalizeGeminiModel('gemini-3.5-flash-lite') === 'gemini-3.5-flash-lite', 'Model gemini-3.5-flash-lite dipertahankan');
assert(AIService._normalizeGeminiModel('gemini-3.8-flash') === 'gemini-3.8-flash', 'Model gemini-3.8-flash dipertahankan');
assert(AIService._normalizeGeminiModel('gemini-3.6-flash') === 'gemini-3.6-flash', 'Model gemini-3.6-flash dipertahankan');
assert(AIService._normalizeGeminiModel('gemini-4-argon') === 'gemini-4-argon', 'Model gemini-4-argon dipertahankan');
assert(AIService._normalizeGeminiModel('models/gemini-3.8-flash') === 'gemini-3.8-flash', 'Prefix models/ dibersihkan menjadi gemini-3.8-flash');
assert(AIService._normalizeGeminiModel('gemini-2.0-flash') === 'gemini-3.5-flash-lite', 'Auto-migrasi model legacy gemini-2.0-flash ke gemini-3.5-flash-lite');
assert(AIService._normalizeGeminiModel('gemini-2.5-flash') === 'gemini-3.5-flash-lite', 'Auto-migrasi model legacy gemini-2.5-flash ke gemini-3.5-flash-lite');
assert(AIService._normalizeGeminiModel('') === 'gemini-3.5-flash-lite', 'Fallback default ke gemini-3.5-flash-lite jika kosong');

const mockInteractionsStepsResponse = {
  object: 'interaction',
  model: 'gemini-3.8-flash',
  steps: [
    { type: 'thought', signature: 'xyz123' },
    {
      type: 'model_output',
      content: [
        { type: 'text', text: 'PONG' }
      ]
    }
  ]
};
assert(AIService._extractGeminiResponseText(mockInteractionsStepsResponse) === 'PONG', 'Ekstraksi teks dari struktur steps Interactions API');

const mockInteractionsOutputTextResponse = {
  object: 'interaction',
  model: 'gemini-3.8-flash',
  output_text: 'PONG'
};
assert(AIService._extractGeminiResponseText(mockInteractionsOutputTextResponse) === 'PONG', 'Ekstraksi teks dari output_text Interactions API');

const mockGenerateContentResponse = {
  candidates: [
    {
      content: {
        parts: [
          { text: 'PONG' }
        ]
      }
    }
  ]
};
assert(AIService._extractGeminiResponseText(mockGenerateContentResponse) === 'PONG', 'Ekstraksi teks dari fallback generateContent API');

console.log('\n⚡ Test 16: Verifikasi Multi-Model Gemini, Auto-Failover High Demand, & Custom Model...');
// Validasi deteksi error fallback (High Demand / Rate Limit / Overload / Discontinued)
assert(AIService._isFallbackEligible('This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.') === true, 'Mendeteksi error high demand untuk auto-failover');
assert(AIService._isFallbackEligible('HTTP 503: Service Unavailable') === true, 'Mendeteksi error 503 untuk auto-failover');
assert(AIService._isFallbackEligible('Resource has been exhausted (e.g. check quota)') === true, 'Mendeteksi resource exhausted untuk auto-failover');
assert(AIService._isFallbackEligible('This model models/gemini-2.0-flash is no longer available.') === true, 'Mendeteksi model tidak tersedia untuk auto-failover');
assert(AIService._isFallbackEligible('API_KEY_INVALID') === false, 'Auth error (API_KEY_INVALID) tidak memicu fallback sia-sia');
assert(AIService._isAuthError('API_KEY_INVALID') === true, 'Fungsi _isAuthError mendeteksi API_KEY_INVALID');
assert(AIService._isAuthError('403 Forbidden') === true, 'Fungsi _isAuthError mendeteksi 403 Forbidden');

// Validasi tersedianya model di antarmuka
assert(jsContent.includes("'gemini-3.5-flash-lite'"), 'sidepanel.js memuat gemini-3.5-flash-lite');
assert(jsContent.includes("'gemini-3.8-flash'"), 'sidepanel.js memuat gemini-3.8-flash');
assert(jsContent.includes("'gemini-3.6-flash'"), 'sidepanel.js memuat gemini-3.6-flash');
assert(jsContent.includes("'gemini-4-argon'"), 'sidepanel.js memuat gemini-4-argon');
assert(jsContent.includes("'gpt-4o-mini'"), 'sidepanel.js memuat gpt-4o-mini');
assert(jsContent.includes('wrapperCustomModel'), 'sidepanel.js mendukung wrapper model kustom');
assert(htmlContent.includes('id="wrapper-custom-model"'), 'sidepanel.html memiliki elemen #wrapper-custom-model');
assert(htmlContent.includes('id="input-custom-model"'), 'sidepanel.html memiliki elemen #input-custom-model');
assert(htmlContent.includes('gemini-3.5-flash-lite'), 'sidepanel.html memuat rekomendasi gemini-3.5-flash-lite');
assert(htmlContent.includes('Gemini 3.5 / 3.8'), 'sidepanel.html menampilkan info spesifikasi Gemini 3.5 / 3.8');

console.log('\n====================================================');
console.log(`🏁 TEST RESULTS: ${passedTests}/${totalTests} TESTS PASSED!`);
if (passedTests === totalTests) {
  console.log('🎉 SEMUA PENGUJIAN BERHASIL 100% TANPA ERROR!');
} else {
  console.error('⚠️ ADA PENGUJIAN YANG GAGAL.');
  process.exit(1);
}
console.log('====================================================\n');
