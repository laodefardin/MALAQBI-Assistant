/**
 * MALAQBI CPMK Assistant - Sub-CPMK Queue Builder
 * Mengubah baris Excel (MK → CPMK → Sub-CPMK) menjadi antrian berurutan
 * agar otomasi bisa berpindah halaman: daftar MK → detail MK → form Sub-CPMK.
 */
(function (global) {
  const HINTS = {
    kode_mk: ['kode mk', 'kode mata kuliah', 'kode mk.', 'kd mk', 'kode_mk', 'kodemk'],
    mata_kuliah: ['nama mata kuliah', 'mata kuliah', 'nama mk', 'matakuliah'],
    kode_cpmk: ['kode cpmk', 'kode cpmk.', 'kode_cpmk', 'kodecpmk'],
    kode_sub: ['kode sub-cpmk', 'kode sub cpmk', 'kode subcpmk', 'kode sub', 'sub-cpmk', 'sub cpmk', 'kode'],
    deskripsi: ['deskripsi sub-cpmk', 'deskripsi sub cpmk', 'deskripsi', 'uraian', 'rumusan'],
    bobot: ['bobot (%)', 'bobot', 'persentase', 'persen', 'bobot_sub']
  };

  const norm = (v) => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
  const key = (v) => norm(v).toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

  /**
   * Tebak kolom Excel. 'kode' polos hanya dipakai untuk sub-CPMK
   * bila kolom kodeMK & kodeCPMK sudah menemukan pasangannya.
   */
  function detectColumnsHeuristic(headers) {
    const map = { kode_mk: '', mata_kuliah: '', kode_cpmk: '', kode_sub: '', deskripsi: '', bobot: '' };
    const used = new Set();
    const list = (headers || []).map(h => ({ raw: h, k: key(h) }));

    for (const field of ['kode_mk', 'mata_kuliah', 'kode_cpmk', 'deskripsi', 'bobot', 'kode_sub']) {
      const hintList = HINTS[field];
      let found = '';
      for (const hint of hintList) {
        const hit = list.find(x => !used.has(x.raw) && (x.k === hint || x.k.includes(hint)));
        if (hit) { found = hit.raw; break; }
      }
      if (found) { map[field] = found; used.add(found); }
    }

    // 'kode' bisa berarti kode CPMK atau kode Sub-CPMK — pindahkan bila perlu
    if (map.kode_sub && map.kode_cpmk && key(map.kode_sub) === key(map.kode_cpmk)) map.kode_sub = '';
    return map;
  }

  function normalizeBobot(v) {
    const s = norm(v).replace(',', '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? '' : String(Math.round(n * 100) / 100);
  }

  /**
   * Bangun antrian: satu baris = satu Sub-CPMK.
   * Urut per Mata Kuliah, lalu per CPMK, agar otomasi cukup sekali buka detail MK.
   */
  function buildQueue(rows, mapping, options = {}) {
    const dedupe = options.dedupe !== false;
    const items = [];
    const seen = new Set();
    const invalid = [];

    (rows || []).forEach((row, idx) => {
      const kodeMK = norm(row[mapping.kode_mk]);
      const namaMK = norm(row[mapping.mata_kuliah]);
      const kodeCPMK = norm(row[mapping.kode_cpmk]);
      const kode = norm(row[mapping.kode_sub]);
      const deskripsi = norm(row[mapping.deskripsi]);
      const bobot = normalizeBobot(row[mapping.bobot]);

      if (!kodeMK || !kodeCPMK || !kode) {
        invalid.push({ row: idx + 1, reason: 'Kode MK / CPMK / Sub-CPMK kosong' });
        return;
      }

      const sig = `${kodeMK.toLowerCase()}|${kodeCPMK.toLowerCase()}|${kode.toLowerCase()}`;
      if (dedupe && seen.has(sig)) return;
      seen.add(sig);

      items.push({
        id: `sub-${idx + 1}`,
        kodeMK,
        namaMK,
        kodeCPMK,
        kode,
        deskripsi,
        bobot,
        status: 'pending',
        timestamp: ''
      });
    });

    // Urutan stabil: MK sesuai kemunculan pertama, CPMK sesuai kemunculan pertama
    const mkOrder = new Map();
    const cpmkOrder = new Map();
    items.forEach((it, i) => {
      if (!mkOrder.has(it.kodeMK)) mkOrder.set(it.kodeMK, mkOrder.size);
      const ck = `${it.kodeMK}|${it.kodeCPMK}`;
      if (!cpmkOrder.has(ck)) cpmkOrder.set(ck, cpmkOrder.size);
      it._i = i;
    });

    items.sort((a, b) =>
      mkOrder.get(a.kodeMK) - mkOrder.get(b.kodeMK) ||
      cpmkOrder.get(`${a.kodeMK}|${a.kodeCPMK}`) - cpmkOrder.get(`${b.kodeMK}|${b.kodeCPMK}`) ||
      a._i - b._i
    );
    items.forEach(it => { delete it._i; });

    return { items, invalid };
  }

  global.SubCPMK = { detectColumnsHeuristic, buildQueue, normalizeBobot };
})(typeof window !== 'undefined' ? window : globalThis);