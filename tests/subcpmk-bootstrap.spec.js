/**
 * Uji bootstrap tombol "Mulai Sub-CPMK": side panel harus meng-inject content
 * script lalu mengirim START_SUB_FLOW, bukan hanya `tabs.update` ke URL yang
 * sama (Chrome mengabaikannya sehingga antrean tidak pernah diproses).
 *
 * Jalankan: node tests/subcpmk-bootstrap.spec.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = path.join(__dirname, '..', 'sidepanel.html');
const JS = path.join(__dirname, '..', 'sidepanel.js');

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

const dom = new JSDOM(fs.readFileSync(HTML, 'utf8'), {
  url: 'chrome-extension://bhackcelbffmgfcmfllbcneomfhfaalg/sidepanel.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole
});
const { window } = dom;

const store = {
  malaqbi_sub_queue: [{
    id: 'sub-1', kodeMK: 'USB081224', namaMK: 'Pendidikan Pancasila',
    kodeCPMK: 'CPMK-02.1', kode: 'Sub-CPMK-02.1.1', deskripsi: 'Deskripsi', bobot: '10',
    status: 'pending', timestamp: ''
  }],
  malaqbi_sub_running: false,
  malaqbi_sub_delay_ms: 1500
};

const calls = { executeScript: [], sendMessage: [], update: [], create: [] };

window.chrome = {
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
  runtime: { onMessage: { addListener: () => {} }, sendMessage: () => Promise.resolve() },
  tabs: {
    query: async () => [{ id: 42, url: 'https://malaqbi.unsulbar.ac.id/admin/mata-kuliah' }],
    sendMessage: async (tabId, msg) => { calls.sendMessage.push([tabId, msg]); },
    update: async (tabId, props) => { calls.update.push([tabId, props]); },
    create: async (props) => { calls.create.push(props); }
  },
  scripting: {
    executeScript: async (opts) => { calls.executeScript.push(opts); }
  }
};

// Stub dependency global yang di-load lewat <script> di sidepanel.html
window.XLSX = { read: () => ({}), utils: {} };
window.AIService = {};
window.Matcher = {};
window.SubCPMK = { buildQueue: () => [] };
window.confirm = () => true;

process.on('unhandledRejection', (e) => console.error('UNHANDLED:', e?.message || e));

(async () => {
  window.eval(fs.readFileSync(JS, 'utf8'));
  await new Promise((r) => setTimeout(r, 400)); // tunggu inisialisasi panel selesai

  const btn = window.document.getElementById('sc-btn-start');
  assert(btn, 'Tombol #sc-btn-start harus ada');

  btn.click();
  await new Promise((r) => setTimeout(r, 400));

  console.log('storage.running :', store.malaqbi_sub_running);
  console.log('executeScript   :', JSON.stringify(calls.executeScript));
  console.log('sendMessage     :', JSON.stringify(calls.sendMessage));
  console.log('tabs.update     :', JSON.stringify(calls.update));

  assert.strictEqual(store.malaqbi_sub_running, true, 'Status running harus disimpan');
  assert.strictEqual(calls.executeScript.length, 1, 'Content script harus di-inject ke tab aktif');
  // Array berasal dari realm jsdom → bandingkan sebagai string
  assert.strictEqual(Array.from(calls.executeScript[0].files).join(), 'content.js');
  assert.strictEqual(calls.sendMessage.length, 1, 'START_SUB_FLOW harus dikirim ke content script');
  assert.strictEqual(calls.sendMessage[0][1].action, 'START_SUB_FLOW');
  assert.strictEqual(calls.update.length, 0, 'Tidak boleh hanya mengandalkan tabs.update');

  console.log('\nSUB_CPMK_BOOTSTRAP_OK — tombol Mulai memicu injeksi + pesan');
  window.close();
})().catch((err) => {
  console.error('HARNESS GAGAL:', err.message);
  process.exit(1);
});
