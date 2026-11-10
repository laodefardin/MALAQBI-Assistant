/**
 * MALAQBI CPMK Assistant - Matcher & Parser Engine
 * Menyediakan parser Excel cerdas, normalisasi string, dan algoritma pencocokan opsi form MALAQBI
 */

const Matcher = {
  /**
   * Normalisasi teks: lowercase, hapus spasi berlebih, hilangkan simbol non-alfanumerik umum
   */
  normalize(str) {
    if (!str) return '';
    return String(str)
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Ekstraksi kode dari dalam kurung siku, misal: "[PTI061225] Aplikasi Komputer" -> "PTI061225"
   */
  extractCodeInBrackets(str) {
    if (!str) return null;
    const match = String(str).match(/\[([A-Za-z0-9_\-]+)\]/);
    return match ? match[1].trim() : null;
  },

  /**
   * Normalisasi kode CPL: "CPL-3" -> "CPL-03", "CPL-03" -> "CPL-03", "CPL 1" -> "CPL-01"
   */
  normalizeCPLCode(str) {
    if (!str) return '';
    const match = String(str).match(/cpl[-\s_]?0*([0-9]+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return `CPL-${String(num).padStart(2, '0')}`;
    }
    return String(str).trim().toUpperCase();
  },

  /**
   * Deteksi otomatis kolom Excel menggunakan pola Regex cerdas
   */
  detectColumnsHeuristic(headers) {
    if (!Array.isArray(headers) || headers.length === 0) {
      return { mata_kuliah: null, kode_mk: null, kode_cpmk: null, deskripsi_cpmk: null, cpl_pendukung: null };
    }

    const mapping = {
      mata_kuliah: null,
      kode_mk: null,
      kode_cpmk: null,
      deskripsi_cpmk: null,
      cpl_pendukung: null
    };

    headers.forEach(h => {
      const raw = String(h || '').trim();
      const norm = raw.toLowerCase();

      // Kode MK
      if (!mapping.kode_mk && (norm === 'kode mk' || norm === 'kodemk' || norm === 'kode mata kuliah' || norm === 'kd mk')) {
        mapping.kode_mk = raw;
      }
      // Mata Kuliah (Nama)
      else if (!mapping.mata_kuliah && (norm === 'mata kuliah' || norm === 'nama mata kuliah' || norm === 'nama mk' || norm === 'mk')) {
        mapping.mata_kuliah = raw;
      }
      // Kode CPMK
      else if (!mapping.kode_cpmk && (norm.includes('kode cpmk') || norm === 'cpmk' || norm === 'kode-cpmk' || norm === 'no cpmk')) {
        mapping.kode_cpmk = raw;
      }
      // Deskripsi CPMK
      else if (!mapping.deskripsi_cpmk && (
        norm.startsWith('cpmk (') ||
        norm.includes('deskripsi cpmk') ||
        norm.includes('rumusan cpmk') ||
        norm.includes('uraian cpmk') ||
        norm.includes('cpmk deskripsi') ||
        (norm.includes('cpmk') && norm.includes('mampu'))
      )) {
        mapping.deskripsi_cpmk = raw;
      }
      // CPL Pendukung
      else if (!mapping.cpl_pendukung && (
        norm === 'cpl' ||
        norm.includes('cpl pendukung') ||
        norm === 'kode cpl' ||
        norm.includes('capaian pembelajaran lulusan')
      )) {
        mapping.cpl_pendukung = raw;
      }
    });

    // Fallback jika kode_mk belum ada tapi mata_kuliah ada, atau sebaliknya
    if (!mapping.mata_kuliah && mapping.kode_mk) {
      mapping.mata_kuliah = mapping.kode_mk;
    }

    return mapping;
  },

  /**
   * Cocokkan Mata Kuliah dari Excel ke daftar <option> di web MALAQBI
   * options: Array of { value: string, text: string, code?: string, cleanName?: string }
   */
  matchMataKuliah(excelKodeMK, excelNamaMK, options) {
    if (!options || options.length === 0) return null;

    const normKode = excelKodeMK ? String(excelKodeMK).trim().toLowerCase() : '';
    const normNama = excelNamaMK ? this.normalize(excelNamaMK) : '';

    // 1. Prioritas 1: Cocokkan Kode MK persis di dalam kurung siku `[PTI061225]`
    if (normKode) {
      for (const opt of options) {
        const optCode = opt.code ? opt.code.toLowerCase() : (this.extractCodeInBrackets(opt.text) || '').toLowerCase();
        if (optCode && (optCode === normKode || optCode.replace(/[^a-z0-9]/g, '') === normKode.replace(/[^a-z0-9]/g, ''))) {
          return opt.value;
        }
      }
    }

    // 2. Prioritas 2: Cocokkan Kode MK di dalam teks utuh option
    if (normKode) {
      for (const opt of options) {
        const optText = opt.text.toLowerCase();
        if (optText.includes(normKode)) {
          return opt.value;
        }
      }
    }

    // 3. Prioritas 3: Cocokkan Nama Mata Kuliah persis
    if (normNama) {
      for (const opt of options) {
        const optClean = opt.cleanName ? this.normalize(opt.cleanName) : this.normalize(opt.text.replace(/\[.*?\]/g, ''));
        if (optClean === normNama) {
          return opt.value;
        }
      }
    }

    // 4. Prioritas 4: Partial match / substring match
    if (normNama && normNama.length > 4) {
      for (const opt of options) {
        const optClean = opt.cleanName ? this.normalize(opt.cleanName) : this.normalize(opt.text.replace(/\[.*?\]/g, ''));
        if (optClean.includes(normNama) || normNama.includes(optClean)) {
          return opt.value;
        }
      }
    }

    return null;
  },

  /**
   * Cocokkan CPL dari Excel ke daftar radio button CPL di web MALAQBI
   * options: Array of { value: string, text: string, cplCode?: string }
   */
  matchCPL(excelCPL, options) {
    if (!options || options.length === 0 || !excelCPL) return null;

    const targetNormalized = this.normalizeCPLCode(excelCPL); // e.g. "CPL-03"
    const targetDigits = String(excelCPL).match(/(\d+)/)?.[1]; // e.g. "3" or "03"

    // 1. Prioritas 1: Cocokkan format CPL-XX standar
    for (const opt of options) {
      const optCPL = opt.cplCode || this.normalizeCPLCode(opt.text);
      if (optCPL && optCPL === targetNormalized) {
        return opt.value;
      }
    }

    // 2. Prioritas 2: Cocokkan angka CPL di awal teks opsi (misal "CPL-03 — Mampu ...")
    if (targetDigits) {
      const targetInt = parseInt(targetDigits, 10);
      for (const opt of options) {
        const match = opt.text.match(/CPL[-\s_]?0*(\d+)/i);
        if (match && parseInt(match[1], 10) === targetInt) {
          return opt.value;
        }
      }
    }

    // 3. Prioritas 3: Cocokkan kemiripan teks jika CPL di Excel berupa deskripsi
    const normTarget = this.normalize(excelCPL);
    if (normTarget.length > 10) {
      for (const opt of options) {
        const normOpt = this.normalize(opt.text);
        if (normOpt.includes(normTarget) || normTarget.includes(normOpt)) {
          return opt.value;
        }
      }
    }

    return null;
  },

  /**
   * Memproses raw rows dari sheet Excel menjadi daftar antrian CPMK
   * Opsi deduplicate (default true): menyatukan baris yang memiliki (Kode MK / Nama MK) dan Kode CPMK sama
   */
  buildQueue(rawRows, mapping, options = { deduplicate: true }) {
    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

    const queue = [];
    const seenKeys = new Set();

    rawRows.forEach((row, index) => {
      const kodeMK = mapping.kode_mk ? String(row[mapping.kode_mk] || '').trim() : '';
      const namaMK = mapping.mata_kuliah ? String(row[mapping.mata_kuliah] || '').trim() : '';
      const kodeCPMK = mapping.kode_cpmk ? String(row[mapping.kode_cpmk] || '').trim() : '';
      const descCPMK = mapping.deskripsi_cpmk ? String(row[mapping.deskripsi_cpmk] || '').trim() : '';
      const cpl = mapping.cpl_pendukung ? String(row[mapping.cpl_pendukung] || '').trim() : '';

      // Abaikan baris jika kode CPMK atau deskripsi CPMK kosong sama sekali
      if (!kodeCPMK && !descCPMK) return;

      // Abaikan jika ternyata baris header berulang
      if (kodeCPMK.toLowerCase() === 'kode cpmk' || descCPMK.toLowerCase() === 'cpmk') return;

      const dedupeKey = `${(kodeMK || namaMK).toLowerCase()}::${kodeCPMK.toLowerCase()}`;

      if (options.deduplicate) {
        if (seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);
      }

      queue.push({
        id: `cpmk-${Date.now()}-${index}`,
        rowNumber: index + 1,
        kodeMK,
        namaMK,
        kodeCPMK,
        descCPMK,
        cpl,
        status: 'pending', // 'pending' | 'processing' | 'success' | 'failed' | 'skipped'
        errorMessage: null,
        timestamp: null
      });
    });

    return queue;
  }
};

// Ekspor untuk browser atau Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Matcher;
}
