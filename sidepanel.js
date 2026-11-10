/**
 * MALAQBI CPMK Assistant - Side Panel Controller
 * Mengatur UI, parsing Excel via SheetJS, integrasi AI, antrian otomasi, dan sinkronisasi web MALAQBI
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const connectionBadge = document.getElementById('connection-badge');
  const connectionText = document.getElementById('connection-text');

  // Tab Queue Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowse = document.getElementById('btn-browse');
  const fileInfoBar = document.getElementById('file-info-bar');
  const fileName = document.getElementById('file-name');
  const fileSize = document.getElementById('file-size');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const sheetSelectorWrapper = document.getElementById('sheet-selector-wrapper');
  const selectSheet = document.getElementById('select-sheet');

  const mappingCard = document.getElementById('mapping-card');
  const btnAiDetect = document.getElementById('btn-ai-detect');
  const mapMK = document.getElementById('map-mk');
  const mapKodeMK = document.getElementById('map-kodemk');
  const mapKodeCPMK = document.getElementById('map-kodecpmk');
  const mapDesc = document.getElementById('map-desc');
  const mapCPL = document.getElementById('map-cpl');
  const checkDedupe = document.getElementById('check-dedupe');
  const checkSkipExisting = document.getElementById('check-skip-existing');
  const checkAutoSubmit = document.getElementById('check-autosubmit');
  const filterMK = document.getElementById('filter-mk');

  const queueControlsCard = document.getElementById('queue-controls-card');
  const statTotal = document.getElementById('stat-total');
  const statPending = document.getElementById('stat-pending');
  const statSuccess = document.getElementById('stat-success');
  const statSkipped = document.getElementById('stat-skipped');
  const statFailed = document.getElementById('stat-failed');
  const progressBar = document.getElementById('progress-bar');
  const queueStatusText = document.getElementById('queue-status-text');
  const queuePercentText = document.getElementById('queue-percent-text');
  const btnStartQueue = document.getElementById('btn-start-queue');
  const btnRetryFailed = document.getElementById('btn-retry-failed');
  const btnPauseQueue = document.getElementById('btn-pause-queue');
  const btnStopQueue = document.getElementById('btn-stop-queue');
  const inputDelay = document.getElementById('input-delay');

  const previewCard = document.getElementById('preview-card');
  const badgeQueueCount = document.getElementById('badge-queue-count');
  const queueTableBody = document.getElementById('queue-table-body');

  // Tab Settings Elements
  const providerRadios = document.querySelectorAll('input[name="ai-provider"]');
  const selectAiModel = document.getElementById('select-ai-model');
  const wrapperCustomModel = document.getElementById('wrapper-custom-model');
  const inputCustomModel = document.getElementById('input-custom-model');
  const inputApiKey = document.getElementById('input-api-key');
  const btnClearKey = document.getElementById('btn-clear-key');
  const badgeKeyStatus = document.getElementById('badge-key-status');
  const linkGemini = document.getElementById('link-provider-gemini');
  const linkOpenai = document.getElementById('link-provider-openai');
  const groupBaseUrl = document.getElementById('group-base-url');
  const inputBaseUrl = document.getElementById('input-base-url');
  const btnTestApi = document.getElementById('btn-test-api');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const apiTestResult = document.getElementById('api-test-result');

  const infoPageStatus = document.getElementById('info-page-status');
  const infoKurikulumCount = document.getElementById('info-kurikulum-count');
  const infoMKCount = document.getElementById('info-mk-count');
  const infoCPLCount = document.getElementById('info-cpl-count');
  const btnRefreshManifest = document.getElementById('btn-refresh-manifest');

  // Tab Logs Elements
  const logList = document.getElementById('log-list');
  const btnExportLog = document.getElementById('btn-export-log');
  const btnClearLog = document.getElementById('btn-clear-log');
  const toastEl = document.getElementById('toast');

  // State
  let currentWorkbook = null;
  let currentRawData = []; // Raw rows from selected sheet
  let currentHeaders = [];
  let currentQueue = [];
  let isRunning = false;
  let activeTabManifest = null;
  let activityLogs = [];

  const AI_MODELS = {
    gemini: [
      { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite (Sangat Direkomendasikan & Bebas Overload)' },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Model Terbaru Google Studio)' },
      { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash (Cepat & Stabil)' },
      { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Penalaran Flagship 2026)' },
      { id: 'custom', name: 'Model Kustom (Ketik Manual)...' }
    ],
    openai: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Sangat Direkomendasikan & Sangat Cepat)' },
      { id: 'gpt-4o', name: 'GPT-4o Standard' },
      { id: 'o3-mini', name: 'o3-mini (Reasoning Cepat)' },
      { id: 'custom', name: 'Model Kustom (Ketik Manual)...' }
    ]
  };

  /* ================= 1. TAB MANAGEMENT ================= */
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.dataset.tab;
      document.getElementById(targetId)?.classList.add('active');
    });
  });

  /* ================= 2. TOAST & LOG HELPER ================= */
  function showToast(message, duration = 3000) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.style.display = 'block';
    setTimeout(() => {
      toastEl.style.display = 'none';
    }, duration);
  }

  function addLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString('id-ID');
    activityLogs.push({ time, message, type });

    if (logList) {
      if (activityLogs.length === 1 && logList.querySelector('.text-center')) {
        logList.innerHTML = '';
      }
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.innerHTML = `<span class="log-time">[${time}]</span> ${escapeHtml(message)}`;
      logList.appendChild(entry);
      logList.scrollTop = logList.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ================= 3. SETTINGS & AI CONFIGURATION ================= */
  // In-memory secured API keys (tidak dibocorkan ke DOM saat tersimpan)
  const storedApiKeys = {
    gemini: '',
    openai: ''
  };

  const MASK_PLACEHOLDER = '••••••••••••••••••••••••••••••••';

  function updateProviderLinks(activeProvider) {
    if (activeProvider === 'gemini') {
      linkGemini?.classList.add('active');
      linkOpenai?.classList.remove('active');
    } else {
      linkOpenai?.classList.add('active');
      linkGemini?.classList.remove('active');
    }
  }

  function renderApiKeyField(provider) {
    const key = storedApiKeys[provider] || '';
    if (key) {
      inputApiKey.value = MASK_PLACEHOLDER;
      inputApiKey.dataset.masked = 'true';
      inputApiKey.readOnly = true;
      if (btnClearKey) btnClearKey.style.display = 'block';
      if (badgeKeyStatus) badgeKeyStatus.style.display = 'inline-flex';
    } else {
      inputApiKey.value = '';
      inputApiKey.dataset.masked = 'false';
      inputApiKey.readOnly = false;
      if (btnClearKey) btnClearKey.style.display = 'none';
      if (badgeKeyStatus) badgeKeyStatus.style.display = 'none';
    }
  }

  function updateModelOptions(provider, selectedModel) {
    selectAiModel.innerHTML = '';
    const models = AI_MODELS[provider] || [];
    let matchFound = false;

    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (selectedModel && selectedModel === m.id) {
        opt.selected = true;
        matchFound = true;
      }
      selectAiModel.appendChild(opt);
    });

    if (!matchFound && selectedModel && selectedModel !== 'custom') {
      selectAiModel.value = 'custom';
      if (wrapperCustomModel) {
        wrapperCustomModel.style.display = 'block';
        if (inputCustomModel) inputCustomModel.value = selectedModel;
      }
    } else if (selectAiModel.value === 'custom') {
      if (wrapperCustomModel) wrapperCustomModel.style.display = 'block';
    } else {
      if (wrapperCustomModel) wrapperCustomModel.style.display = 'none';
    }

    if (provider === 'openai') {
      groupBaseUrl.style.display = 'flex';
    } else {
      groupBaseUrl.style.display = 'none';
    }
  }

  function updateSelectedModelInUI(newModel) {
    if (!newModel) return;
    const provider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';
    const models = AI_MODELS[provider] || [];
    const exists = models.some(m => m.id === newModel);
    if (exists) {
      selectAiModel.value = newModel;
      if (wrapperCustomModel) wrapperCustomModel.style.display = 'none';
    } else {
      selectAiModel.value = 'custom';
      if (wrapperCustomModel) {
        wrapperCustomModel.style.display = 'block';
        if (inputCustomModel) inputCustomModel.value = newModel;
      }
    }
  }

  selectAiModel?.addEventListener('change', () => {
    if (selectAiModel.value === 'custom') {
      if (wrapperCustomModel) {
        wrapperCustomModel.style.display = 'block';
        if (inputCustomModel) inputCustomModel.focus();
      }
    } else {
      if (wrapperCustomModel) {
        wrapperCustomModel.style.display = 'none';
      }
    }
  });

  async function loadSettings() {
    const res = await chrome.storage.local.get(['malaqbi_ai_config']);
    const config = res.malaqbi_ai_config || {
      provider: 'gemini',
      model: 'gemini-3.5-flash-lite',
      apiKey: '',
      baseUrl: ''
    };

    // Auto-migrasi model legacy Google Gemini yang sudah dimatikan permanen oleh Google AI Studio
    if (config.provider === 'gemini') {
      const m = config.model || '';
      if (!m || m.includes('gemini-2.') || m.includes('gemini-1.') || m === 'gemini-2.5-flash' || m === 'gemini-2.0-flash') {
        config.model = 'gemini-3.5-flash-lite';
        chrome.storage.local.set({ malaqbi_ai_config: config }).catch(() => {});
      }
    }

    // Muat kunci per provider (mendukung format baru dan migrasi legacy)
    if (config.apiKeys) {
      storedApiKeys.gemini = config.apiKeys.gemini || '';
      storedApiKeys.openai = config.apiKeys.openai || '';
    }
    if (config.apiKey && !storedApiKeys[config.provider]) {
      storedApiKeys[config.provider] = config.apiKey;
    }

    // Set Provider
    providerRadios.forEach(r => {
      r.checked = r.value === config.provider;
    });

    updateProviderLinks(config.provider);
    updateModelOptions(config.provider, config.model || (config.provider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4o-mini'));
    renderApiKeyField(config.provider);
    inputBaseUrl.value = config.baseUrl || '';
  }

  async function getActiveAiConfig() {
    const selectedProvider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';
    const isMasked = inputApiKey.dataset.masked === 'true';
    const currentKey = isMasked ? (storedApiKeys[selectedProvider] || '') : inputApiKey.value.trim();
    let currentModel = selectAiModel.value;

    if (currentModel === 'custom') {
      currentModel = inputCustomModel?.value?.trim() || '';
    }

    if (!currentModel) {
      currentModel = selectedProvider === 'gemini' ? 'gemini-3.5-flash-lite' : 'gpt-4o-mini';
    }

    return {
      provider: selectedProvider,
      model: currentModel,
      apiKey: currentKey,
      baseUrl: inputBaseUrl.value.trim()
    };
  }

  providerRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const prov = e.target.value;
      updateProviderLinks(prov);
      updateModelOptions(prov);
      renderApiKeyField(prov);
    });
  });

  // Tombol Ganti / Hapus API Key (Clear & Unlock)
  btnClearKey?.addEventListener('click', () => {
    const selectedProvider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';
    storedApiKeys[selectedProvider] = '';
    inputApiKey.value = '';
    inputApiKey.dataset.masked = 'false';
    inputApiKey.readOnly = false;
    btnClearKey.style.display = 'none';
    if (badgeKeyStatus) badgeKeyStatus.style.display = 'none';
    inputApiKey.focus();
    showToast('Silakan masukkan API Key baru.');
  });

  // Proteksi Keamanan API Key: Anti-Intip & Anti-Copy
  inputApiKey?.addEventListener('copy', (e) => {
    e.preventDefault();
    showToast('Penyalinan API Key diblokir demi keamanan privasi.');
    return false;
  });

  inputApiKey?.addEventListener('cut', (e) => {
    e.preventDefault();
    return false;
  });

  inputApiKey?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  });

  inputApiKey?.addEventListener('dragstart', (e) => {
    e.preventDefault();
    return false;
  });

  inputApiKey?.addEventListener('input', () => {
    inputApiKey.dataset.masked = 'false';
  });

  btnTestApi?.addEventListener('click', async () => {
    const config = await getActiveAiConfig();
    apiTestResult.style.display = 'block';
    apiTestResult.className = 'alert text-xs p-2.5 rounded-md bg-slate-100 text-slate-700 mt-3';
    apiTestResult.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Menghubungi endpoint API AI...';

    try {
      btnTestApi.disabled = true;
      const res = await AIService.testConnection(config);
      const apiInfo = res.apiType === 'interactions' ? ' • Interactions API' : (res.apiType ? ` • ${res.apiType}` : '');

      let noteHtml = '';
      if (res.fallbackUsed) {
        noteHtml = `<div class="mt-2 p-2 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[11px] leading-relaxed text-left">
          <i class="fa-solid fa-triangle-exclamation text-amber-600 mr-1"></i>
          <strong>Auto-Failover Aktif:</strong> Model <code>${escapeHtml(res.originalModel)}</code> sedang mengalami kendala kapasitas / high demand (<em>${escapeHtml(res.fallbackReason || 'High Demand')}</em>). Sistem berhasil mengalihkan koneksi ke <strong><code>${escapeHtml(res.model)}</code></strong>! Opsi model otomatis disinkronkan ke <code>${escapeHtml(res.model)}</code>. Silakan klik tombol <strong>Simpan</strong> di bawah.
        </div>`;
        updateSelectedModelInUI(res.model);
      }

      apiTestResult.className = 'alert text-xs p-2.5 rounded-md bg-rose-50 text-maroon border border-rose-200 mt-3';
      apiTestResult.innerHTML = `<i class="fa-solid fa-circle-check text-maroon mr-1.5"></i><strong>Koneksi Berhasil!</strong> Provider: ${res.provider.toUpperCase()} (<code>${escapeHtml(res.model)}</code>${apiInfo}) merespons: "${escapeHtml(res.reply)}"${noteHtml}`;
      addLog(`Tes koneksi API ${res.provider} (${res.model}${apiInfo}) berhasil.${res.fallbackUsed ? ` (Dialihkan dari ${res.originalModel})` : ''}`, 'success');
    } catch (err) {
      apiTestResult.className = 'alert text-xs p-2.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 mt-3';
      apiTestResult.innerHTML = `<i class="fa-solid fa-circle-xmark text-rose-600 mr-1.5"></i><strong>Koneksi Gagal:</strong> ${escapeHtml(err.message)}`;
      addLog(`Tes koneksi API gagal: ${err.message}`, 'error');
    } finally {
      btnTestApi.disabled = false;
    }
  });

  btnSaveSettings?.addEventListener('click', async () => {
    const selectedProvider = document.querySelector('input[name="ai-provider"]:checked')?.value || 'gemini';
    const isMasked = inputApiKey.dataset.masked === 'true';
    const enteredKey = inputApiKey.value.trim();
    const finalKey = isMasked ? (storedApiKeys[selectedProvider] || '') : enteredKey;

    storedApiKeys[selectedProvider] = finalKey;

    let chosenModel = selectAiModel.value;
    if (chosenModel === 'custom') {
      chosenModel = inputCustomModel?.value?.trim() || '';
    }

    const config = {
      provider: selectedProvider,
      model: chosenModel,
      apiKey: finalKey,
      apiKeys: storedApiKeys,
      baseUrl: inputBaseUrl.value.trim()
    };

    await chrome.storage.local.set({ malaqbi_ai_config: config });
    renderApiKeyField(selectedProvider);
    showToast('Pengaturan AI & API Key berhasil diamankan dan disimpan.');
    addLog(`Pengaturan AI disimpan: ${selectedProvider} (${chosenModel}).`, 'info');
  });

  /* ================= 4. DETEKSI STATUS WEB MALAQBI ================= */
  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        setConnectionState('offline', 'Tab tidak terdeteksi');
        return;
      }

      if (tab.url.includes('malaqbi.unsulbar.ac.id/admin/cpmk/create')) {
        setConnectionState('online', 'Form Tambah CPMK');
        requestManifestFromTab(tab.id);
      } else if (tab.url.includes('malaqbi.unsulbar.ac.id/admin/cpmk')) {
        setConnectionState('warning', 'Daftar CPMK (Index)');
        requestManifestFromTab(tab.id);
      } else if (tab.url.includes('malaqbi.unsulbar.ac.id')) {
        setConnectionState('warning', 'Portal MALAQBI');
      } else {
        setConnectionState('offline', 'Buka MALAQBI di browser');
      }
    } catch (e) {
      console.warn('Gagal membaca tab aktif:', e);
      setConnectionState('offline', 'MALAQBI belum dibuka');
    }
  }

  function setConnectionState(state, text) {
    connectionBadge.className = `badge badge-${state}`;
    connectionText.textContent = text;
    if (infoPageStatus) infoPageStatus.textContent = text;
  }

  async function requestManifestFromTab(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { action: 'GET_MANIFEST' });
      if (response) {
        activeTabManifest = response;
        if (infoKurikulumCount) infoKurikulumCount.textContent = `${response.kurikulum?.length || 0} kurikulum`;
        if (infoMKCount) infoMKCount.textContent = `${response.mataKuliah?.length || 0} mata kuliah`;
        if (infoCPLCount) infoCPLCount.textContent = `${response.cpl?.length || 0} CPL`;
      }
    } catch (e) {
      // Content script mungkin belum selesai inject
      console.log('Menunggu content script siap...');
    }
  }

  btnRefreshManifest?.addEventListener('click', () => {
    checkActiveTab();
    showToast('Memperbarui data dari halaman web...');
  });

  /* ================= 5. PARSER EXCEL DENGAN SHEETJS ================= */
  btnBrowse?.addEventListener('click', () => fileInput.click());

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedFile(e.target.files[0]);
    }
  });

  btnRemoveFile?.addEventListener('click', () => {
    resetExcelState();
  });

  function resetExcelState() {
    currentWorkbook = null;
    currentRawData = [];
    currentHeaders = [];
    currentQueue = [];
    fileInput.value = '';

    fileInfoBar.style.display = 'none';
    sheetSelectorWrapper.style.display = 'none';
    mappingCard.style.display = 'none';
    queueControlsCard.style.display = 'none';
    previewCard.style.display = 'none';
    dropzone.style.display = 'block';

    updateStats();
    addLog('File Excel dihapus.', 'info');
  }

  async function handleSelectedFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      showToast('Gunakan file Excel (.xlsx, .xls) atau CSV.');
      return;
    }

    fileName.textContent = file.name;
    fileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
    dropzone.style.display = 'none';
    fileInfoBar.style.display = 'flex';

    addLog(`Membaca file "${file.name}"...`, 'info');

    try {
      const buffer = await file.arrayBuffer();
      currentWorkbook = XLSX.read(buffer, { type: 'array' });

      // Populate sheet selector
      selectSheet.innerHTML = '';
      currentWorkbook.SheetNames.forEach((sName, idx) => {
        const opt = document.createElement('option');
        opt.value = sName;
        opt.textContent = sName;
        selectSheet.appendChild(opt);
      });

      sheetSelectorWrapper.style.display = 'block';

      // Pilih sheet pertama atau sheet bernama "Rincian" / mengandung "CPMK"
      let defaultSheet = currentWorkbook.SheetNames[0];
      const preferred = currentWorkbook.SheetNames.find(n =>
        n.toLowerCase().includes('rincian') || n.toLowerCase().includes('cpmk')
      );
      if (preferred) defaultSheet = preferred;
      selectSheet.value = defaultSheet;

      loadSheetData(defaultSheet);
    } catch (err) {
      console.error('Gagal membaca file Excel:', err);
      showToast(`Gagal membaca Excel: ${err.message}`);
      addLog(`Error parsing file: ${err.message}`, 'error');
      resetExcelState();
    }
  }

  selectSheet?.addEventListener('change', (e) => {
    if (currentWorkbook) {
      loadSheetData(e.target.value);
    }
  });

  /**
   * Membaca isi sheet, mendeteksi baris header secara cerdas, dan mengisi opsi mapping
   */
  function loadSheetData(sheetName) {
    const sheet = currentWorkbook.Sheets[sheetName];
    if (!sheet) return;

    // Convert sheet ke array of arrays untuk mendeteksi header row secara dinamis
    const rawMatrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rawMatrix || rawMatrix.length === 0) {
      showToast('Sheet kosong!');
      return;
    }

    // Cari baris header (pastikan memiliki minimal 3 kolom non-kosong agar bukan baris judul)
    let headerRowIdx = 0;
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

    // Ambil header
    currentHeaders = rawMatrix[headerRowIdx].map(h => String(h || '').trim()).filter(h => h.length > 0);
    addLog(`Sheet "${sheetName}": Baris header ditemukan di baris ke-${headerRowIdx + 1} (${currentHeaders.length} kolom).`, 'info');

    // Parse baris-baris data di bawah header
    const dataRows = [];
    for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
      const rowVals = rawMatrix[r];
      // Jika baris kosong seluruhnya, lewati
      if (!rowVals.some(v => v !== '')) continue;

      const rowObj = {};
      currentHeaders.forEach((headerName, colIdx) => {
        rowObj[headerName] = rowVals[colIdx] !== undefined ? rowVals[colIdx] : '';
      });
      dataRows.push(rowObj);
    }

    currentRawData = dataRows;
    addLog(`Sheet "${sheetName}": Memuat ${currentRawData.length} baris data.`, 'success');

    // Tampilkan Card Mapping dan isi dropdown
    populateMappingDropdowns();

    // Jalankan deteksi heuristik otomatis
    applyHeuristicMapping();

    // Buat antrian awal
    generateQueue();
  }

  function populateMappingDropdowns() {
    const selects = [mapMK, mapKodeMK, mapKodeCPMK, mapDesc, mapCPL];
    selects.forEach(sel => {
      sel.innerHTML = '<option value="">-- Pilih Kolom --</option>';
      currentHeaders.forEach(h => {
        const opt = document.createElement('option');
        opt.value = h;
        opt.textContent = h;
        sel.appendChild(opt);
      });
    });

    mappingCard.style.display = 'block';
  }

  function applyHeuristicMapping() {
    const heuristic = Matcher.detectColumnsHeuristic(currentHeaders);

    if (heuristic.mata_kuliah) mapMK.value = heuristic.mata_kuliah;
    if (heuristic.kode_mk) mapKodeMK.value = heuristic.kode_mk;
    if (heuristic.kode_cpmk) mapKodeCPMK.value = heuristic.kode_cpmk;
    if (heuristic.deskripsi_cpmk) mapDesc.value = heuristic.deskripsi_cpmk;
    if (heuristic.cpl_pendukung) mapCPL.value = heuristic.cpl_pendukung;

    addLog(`Pemetaan kolom otomatis: MK=[${mapMK.value}], CPMK=[${mapKodeCPMK.value}], CPL=[${mapCPL.value}]`, 'info');
  }

  // Tombol Deteksi Kolom dengan AI
  btnAiDetect?.addEventListener('click', async () => {
    if (currentHeaders.length === 0) return;

    const config = await getActiveAiConfig();
    btnAiDetect.disabled = true;
    btnAiDetect.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i><span>Menganalisis...</span>';

    try {
      addLog(`Menjalankan deteksi AI (${config.provider} - ${config.model})...`, 'info');
      const aiMap = await AIService.detectColumnsWithAI(currentHeaders, currentRawData.slice(0, 3), config);

      if (aiMap.mata_kuliah && currentHeaders.includes(aiMap.mata_kuliah)) mapMK.value = aiMap.mata_kuliah;
      if (aiMap.kode_mk && currentHeaders.includes(aiMap.kode_mk)) mapKodeMK.value = aiMap.kode_mk;
      if (aiMap.kode_cpmk && currentHeaders.includes(aiMap.kode_cpmk)) mapKodeCPMK.value = aiMap.kode_cpmk;
      if (aiMap.deskripsi_cpmk && currentHeaders.includes(aiMap.deskripsi_cpmk)) mapDesc.value = aiMap.deskripsi_cpmk;
      if (aiMap.cpl_pendukung && currentHeaders.includes(aiMap.cpl_pendukung)) mapCPL.value = aiMap.cpl_pendukung;

      showToast('Kolom berhasil dipetakan secara cerdas oleh AI.');
      addLog('Pemetaan AI berhasil diaplikasikan.', 'success');
      generateQueue();
    } catch (err) {
      showToast(`Gagal deteksi AI: ${err.message}`);
      addLog(`Deteksi AI gagal: ${err.message}`, 'error');
    } finally {
      btnAiDetect.disabled = false;
      btnAiDetect.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-1.5"></i><span>Deteksi AI</span>';
    }
  });

  // Re-generate antrian saat mapping atau filter diubah
  [mapMK, mapKodeMK, mapKodeCPMK, mapDesc, mapCPL, checkDedupe, checkSkipExisting, filterMK].forEach(el => {
    el?.addEventListener('change', () => {
      generateQueue();
    });
  });

  /* ================= 6. GENERASI & PREVIEW ANTRIAN ================= */
  function generateQueue() {
    const mapping = {
      mata_kuliah: mapMK.value,
      kode_mk: mapKodeMK.value,
      kode_cpmk: mapKodeCPMK.value,
      deskripsi_cpmk: mapDesc.value,
      cpl_pendukung: mapCPL.value
    };

    if (!mapping.mata_kuliah || !mapping.kode_cpmk) {
      queueControlsCard.style.display = 'none';
      previewCard.style.display = 'none';
      return;
    }

    const deduplicate = checkDedupe.checked;
    let queue = Matcher.buildQueue(currentRawData, mapping, { deduplicate });

    // Deteksi awal jika ada data yang sudah terdaftar di halaman MALAQBI (jika tabel terbaca)
    if (checkSkipExisting?.checked && activeTabManifest?.existingCPMK?.length > 0) {
      let preSkipped = 0;
      queue.forEach(item => {
        const itemCode = (item.kodeCPMK || '').trim().toLowerCase();
        const itemMKCode = (item.kodeMK || '').trim().toLowerCase();
        const itemMKName = (item.namaMK || '').trim().toLowerCase();

        const exists = activeTabManifest.existingCPMK.some(ex => {
          const exCode = (ex.kode || '').trim().toLowerCase();
          if (exCode !== itemCode) return false;
          if (ex.mk) {
            const exMK = ex.mk.toLowerCase();
            return (itemMKCode && exMK.includes(itemMKCode)) || (itemMKName && exMK.includes(itemMKName));
          }
          return true;
        });

        if (exists) {
          item.status = 'skipped';
          item.errorMessage = 'Sudah terdaftar di tabel MALAQBI (Dilewati otomatis)';
          item.timestamp = new Date().toLocaleTimeString('id-ID');
          preSkipped++;
        }
      });

      if (preSkipped > 0) {
        addLog(`Terdeteksi ${preSkipped} CPMK sudah ada di tabel MALAQBI (Dilewati otomatis).`, 'skip');
      }
    }

    // Isi opsi Filter Mata Kuliah jika belum diisi atau berubah
    populateMKFilterOptions(queue);

    // Terapkan filter MK jika dipilih
    const selectedMK = filterMK.value;
    if (selectedMK && selectedMK !== 'ALL') {
      queue = queue.filter(item => {
        const id = (item.kodeMK ? `[${item.kodeMK}] ` : '') + item.namaMK;
        return id === selectedMK;
      });
    }

    currentQueue = queue;

    // Tampilkan Card Controls & Card Preview
    queueControlsCard.style.display = 'block';
    previewCard.style.display = 'block';

    updateStats();
    renderQueueTable();

    const pendingCount = queue.filter(q => q.status === 'pending').length;
    const skipCount = queue.filter(q => q.status === 'skipped').length;
    addLog(`Antrian disiapkan: ${queue.length} CPMK total (${pendingCount} antri, ${skipCount} dilewati).`, 'info');
  }

  function populateMKFilterOptions(allQueueItems) {
    const currentVal = filterMK.value;
    const mkSet = new Set();
    allQueueItems.forEach(item => {
      const label = (item.kodeMK ? `[${item.kodeMK}] ` : '') + item.namaMK;
      if (label.trim()) mkSet.add(label.trim());
    });

    filterMK.innerHTML = '<option value="ALL">-- Semua Mata Kuliah --</option>';
    Array.from(mkSet).sort().forEach(mkName => {
      const opt = document.createElement('option');
      opt.value = mkName;
      opt.textContent = mkName;
      if (mkName === currentVal) opt.selected = true;
      filterMK.appendChild(opt);
    });
  }

  function renderQueueTable() {
    queueTableBody.innerHTML = '';
    badgeQueueCount.textContent = `${currentQueue.length} Data`;

    currentQueue.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.id = `row-${item.id}`;
      tr.className = `row-${item.status}`;

      const mkDisplay = (item.kodeMK ? `<strong>[${escapeHtml(item.kodeMK)}]</strong> ` : '') + escapeHtml(item.namaMK);
      const cplDisplay = item.cpl ? `<span class="badge badge-maroon">${escapeHtml(item.cpl)}</span>` : '-';

      let statusBadge = '';
      const tooltip = item.errorMessage ? `title="${escapeHtml(item.errorMessage)}"` : '';
      if (item.status === 'skipped') {
        statusBadge = `<span class="status-badge status-skipped" ${tooltip}>Dilewati</span>`;
      } else if (item.status === 'success') {
        statusBadge = `<span class="status-badge status-success">Sukses</span>`;
      } else if (item.status === 'failed') {
        statusBadge = `<span class="status-badge status-failed" ${tooltip}>Gagal</span>`;
      } else if (item.status === 'processing') {
        statusBadge = `<span class="status-badge status-processing">Proses</span>`;
      } else {
        statusBadge = `<span class="status-badge status-pending">Antri</span>`;
      }

      tr.innerHTML = `
        <td class="text-slate-500">${idx + 1}</td>
        <td><div class="max-w-[130px] truncate" title="${escapeHtml(item.namaMK)}">${mkDisplay}</div></td>
        <td><strong>${escapeHtml(item.kodeCPMK)}</strong></td>
        <td>${cplDisplay}</td>
        <td>${statusBadge}</td>
      `;
      queueTableBody.appendChild(tr);
    });
  }

  function updateStats() {
    const total = currentQueue.length;
    const success = currentQueue.filter(q => q.status === 'success').length;
    const skipped = currentQueue.filter(q => q.status === 'skipped').length;
    const failed = currentQueue.filter(q => q.status === 'failed').length;
    const pending = currentQueue.filter(q => q.status === 'pending').length;

    statTotal.textContent = total;
    statSuccess.textContent = success;
    if (statSkipped) statSkipped.textContent = skipped;
    statFailed.textContent = failed;
    statPending.textContent = pending;

    const processed = success + failed + skipped;
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    queuePercentText.textContent = `${percent}%`;

    if (isRunning) {
      queueStatusText.textContent = `Memproses... (${processed}/${total}) | ${skipped} dilewati`;
    } else if (total > 0 && percent === 100) {
      queueStatusText.textContent = `Selesai! (${success} Sukses, ${skipped} Dilewati, ${failed} Gagal)`;
    } else {
      queueStatusText.textContent = total > 0
        ? `Siap (${pending} antri, ${skipped} dilewati${failed > 0 ? `, ${failed} gagal` : ''})`
        : 'Menunggu data';
    }

    // Tampilkan tombol Ulangi Gagal jika ada kegagalan dan antrian sedang tidak berjalan
    if (btnRetryFailed) {
      btnRetryFailed.style.display = (!isRunning && failed > 0) ? 'inline-flex' : 'none';
    }
  }

  /* ================= 7. KONTROL EKSEKUSI OTOMASI ================= */
  btnRetryFailed?.addEventListener('click', async () => {
    let resetCount = 0;
    currentQueue.forEach(q => {
      if (q.status === 'failed') {
        q.status = 'pending';
        delete q.errorMessage;
        resetCount++;
      }
    });
    if (resetCount > 0) {
      showToast(`${resetCount} item gagal dikembalikan ke antrian.`);
      addLog(`${resetCount} item gagal dikembalikan ke antrian untuk diproses ulang.`, 'info');
      await chrome.storage.local.set({ malaqbi_queue: currentQueue });
      updateStats();
      renderQueueTable();
      btnStartQueue?.click();
    } else {
      showToast('Tidak ada item yang berstatus gagal.');
    }
  });

  btnStartQueue?.addEventListener('click', async () => {
    if (currentQueue.length === 0) {
      showToast('Belum ada antrian yang disiapkan.');
      return;
    }

    // Auto-heal item yang sebelumnya terkena false-positive deteksi error "Hapus"
    currentQueue.forEach(q => {
      if (q.status === 'failed' && q.errorMessage && q.errorMessage.toLowerCase().includes('hapus')) {
        q.status = 'pending';
        delete q.errorMessage;
      }
    });

    // Pastikan tab aktif adalah MALAQBI
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('malaqbi.unsulbar.ac.id')) {
      const confirmOpen = confirm('Tab aktif bukan halaman MALAQBI. Ingin membuka halaman CPMK MALAQBI sekarang?');
      if (confirmOpen) {
        chrome.tabs.create({ url: 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create' });
      }
      return;
    }

    isRunning = true;
    btnStartQueue.style.display = 'none';
    if (btnRetryFailed) btnRetryFailed.style.display = 'none';
    btnPauseQueue.style.display = 'inline-flex';
    btnStopQueue.style.display = 'inline-flex';

    const autoSubmit = checkAutoSubmit.checked;
    const delaySec = parseFloat(inputDelay.value) || 1.5;
    const delayMs = Math.round(delaySec * 1000);

    // Cari pending index pertama
    let firstPendingIdx = currentQueue.findIndex(q => q.status === 'pending');
    if (firstPendingIdx === -1) {
      // Jika tidak ada pending, periksa apakah ada yang failed untuk diulang
      const hasFailed = currentQueue.some(q => q.status === 'failed');
      if (hasFailed) {
        currentQueue.forEach(q => {
          if (q.status === 'failed') {
            q.status = 'pending';
            delete q.errorMessage;
          }
        });
        firstPendingIdx = currentQueue.findIndex(q => q.status === 'pending');
      } else {
        // Jika semua sudah sukses / dilewati, ulangi semua
        currentQueue.forEach(q => q.status = 'pending');
        firstPendingIdx = 0;
      }
    }

    // Simpan antrian ke chrome.storage.local agar persisten saat navigasi antar halaman
    await chrome.storage.local.set({
      malaqbi_queue: currentQueue,
      malaqbi_queue_index: firstPendingIdx,
      malaqbi_is_running: true,
      malaqbi_auto_submit: autoSubmit,
      malaqbi_delay_ms: delayMs
    });

    addLog(`Otomasi dimulai! Item #1: [${currentQueue[firstPendingIdx].kodeMK}] ${currentQueue[firstPendingIdx].kodeCPMK}`, 'info');
    updateStats();

    // Trigger tab aktif untuk mulai proses
    if (tab.url.includes('/admin/cpmk/create')) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'FILL_FORM',
        payload: {
          item: currentQueue[firstPendingIdx],
          autoSubmit,
          delayMs
        }
      }).catch(err => console.log('Message sent to create page:', err));
    } else {
      // Navigasi ke create
      chrome.tabs.sendMessage(tab.id, { action: 'NAVIGATE_TO_CREATE' }).catch(() => {
        chrome.tabs.update(tab.id, { url: 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create' });
      });
    }
  });

  btnPauseQueue?.addEventListener('click', async () => {
    isRunning = false;
    await chrome.storage.local.set({ malaqbi_is_running: false });
    btnStartQueue.style.display = 'inline-flex';
    btnPauseQueue.style.display = 'none';
    showToast('Otomasi dijeda.');
    addLog('Otomasi dijeda oleh pengguna.', 'warn');
    updateStats();
  });

  btnStopQueue?.addEventListener('click', async () => {
    isRunning = false;
    await chrome.storage.local.set({ malaqbi_is_running: false });
    btnStartQueue.style.display = 'inline-flex';
    btnPauseQueue.style.display = 'none';
    btnStopQueue.style.display = 'none';
    showToast('Otomasi dihentikan.');
    addLog('Otomasi dihentikan.', 'error');
    updateStats();
  });

  /* ================= 8. LISTENER BROADCAST DARI CONTENT SCRIPT ================= */
  chrome.runtime.onMessage.addListener((message) => {
    const { action, payload } = message || {};

    if (action === 'QUEUE_STATUS_UPDATE') {
      const { queue, index, status, error } = payload || {};
      if (queue) {
        currentQueue = queue;
        updateStats();
        renderQueueTable();
      }

      if (status === 'processing') {
        const item = currentQueue[index];
        addLog(`Sedang mengisi: [${item?.kodeMK || ''}] ${item?.kodeCPMK || ''}...`, 'info');
        const activeRow = document.getElementById(`row-${item?.id}`);
        if (activeRow) {
          activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      } else if (status === 'item_success') {
        const item = currentQueue[index];
        addLog(`Berhasil disimpan: [${item?.kodeMK || ''}] ${item?.kodeCPMK || ''}`, 'success');
      } else if (status === 'item_skipped') {
        const item = currentQueue[index];
        addLog(`[DILEWATI] ${item?.kodeCPMK || ''} (${item?.kodeMK || ''}): ${payload?.reason || 'Kode sudah ada di sistem'}`, 'skip');
      } else if (status === 'error') {
        const item = currentQueue[index];
        addLog(`Gagal: ${error} (pada ${item?.kodeCPMK || ''})`, 'error');
        isRunning = false;
        btnStartQueue.style.display = 'inline-flex';
        btnPauseQueue.style.display = 'none';
        showToast(`Terhenti: ${error}`);
      }
    }

    if (action === 'QUEUE_FINISHED') {
      isRunning = false;
      btnStartQueue.style.display = 'inline-flex';
      btnPauseQueue.style.display = 'none';
      btnStopQueue.style.display = 'none';
      if (payload?.queue) currentQueue = payload.queue;
      updateStats();
      renderQueueTable();
      showToast('Seluruh antrian data CPMK berhasil diproses!');
      addLog('Semua antrian selesai diproses dengan sukses!', 'success');
    }
  });

  /* ================= 9. EKSPOR LOG ================= */
  btnExportLog?.addEventListener('click', () => {
    if (activityLogs.length === 0) {
      showToast('Belum ada log yang tercatat.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,Waktu,Tipe,Pesan\n';
    activityLogs.forEach(l => {
      csvContent += `"${l.time}","${l.type}","${l.message.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `malaqbi_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  btnClearLog?.addEventListener('click', () => {
    activityLogs = [];
    logList.innerHTML = '<div class="text-xs text-slate-400 text-center py-6">Log telah dibersihkan.</div>';
    showToast('Log aktivitas dibersihkan.');
  });

  /* Inisialisasi awal */
  await loadSettings();
  await checkActiveTab();

  // Pulihkan antrian dari storage jika ada
  try {
    const saved = await chrome.storage.local.get([
      'malaqbi_queue',
      'malaqbi_is_running',
      'malaqbi_queue_index',
      'malaqbi_auto_submit',
      'malaqbi_delay_ms'
    ]);
    if (saved.malaqbi_queue && saved.malaqbi_queue.length > 0) {
      currentQueue = saved.malaqbi_queue;
      // Auto-heal item yang sebelumnya terkena false-positive deteksi error "Hapus"
      let healedCount = 0;
      currentQueue.forEach(q => {
        if (q.status === 'failed' && q.errorMessage && q.errorMessage.toLowerCase().includes('hapus')) {
          q.status = 'pending';
          delete q.errorMessage;
          healedCount++;
        }
      });
      if (healedCount > 0) {
        await chrome.storage.local.set({ malaqbi_queue: currentQueue });
        addLog(`${healedCount} item yang sempat terhenti karena deteksi "Hapus" telah otomatis dipulihkan ke status antri.`, 'info');
      }

      queueControlsCard.style.display = 'block';
      previewCard.style.display = 'block';
      isRunning = !!saved.malaqbi_is_running;
      if (isRunning) {
        btnStartQueue.style.display = 'none';
        btnPauseQueue.style.display = 'inline-flex';
        btnStopQueue.style.display = 'inline-flex';
      }
      updateStats();
      renderQueueTable();
    }
  } catch (e) {
    console.warn('Gagal memuat status antrian tersimpan:', e);
  }

  // Polling deteksi tab aktif setiap 3 detik
  setInterval(checkActiveTab, 3000);
});
