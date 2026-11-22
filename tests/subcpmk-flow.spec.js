/**
 * Harness uji alur otomasi Sub-CPMK memakai DUMP HTML asli portal.
 * Menjalankan content.js di jsdom dengan chrome.* tiruan, lalu memeriksa
 * perpindahan status antrean di setiap halaman.
 *
 * Jalankan: node tests/subcpmk-flow.spec.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const DUMP_DIR = process.env.MALAQBI_DUMP_DIR || '/Users/laodefardin/Downloads/untitled folder';
const F_MK_INDEX = path.join(DUMP_DIR, 'Menu Mata Kuliah -  MALAQBI.html');
const F_MK_DETAIL = path.join(DUMP_DIR, 'Mata kuliah- button detail - MALAQBI.html');
const F_SUB_FORM = path.join(DUMP_DIR, 'Mata Kuliah - detail - Tambah Subcpmk - MALAQBI.html');
const CONTENT = path.join(__dirname, '..', 'content.js');

for (const f of [F_MK_INDEX, F_MK_DETAIL, F_SUB_FORM, CONTENT]) {
  assert(fs.existsSync(f), `File wajib ada: ${f}`);
}

const contentSource = fs.readFileSync(CONTENT, 'utf8');
const BASE = 'https://malaqbi.unsulbar.ac.id';

/** Buka halaman dump dengan chrome.storage tiruan yang berbagi satu store. */
function openPage(htmlFile, url, store) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM(fs.readFileSync(htmlFile, 'utf8'), {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole
  });

  const messages = [];
  let listener = null;
  dom.window.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
          return out;
        },
        set: async (obj) => { Object.assign(store, JSON.parse(JSON.stringify(obj))); }
      }
    },
    runtime: {
      sendMessage: (msg) => { messages.push(msg); return Promise.resolve(); },
      onMessage: { addListener: (fn) => { listener = fn; } }
    }
  };

  dom.window.eval(contentSource);
  return {
    dom,
    messages,
    /** Kirim pesan START_SUB_FLOW seperti side panel. */
    startFlow: () => listener && listener({ action: 'START_SUB_FLOW' }, {}, () => {}),
    close: () => dom.window.close()
  };
}

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const status = (store) => store.malaqbi_sub_queue.map((q) => `${q.kodeMK}:${q.status}`);

(async () => {
  const store = {
    malaqbi_sub_running: true,
    malaqbi_sub_delay_ms: 0,
    malaqbi_sub_queue: [
      {
        id: 'sub-1', kodeMK: 'FIP012225', namaMK: 'Pengantar Pendidikan',
        kodeCPMK: 'CPMK-56.1', kode: 'SC-1', deskripsi: 'Sub pertama', bobot: '20',
        status: 'pending', timestamp: ''
      },
      {
        id: 'sub-2', kodeMK: 'FIP064425', namaMK: 'PLP',
        kodeCPMK: 'CPMK-56.1', kode: 'SC-1', deskripsi: 'Sub pertama', bobot: '20',
        status: 'pending', timestamp: ''
      }
    ]
  };

  // ---------- HALAMAN 1: DAFTAR MATA KULIAH ----------
  const p1 = openPage(F_MK_INDEX, `${BASE}/admin/mata-kuliah`, store);
  await tick();
  console.log('1) daftar MK  →', status(store));
  assert.strictEqual(store.malaqbi_sub_queue[0].status, 'skipped', 'MK tanpa CPMK harus Dilewati');
  assert.strictEqual(store.malaqbi_sub_queue[1].status, 'pending', 'Item lain tetap pending');

  // START_SUB_FLOW ganda (injeksi + pesan) tidak boleh memproses 2 item sekaligus
  p1.startFlow();
  await tick();
  assert.strictEqual(store.malaqbi_sub_queue.filter((q) => q.status === 'processing').length, 0,
    'Tidak ada item ganda yang diproses di halaman daftar');
  console.log('   start ganda → aman:', status(store));

  // ---------- HALAMAN 2: DETAIL MK 2485 (PLP) ----------
  const p2 = openPage(F_MK_DETAIL, `${BASE}/admin/mata-kuliah/2485`, store);
  await tick();
  console.log('2) detail MK  →', status(store));
  assert.strictEqual(store.malaqbi_sub_queue[1].status, 'processing', 'Detail MK harus membuka form Sub-CPMK');

  // ---------- HALAMAN 3: FORM TAMBAH SUB-CPMK ----------
  const p3 = openPage(F_SUB_FORM, `${BASE}/admin/mata-kuliah/2485/cpmk/2536/sub-cpmk/create`, store);
  await tick(300);
  const form = p3.dom.window.document.querySelector('form[action*="/sub-cpmk"]');
  const filled = {
    kode: form?.querySelector('input[name="kode"]')?.value,
    deskripsi: form?.querySelector('textarea[name="deskripsi"]')?.value,
    bobot: form?.querySelector('input[name="bobot"]')?.value
  };
  console.log('3) form       →', filled, status(store));
  assert.deepStrictEqual(filled, { kode: 'SC-1', deskripsi: 'Sub pertama', bobot: '20' },
    'Form Sub-CPMK harus terisi dari antrean');

  // ---------- HALAMAN 4: KEMBALI KE DETAIL (redirect setelah Simpan) ----------
  const p4 = openPage(F_MK_DETAIL, `${BASE}/admin/mata-kuliah/2485`, store);
  await tick(150);
  console.log('4) pasca simpan →', status(store), '| running:', store.malaqbi_sub_running);
  assert.strictEqual(store.malaqbi_sub_queue[1].status, 'success', 'Item harus ditandai Sukses setelah redirect');
  assert.strictEqual(store.malaqbi_sub_running, false, 'Antrean selesai → running dimatikan');

  for (const p of [p1, p2, p3, p4]) p.close();
  console.log('\nSUB_CPMK_FLOW_OK — semua tahap lolos');
})().catch((err) => {
  console.error('HARNESS GAGAL:', err.message);
  process.exit(1);
});
