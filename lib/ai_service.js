/**
 * MALAQBI CPMK Assistant - AI Service
 * Mendukung Google Gemini (gemini-3.8-flash via Interactions API & generateContent API) dan OpenAI (gpt-4o-mini / gpt-4o)
 */

const AIService = {
  /**
   * Normalisasi nama model Gemini & Auto-migrasi model legacy yang sudah dimatikan oleh Google
   */
  _normalizeGeminiModel(model) {
    let m = (model || '').trim().replace(/^models\//, '');
    if (!m) return 'gemini-3.5-flash-lite';

    // Model-model Gemini 2.x & 1.x sudah dimatikan permanen oleh Google AI Studio dengan pesan:
    // "This model is no longer available. Please update your code to use models/gemini-3.8-flash... We recommend you to use the Interactions API"
    // Target migrasi resmi Google AI Studio untuk pemrosesan agen & ekstraksi data adalah gemini-3.5-flash-lite
    if (m === 'gemini-2.0-flash' || m === 'gemini-2.5-flash' || m === 'gemini-2.5-flash-lite' || 
        m === 'gemini-2.5-flash-preview-tts' || m === 'gemini-2.5-pro' || m.startsWith('gemini-2.') || m.startsWith('gemini-1.')) {
      return 'gemini-3.5-flash-lite';
    }
    return m;
  },

  /**
   * Cek apakah error dari Gemini API dapat dicoba dialihkan ke model cadangan (failover)
   */
  _isFallbackEligible(errMsg) {
    const msg = (errMsg || '').toLowerCase();
    return msg.includes('high demand') ||
           msg.includes('spikes in demand') ||
           msg.includes('503') ||
           msg.includes('429') ||
           msg.includes('resource_exhausted') ||
           msg.includes('exhausted') ||
           msg.includes('overloaded') ||
           msg.includes('temporarily unavailable') ||
           msg.includes('no longer available') ||
           msg.includes('not found') ||
           msg.includes('is not supported') ||
           msg.includes('deprecated') ||
           msg.includes('capacity');
  },

  /**
   * Cek apakah error merupakan kegagalan autentikasi / API key tidak valid
   */
  _isAuthError(errMsg) {
    const msg = (errMsg || '').toLowerCase();
    return msg.includes('api_key_invalid') ||
           msg.includes('api key not valid') ||
           msg.includes('permission_denied') ||
           msg.includes('forbidden') ||
           msg.includes('unauthorized') ||
           msg.includes('401') ||
           msg.includes('403');
  },

  /**
   * Ekstraksi teks respon dari format Interactions API (Google AI Studio 2026) atau generateContent API
   */
  _extractGeminiResponseText(data) {
    if (!data) return '';
    // 1. Cek properti kemudahan output_text jika tersedia
    if (typeof data.output_text === 'string' && data.output_text.trim()) {
      return data.output_text.trim();
    }
    // 2. Format resmi Interactions API: mencari step bertipe 'model_output'
    if (Array.isArray(data.steps)) {
      for (const step of data.steps) {
        if (step?.type === 'model_output' && Array.isArray(step.content)) {
          const textBlock = step.content.find(c => c?.type === 'text' && typeof c.text === 'string');
          if (textBlock && textBlock.text.trim()) {
            return textBlock.text.trim();
          }
        }
      }
      // Fallback: periksa langkah terakhir di steps
      const lastStep = data.steps[data.steps.length - 1];
      if (lastStep?.content?.[0]?.text) {
        return lastStep.content[0].text.trim();
      }
    }
    // 3. Format endpoint generateContent (candidates[0].content.parts[0].text)
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    // 4. Fallback string teks mentah
    if (typeof data.text === 'string') {
      return data.text.trim();
    }
    return '';
  },

  /**
   * Panggilan tunggal ke endpoint model Gemini
   * Menggunakan Google Interactions API (standar resmi terbaru Google AI Studio)
   */
  async _callGeminiSingle(targetModel, prompt, apiKey, maxTokens = 1024) {
    let interactionsFailed = false;
    let interactionsError = null;

    // 1. Coba Google Interactions API
    try {
      const interactionsUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`;
      const payload = {
        model: targetModel,
        input: prompt
      };

      const res = await fetch(interactionsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const text = this._extractGeminiResponseText(data);
        if (text) {
          return { text, model: targetModel, apiType: 'interactions' };
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        interactionsError = new Error(`Gemini API Error: ${errMsg}`);
        interactionsFailed = true;

        // Jika error autentikasi atau overload / quota / high-demand / deprecated,
        // JANGAN buang waktu mencoba generateContent untuk model yang sama.
        // Langsung lempar error agar failover loop segera beralih ke model cadangan aktif berikutnya.
        if (this._isAuthError(errMsg) || this._isFallbackEligible(errMsg)) {
          throw interactionsError;
        }
      }
    } catch (e) {
      if (interactionsFailed || this._isAuthError(e.message) || this._isFallbackEligible(e.message)) {
        throw e;
      }
      console.warn('[Gemini Interactions API] Exception. Mencoba generateContent fallback:', e);
    }

    // 2. Fallback ke endpoint legacy generateContent jika diperlukan oleh custom endpoint
    const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const genPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    };

    const genRes = await fetch(genUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(genPayload)
    });

    if (!genRes.ok) {
      const errData = await genRes.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${genRes.status}: ${genRes.statusText}`;
      throw new Error(`Gemini API Error: ${errMsg}`);
    }

    const genData = await genRes.json();
    const text = this._extractGeminiResponseText(genData);
    return { text, model: targetModel, apiType: 'generateContent' };
  },

  /**
   * Memanggil Gemini API dengan dukungan auto-fallback multi-model cerdas
   */
  async _callGemini(prompt, apiKey, model, maxTokens = 1024) {
    const requestedModel = this._normalizeGeminiModel(model);

    // Prioritas rantai failover cerdas antar-model aktif (Gemini 3.x dan 4.x)
    // Model 2.x & 2.5 sudah dimatikan total oleh Google, sehingga seluruh fallback diarahkan ke model yang aktif
    const fallbackChains = {
      'gemini-3.5-flash-lite': ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-4-argon'],
      'gemini-3.8-flash': ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-4-argon'],
      'gemini-3.6-flash': ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-4-argon'],
      'gemini-4-argon': ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash']
    };

    const modelsToTry = [requestedModel];
    const alternates = fallbackChains[requestedModel] || ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];
    for (const alt of alternates) {
      if (!modelsToTry.includes(alt)) {
        modelsToTry.push(alt);
      }
    }

    let lastError = null;
    let originalErrorMsg = '';

    for (let i = 0; i < modelsToTry.length; i++) {
      const candidateModel = modelsToTry[i];
      try {
        const result = await this._callGeminiSingle(candidateModel, prompt, apiKey, maxTokens);
        if (i > 0) {
          result.fallbackUsed = true;
          result.originalModel = requestedModel;
          result.fallbackReason = originalErrorMsg;
        }
        return result;
      } catch (err) {
        lastError = err;
        const errMsg = err?.message || '';
        if (i === 0) {
          originalErrorMsg = errMsg;
        }

        // Cek jika error auth (API key salah) -> langsung lempar, jangan failover sia-sia
        if (this._isAuthError(errMsg)) {
          throw err;
        }

        console.warn(`[Gemini Model ${candidateModel} info] ${errMsg}. Mencoba model alternatif...`);
      }
    }

    throw lastError || new Error(`Gagal memanggil model Gemini: ${requestedModel}`);
  },

  /**
   * Tes koneksi API key
   */
  async testConnection(config) {
    const provider = config?.provider || 'gemini';
    const apiKey = config?.apiKey?.trim();
    let model = config?.model?.trim();
    if (provider === 'gemini') {
      model = this._normalizeGeminiModel(model);
    } else {
      model = model || 'gpt-4o-mini';
    }
    const baseUrl = config?.baseUrl?.trim();

    if (!apiKey) {
      throw new Error('API Key belum diisi. Silakan masukkan API Key di tab Pengaturan.');
    }

    const testPrompt = 'Balas satu kata saja: "PONG"';

    if (provider === 'gemini') {
      const result = await this._callGemini(testPrompt, apiKey, model, 20);
      return {
        success: true,
        reply: result.text,
        model: result.model,
        originalModel: result.originalModel || model,
        fallbackUsed: !!result.fallbackUsed,
        fallbackReason: result.fallbackReason || '',
        provider,
        apiType: result.apiType
      };
    } else {
      // OpenAI or OpenAI-compatible endpoint
      const endpoint = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model,
        messages: [{ role: 'user', content: testPrompt }],
        max_tokens: 20,
        temperature: 0.1
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        throw new Error(`OpenAI API Error: ${errMsg}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || '';
      return { success: true, reply, model, provider };
    }
  },

  /**
   * Panggil LLM generic (mengembalikan string respon)
   */
  async generateText(prompt, config) {
    const provider = config?.provider || 'gemini';
    const apiKey = config?.apiKey?.trim();
    let model = config?.model?.trim();
    if (provider === 'gemini') {
      model = this._normalizeGeminiModel(model);
    } else {
      model = model || 'gpt-4o-mini';
    }
    const baseUrl = config?.baseUrl?.trim();

    if (!apiKey) {
      throw new Error('API Key belum diatur di menu Pengaturan.');
    }

    if (provider === 'gemini') {
      const result = await this._callGemini(prompt, apiKey, model, 1024);
      return result.text;
    } else {
      const endpoint = baseUrl ? `${baseUrl.replace(/\/+$/, '')}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
      const payload = {
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `OpenAI Error ${res.status}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
    }
  },

  /**
   * Deteksi kolom Excel secara cerdas menggunakan AI
   */
  async detectColumnsWithAI(headers, sampleRows, config) {
    const prompt = `Anda adalah asisten sistem akademik kurikulum perguruan tinggi.
Tugas Anda adalah memetakan nama kolom dari tabel Excel ke 5 target kolom form MALAQBI:
1. "mata_kuliah": Kolom nama mata kuliah (contoh: 'Mata Kuliah', 'Nama MK')
2. "kode_mk": Kolom kode mata kuliah jika terpisah (contoh: 'Kode MK', 'Kode')
3. "kode_cpmk": Kolom kode CPMK (contoh: 'Kode CPMK', 'CPMK-1', 'CPMK-12.1')
4. "deskripsi_cpmk": Kolom isi rumusan / deskripsi CPMK (contoh: 'CPMK (Mahasiswa mampu ...)', 'Deskripsi CPMK')
5. "cpl_pendukung": Kolom CPL yang didukung (contoh: 'CPL', 'CPL Pendukung', 'Kode CPL')

Daftar kolom yang ada di file Excel:
${JSON.stringify(headers)}

Sampel 3 baris data:
${JSON.stringify(sampleRows.slice(0, 3), null, 2)}

Instruksi output:
Keluarkan HANYA JSON murni (tanpa markdown backticks, tanpa penjelasan apapun):
{
  "mata_kuliah": "nama_kolom_di_excel_atau_null",
  "kode_mk": "nama_kolom_di_excel_atau_null",
  "kode_cpmk": "nama_kolom_di_excel_atau_null",
  "deskripsi_cpmk": "nama_kolom_di_excel_atau_null",
  "cpl_pendukung": "nama_kolom_di_excel_atau_null"
}`;

    const rawResponse = await this.generateText(prompt, config);
    try {
      const cleanJson = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Gagal parsing output AI:', rawResponse);
      throw new Error('Respon AI bukan format JSON valid untuk pemetaan kolom.');
    }
  },

  /**
   * Pencocokan semantik jika ada opsi form yang tidak dapat dicocokkan secara lokal (fallback cerdas)
   */
  async matchOptionWithAI(queryText, options, fieldType, config) {
    if (!options || options.length === 0) return null;

    const prompt = `Anda bertugas mencocokkan nilai dari data Excel dengan opsi dropdown/radio form MALAQBI.
Tipe field: ${fieldType} (misal 'mata_kuliah' atau 'cpl_pendukung')
Nilai pencarian dari Excel: "${queryText}"

Daftar opsi yang tersedia di form:
${JSON.stringify(options.map(o => ({ value: o.value, text: o.text })))}

Instruksi:
Tentukan opsi yang PALING TEPAT mewakili nilai pencarian.
Keluarkan HANYA JSON murni:
{ "value": "ID_OPSI_YANG_DIPILIH", "confidence": 0.95 }
Jika sama sekali tidak ada yang cocok, return: { "value": null, "confidence": 0 }`;

    try {
      const rawResponse = await this.generateText(prompt, config);
      const cleanJson = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);
      return result.value || null;
    } catch (e) {
      console.warn('AI Match fallback error:', e);
      return null;
    }
  }
};

// Ekspor untuk browser environment atau Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIService;
}
