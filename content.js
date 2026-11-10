/**
 * MALAQBI CPMK Assistant - Content Script
 * Berjalan di konteks halaman web https://malaqbi.unsulbar.ac.id/admin/cpmk*
 */

(() => {
  // Cegah injeksi ganda
  if (window.__MALAQBI_ASSISTANT_INJECTED__) return;
  window.__MALAQBI_ASSISTANT_INJECTED__ = true;

  console.log('[MALAQBI Assistant] Content script aktif di halaman:', window.location.href);

  /**
   * Helper: Tunggu elemen DOM muncul
   */
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }, timeout);
    });
  }

  /**
   * Helper: Dispatch event input & change standar HTML/Alpine.js
   */
  function triggerEvents(element) {
    if (!element) return;
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  }

  /**
   * Helper: Tambahkan efek visual highlight pada elemen yang baru diisi
   */
  function highlightField(el) {
    if (!el) return;
    const origBorder = el.style.border;
    const origOutline = el.style.outline;
    el.style.outline = '2px solid #14a7a0';
    el.style.transition = 'outline 0.3s ease';
    setTimeout(() => {
      el.style.outline = origOutline;
      el.style.border = origBorder;
    }, 2500);
  }

  /**
   * Cek jenis halaman saat ini
   */
  function getPageInfo() {
    const path = window.location.pathname;
    if (path.includes('/admin/cpmk/create')) {
      return { type: 'CREATE', url: window.location.href };
    } else if (path.includes('/admin/cpmk')) {
      return { type: 'INDEX', url: window.location.href };
    }
    return { type: 'OTHER', url: window.location.href };
  }

  /**
   * Deteksi apakah pesan kesalahan adalah karena duplikasi kode CPMK
   */
  function isDuplicateError(text) {
    if (!text) return false;
    const str = String(text).toLowerCase();
    return (
      str.includes('already been taken') ||
      str.includes('sudah ada') ||
      str.includes('sudah terdaftar') ||
      str.includes('sudah digunakan') ||
      str.includes('telah digunakan') ||
      str.includes('duplikat') ||
      str.includes('duplicate')
    );
  }

  /**
   * Cek pesan error validasi atau SweetAlert di halaman
   */
  function checkPageErrors() {
    // 1. Cek SweetAlert (Pop-up modal alert)
    const swalModal = document.querySelector('.swal2-popup.swal2-modal');
    if (swalModal && swalModal.style.display !== 'none' && swalModal.offsetParent !== null) {
      const title = swalModal.querySelector('.swal2-title')?.textContent?.trim() || '';
      const text = swalModal.querySelector('.swal2-html-container')?.textContent?.trim() || '';
      const isError = swalModal.querySelector('.swal2-error') !== null;
      const isSuccess = swalModal.querySelector('.swal2-success') !== null || title.toLowerCase().includes('berhasil');

      // Jika modal sukses, abaikan (bukan error!)
      if (!isSuccess && (isError || title.toLowerCase().includes('gagal') || title.toLowerCase().includes('error') || text.toLowerCase().includes('already been taken'))) {
        const fullMessage = `${title}: ${text}`;
        return {
          isError: true,
          title,
          text,
          fullMessage,
          isDuplicate: isDuplicateError(fullMessage)
        };
      }
    }

    // 2. Cek text validation error Laravel HANYA di dalam FORM halaman CREATE
    // DILARANG KERAS mencocokkan tombol aksi, link, atau baris tabel (seperti tombol "Hapus" pada tabel CPMK)
    const form = document.querySelector('form[action*="/admin/cpmk"]');
    if (form) {
      const errorEls = form.querySelectorAll('.invalid-feedback, .text-danger, .alert-danger, p.text-red-500, p.text-red-600, span.text-red-500, span.text-red-600, div.text-red-500, div.text-red-600');
      for (const el of errorEls) {
        // Lewati tombol, link, input, select, atau elemen aksi
        if (el.matches('button, a, input, select, .btn, [onclick], [type="button"], [type="submit"]')) continue;
        if (el.closest('button, a, .btn, table, thead, tbody, tr, td')) continue;
        if (el.closest('footer, .copyright, header, nav')) continue;

        const txt = el.textContent?.trim();
        if (!txt || txt.length < 3) continue;
        // Abaikan teks tombol aksi biasa
        if (/^(hapus|delete|batal|cancel|kembali|back|tutup|close)$/i.test(txt)) continue;

        return {
          isError: true,
          title: 'Validasi',
          text: txt,
          fullMessage: txt,
          isDuplicate: isDuplicateError(txt)
        };
      }
    }

    // 3. Cek alert banner umum (misal session flash error di luar modal)
    // Pastikan BUKAN tombol, link, ataupun elemen di dalam tabel data
    const alertBox = document.querySelector('.alert.alert-danger:not(table *), .alert-danger:not(button):not(a):not(table *)');
    if (alertBox) {
      const txt = alertBox.textContent?.trim();
      if (txt && txt.length > 3 && !/^(hapus|delete)$/i.test(txt)) {
        return {
          isError: true,
          title: 'Alert',
          text: txt,
          fullMessage: txt,
          isDuplicate: isDuplicateError(txt)
        };
      }
    }

    return null;
  }

  /**
   * Ekstraksi manifest form dari halaman Create atau Index
   */
  function getFormManifest() {
    const page = getPageInfo();
    const manifest = {
      page: page.type,
      url: page.url,
      hasForm: false,
      kurikulum: [],
      mataKuliah: [],
      cpl: [],
      existingCPMK: []
    };

    if (page.type === 'CREATE') {
      const form = document.querySelector('form[action*="/admin/cpmk"]');
      if (form) {
        manifest.hasForm = true;

        // Kurikulum
        const selKur = form.querySelector('select[name="kurikulum_id"]');
        if (selKur) {
          manifest.kurikulum = Array.from(selKur.options).map(opt => ({
            value: opt.value,
            text: opt.textContent.trim(),
            selected: opt.selected
          })).filter(o => o.value !== '');
        }

        // Mata Kuliah
        const selMK = form.querySelector('select[name="mata_kuliah_id"]');
        if (selMK) {
          manifest.mataKuliah = Array.from(selMK.options).map(opt => {
            const raw = opt.textContent.trim();
            const bracketMatch = raw.match(/\[(.*?)\]/);
            const code = bracketMatch ? bracketMatch[1].trim() : '';
            const cleanName = raw.replace(/\[.*?\]/g, '').trim();
            return {
              value: opt.value,
              text: raw,
              code,
              cleanName,
              selected: opt.selected
            };
          }).filter(o => o.value !== '');
        }

        // CPL
        const cplInputs = form.querySelectorAll('input[type="radio"][name="cpl_id"]');
        manifest.cpl = Array.from(cplInputs).map(radio => {
          const label = radio.closest('label');
          const fullText = label ? label.textContent.trim().replace(/\s+/g, ' ') : '';
          const matchCode = fullText.match(/CPL[-\s_]?\d+/i);
          const cplCode = matchCode ? matchCode[0].toUpperCase() : '';
          return {
            value: radio.value,
            text: fullText,
            cplCode,
            checked: radio.checked
          };
        });
      }
    } else if (page.type === 'INDEX') {
      // Baca data CPMK yang sudah terdaftar di tabel agar tidak duplikat
      const rows = document.querySelectorAll('#datatable tbody tr, table.data-table tbody tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3) {
          const kode = cells[1]?.textContent?.trim();
          const mk = cells[2]?.textContent?.trim();
          const cpl = cells[3]?.textContent?.trim();
          if (kode) {
            manifest.existingCPMK.push({ kode, mk, cpl });
          }
        }
      });
    }

    return manifest;
  }

  /**
   * Isi formulir Create CPMK dengan data satu item antrian
   */
  async function fillCreateForm(item, autoSubmit = false, delayMs = 1500) {
    const page = getPageInfo();
    if (page.type !== 'CREATE') {
      throw new Error(`Tidak berada di halaman create CPMK (URL: ${page.url})`);
    }

    const form = document.querySelector('form[action*="/admin/cpmk"]');
    if (!form) {
      throw new Error('Formulir CPMK tidak ditemukan pada DOM.');
    }

    // 1. Mata Kuliah
    const selMK = form.querySelector('select[name="mata_kuliah_id"]');
    if (!selMK) {
      throw new Error('Dropdown Mata Kuliah (select[name="mata_kuliah_id"]) tidak ditemukan.');
    }

    // Ekstraksi options
    const mkOptions = Array.from(selMK.options).filter(o => o.value !== '').map(o => ({
      value: o.value,
      text: o.textContent.trim(),
      code: o.textContent.match(/\[(.*?)\]/)?.[1]?.trim() || '',
      cleanName: o.textContent.replace(/\[.*?\]/g, '').trim()
    }));

    // Cocokkan Mata Kuliah
    let chosenMKValue = null;
    const targetKodeMK = (item.kodeMK || '').trim().toLowerCase();
    const targetNamaMK = (item.namaMK || '').trim().toLowerCase();

    // Prioritas 1: Cocokkan kode MK di dalam bracket
    if (targetKodeMK) {
      for (const opt of mkOptions) {
        if (opt.code && opt.code.toLowerCase() === targetKodeMK) {
          chosenMKValue = opt.value;
          break;
        }
      }
    }

    // Prioritas 2: Cocokkan nama MK
    if (!chosenMKValue && targetNamaMK) {
      for (const opt of mkOptions) {
        if (opt.cleanName.toLowerCase() === targetNamaMK) {
          chosenMKValue = opt.value;
          break;
        }
      }
    }

    // Prioritas 3: Partial substring match
    if (!chosenMKValue && (targetNamaMK.length > 4 || targetKodeMK)) {
      for (const opt of mkOptions) {
        const textLower = opt.text.toLowerCase();
        if ((targetKodeMK && textLower.includes(targetKodeMK)) ||
            (targetNamaMK && textLower.includes(targetNamaMK))) {
          chosenMKValue = opt.value;
          break;
        }
      }
    }

    if (!chosenMKValue) {
      throw new Error(`Mata Kuliah "${item.kodeMK ? '[' + item.kodeMK + '] ' : ''}${item.namaMK}" tidak ditemukan di pilihan dropdown MALAQBI.`);
    }

    selMK.value = chosenMKValue;
    triggerEvents(selMK);
    highlightField(selMK);

    // 2. Kode CPMK
    const inputKode = form.querySelector('input[name="kode"]');
    if (!inputKode) {
      throw new Error('Input Kode CPMK (input[name="kode"]) tidak ditemukan.');
    }
    inputKode.value = item.kodeCPMK || '';
    triggerEvents(inputKode);
    highlightField(inputKode);

    // 3. Deskripsi CPMK
    const txtDeskripsi = form.querySelector('textarea[name="deskripsi"]');
    if (!txtDeskripsi) {
      throw new Error('Textarea Deskripsi CPMK (textarea[name="deskripsi"]) tidak ditemukan.');
    }
    txtDeskripsi.value = item.descCPMK || '';
    triggerEvents(txtDeskripsi);
    highlightField(txtDeskripsi);

    // 4. CPL Pendukung
    const cplRadios = Array.from(form.querySelectorAll('input[type="radio"][name="cpl_id"]'));
    let matchedRadio = null;

    if (item.cpl && cplRadios.length > 0) {
      const cplStr = String(item.cpl).trim();
      const numMatch = cplStr.match(/(\d+)/);
      const targetNum = numMatch ? parseInt(numMatch[1], 10) : null;
      const targetCodePadded = targetNum !== null ? `CPL-${String(targetNum).padStart(2, '0')}` : '';

      for (const radio of cplRadios) {
        const label = radio.closest('label');
        const text = label ? label.textContent.trim().toUpperCase() : '';

        // Cocokkan CPL-0X
        if (targetCodePadded && text.includes(targetCodePadded)) {
          matchedRadio = radio;
          break;
        }
        // Cocokkan CPL-X
        if (targetNum !== null && text.includes(`CPL-${targetNum}`)) {
          matchedRadio = radio;
          break;
        }
      }

      if (!matchedRadio && targetNum !== null) {
        // Fallback cek angka murni
        for (const radio of cplRadios) {
          const label = radio.closest('label');
          const text = label ? label.textContent.trim() : '';
          const m = text.match(/CPL[-\s_]?0*(\d+)/i);
          if (m && parseInt(m[1], 10) === targetNum) {
            matchedRadio = radio;
            break;
          }
        }
      }
    }

    if (matchedRadio) {
      matchedRadio.checked = true;
      triggerEvents(matchedRadio);
      const label = matchedRadio.closest('label');
      if (label) highlightField(label);
    } else {
      console.warn(`Peringatan: Radio CPL "${item.cpl}" tidak ditemukan kecocokan persis.`);
    }

    // 5. Submit jika autoSubmit aktif
    if (autoSubmit) {
      console.log(`[MALAQBI Assistant] Menunggu delay ${delayMs}ms sebelum submit...`);
      await new Promise(r => setTimeout(r, delayMs));

      const submitBtn = form.querySelector('button[type="submit"]');
      if (!submitBtn) {
        throw new Error('Tombol submit (button[type="submit"]) tidak ditemukan.');
      }

      console.log('[MALAQBI Assistant] Mengirim form (klik Simpan CPMK)...');
      submitBtn.click();

      // Pasang polling cepat untuk menangkap alert duplikasi kode jika modal muncul tanpa navigasi penuh
      const liveCheckTimer = setInterval(async () => {
        const liveErr = checkPageErrors();
        if (liveErr && liveErr.isError) {
          clearInterval(liveCheckTimer);
          if (liveErr.isDuplicate) {
            console.log('[MALAQBI Assistant] Live modal duplikasi terdeteksi!');
            const swalBtn = document.querySelector('.swal2-confirm');
            if (swalBtn) swalBtn.click();

            const curData = await chrome.storage.local.get(['malaqbi_queue', 'malaqbi_queue_index']);
            const curQ = curData.malaqbi_queue || [];
            let curIdx = curQ.findIndex(q => q.status === 'processing');
            if (curIdx === -1) curIdx = curData.malaqbi_queue_index || 0;

            if (curQ[curIdx]) {
              curQ[curIdx].status = 'skipped';
              curQ[curIdx].errorMessage = liveErr.text || 'The kode has already been taken (Dilewati)';
              curQ[curIdx].timestamp = new Date().toLocaleTimeString('id-ID');
            }

            const nextPending = curQ.findIndex((item, i) => i > curIdx && item.status === 'pending');
            if (nextPending !== -1) {
              await chrome.storage.local.set({
                malaqbi_queue: curQ,
                malaqbi_queue_index: nextPending,
                malaqbi_is_running: true
              });
              chrome.runtime.sendMessage({
                action: 'QUEUE_STATUS_UPDATE',
                payload: { queue: curQ, index: curIdx, status: 'item_skipped', reason: liveErr.text }
              }).catch(() => {});

              setTimeout(() => {
                window.location.href = 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create';
              }, 700);
            } else {
              await chrome.storage.local.set({ malaqbi_queue: curQ, malaqbi_is_running: false });
              chrome.runtime.sendMessage({
                action: 'QUEUE_STATUS_UPDATE',
                payload: { queue: curQ, index: curIdx, status: 'item_skipped' }
              }).catch(() => {});
              chrome.runtime.sendMessage({ action: 'QUEUE_FINISHED', payload: { queue: curQ } }).catch(() => {});
            }
          } else {
            console.log('[MALAQBI Assistant] Live error lain terdeteksi:', liveErr.fullMessage);
            const curData = await chrome.storage.local.get(['malaqbi_queue', 'malaqbi_queue_index']);
            const curQ = curData.malaqbi_queue || [];
            let curIdx = curQ.findIndex(q => q.status === 'processing');
            if (curIdx === -1) curIdx = curData.malaqbi_queue_index || 0;
            if (curQ[curIdx]) {
              curQ[curIdx].status = 'failed';
              curQ[curIdx].errorMessage = liveErr.fullMessage;
              curQ[curIdx].timestamp = new Date().toLocaleTimeString('id-ID');
            }
            await chrome.storage.local.set({ malaqbi_queue: curQ, malaqbi_is_running: false });
            chrome.runtime.sendMessage({
              action: 'QUEUE_STATUS_UPDATE',
              payload: { queue: curQ, index: curIdx, status: 'error', error: liveErr.fullMessage }
            }).catch(() => {});
          }
        }
      }, 300);

      setTimeout(() => clearInterval(liveCheckTimer), 4000);
    }

    return {
      success: true,
      mkValue: chosenMKValue,
      cplValue: matchedRadio ? matchedRadio.value : null
    };
  }

  /**
   * Listener pesan dari Side Panel
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload } = message || {};

    if (action === 'GET_MANIFEST') {
      sendResponse(getFormManifest());
      return false;
    }

    if (action === 'FILL_FORM') {
      const { item, autoSubmit, delayMs } = payload || {};
      fillCreateForm(item, autoSubmit, delayMs)
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // async
    }

    if (action === 'NAVIGATE_TO_CREATE') {
      window.location.href = 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create';
      sendResponse({ success: true });
      return false;
    }

    if (action === 'CLICK_TAMBAH_BUTTON') {
      const btn = document.querySelector('a[href*="/admin/cpmk/create"]');
      if (btn) {
        btn.click();
        sendResponse({ success: true });
      } else {
        window.location.href = 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create';
        sendResponse({ success: true, navigated: true });
      }
      return false;
    }
  });

  /**
   * OTOMASI NAVIGASI ANTRIAN OTOMATIS:
   * Saat halaman dimuat, periksa apakah antrian sedang aktif di chrome.storage.local
   */
  async function checkQueueOnPageLoad() {
    try {
      const data = await chrome.storage.local.get([
        'malaqbi_is_running',
        'malaqbi_queue',
        'malaqbi_queue_index',
        'malaqbi_auto_submit',
        'malaqbi_delay_ms'
      ]);

      if (!data.malaqbi_is_running) return;

      const queue = data.malaqbi_queue || [];
      let index = data.malaqbi_queue_index || 0;
      const autoSubmit = data.malaqbi_auto_submit !== false;
      const delayMs = data.malaqbi_delay_ms || 1500;
      const page = getPageInfo();

      // KASUS 1: Berada di halaman INDEX CPMK (/admin/cpmk)
      if (page.type === 'INDEX') {
        // Jika sebelumnya ada item yang sedang diproses, tandai sukses (sukses redirect dari form create)
        const procIdx = queue.findIndex(q => q.status === 'processing');
        if (procIdx !== -1) {
          queue[procIdx].status = 'success';
          queue[procIdx].timestamp = new Date().toLocaleTimeString('id-ID');
          delete queue[procIdx].errorMessage;
          await chrome.storage.local.set({ malaqbi_queue: queue });
          chrome.runtime.sendMessage({
            action: 'QUEUE_STATUS_UPDATE',
            payload: { queue, index: procIdx, status: 'item_success' }
          }).catch(() => {});
        }

        // Cek apakah masih ada antrian pending berikutnya
        const nextPendingIdx = queue.findIndex(q => q.status === 'pending');
        if (nextPendingIdx === -1) {
          // Seluruh antrian selesai!
          console.log('[MALAQBI Assistant] Semua antrian telah selesai diproses!');
          await chrome.storage.local.set({
            malaqbi_is_running: false,
            malaqbi_queue_index: queue.length
          });
          chrome.runtime.sendMessage({
            action: 'QUEUE_FINISHED',
            payload: { queue }
          }).catch(() => {});
          return;
        }

        // Update index ke item berikutnya
        await chrome.storage.local.set({ malaqbi_queue_index: nextPendingIdx });

        // Navigasi ke Create CPMK
        console.log(`[MALAQBI Assistant] Navigasi ke Tambah CPMK untuk item #${nextPendingIdx + 1}: [${queue[nextPendingIdx].kodeMK}] ${queue[nextPendingIdx].kodeCPMK}...`);
        setTimeout(() => {
          const btn = document.querySelector('a[href*="/admin/cpmk/create"]');
          if (btn) btn.click();
          else window.location.href = 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create';
        }, 800);
        return;
      }

      // KASUS 2: Berada di halaman CREATE CPMK (/admin/cpmk/create)
      else if (page.type === 'CREATE') {
        // Cek apakah ada error di halaman create ini setelah submit
        const errInfo = checkPageErrors();
        if (errInfo && errInfo.isError) {
          console.error('[MALAQBI Assistant] Terdeteksi pesan error di web:', errInfo.fullMessage);

          let currentTargetIdx = queue.findIndex(q => q.status === 'processing');
          if (currentTargetIdx === -1) currentTargetIdx = index;
          const currentItem = queue[currentTargetIdx];

          // Jika error adalah duplikasi kode CPMK ("The kode has already been taken" / sudah terdaftar)
          if (errInfo.isDuplicate) {
            console.log('[MALAQBI Assistant] Terdeteksi duplikasi kode CPMK. Menutup modal dan melewati item ini...');

            // Tutup pop-up SweetAlert jika ada
            const swalConfirm = document.querySelector('.swal2-confirm');
            if (swalConfirm) swalConfirm.click();
            else if (window.Swal && typeof window.Swal.close === 'function') window.Swal.close();

            if (currentItem) {
              currentItem.status = 'skipped';
              currentItem.errorMessage = errInfo.text || 'Kode CPMK sudah terdaftar di sistem (Dilewati otomatis)';
              currentItem.timestamp = new Date().toLocaleTimeString('id-ID');
            }

            // Cari pending berikutnya
            const nextPendingIdx = queue.findIndex((q, i) => i > currentTargetIdx && q.status === 'pending');
            if (nextPendingIdx !== -1) {
              await chrome.storage.local.set({
                malaqbi_queue: queue,
                malaqbi_queue_index: nextPendingIdx,
                malaqbi_is_running: true // Tetap jalan!
              });

              chrome.runtime.sendMessage({
                action: 'QUEUE_STATUS_UPDATE',
                payload: {
                  queue,
                  index: currentTargetIdx,
                  status: 'item_skipped',
                  reason: errInfo.text || 'Kode sudah ada di sistem'
                }
              }).catch(() => {});

              // Segera reload atau navigasi ke create untuk item berikutnya
              setTimeout(() => {
                window.location.href = 'https://malaqbi.unsulbar.ac.id/admin/cpmk/create';
              }, 800);
              return;
            } else {
              // Semua antrian selesai
              await chrome.storage.local.set({
                malaqbi_queue: queue,
                malaqbi_is_running: false,
                malaqbi_queue_index: queue.length
              });
              chrome.runtime.sendMessage({
                action: 'QUEUE_STATUS_UPDATE',
                payload: { queue, index: currentTargetIdx, status: 'item_skipped' }
              }).catch(() => {});
              chrome.runtime.sendMessage({ action: 'QUEUE_FINISHED', payload: { queue } }).catch(() => {});
              return;
            }
          } else {
            // Error validasi form lain
            if (currentItem) {
              currentItem.status = 'failed';
              currentItem.errorMessage = errInfo.fullMessage;
              currentItem.timestamp = new Date().toLocaleTimeString('id-ID');
            }
            // Hentikan sementara dan simpan
            await chrome.storage.local.set({
              malaqbi_queue: queue,
              malaqbi_is_running: false // Jeda agar user bisa inspect
            });
            chrome.runtime.sendMessage({
              action: 'QUEUE_STATUS_UPDATE',
              payload: { queue, index: currentTargetIdx, status: 'error', error: errInfo.fullMessage }
            }).catch(() => {});
            return;
          }
        }

        // Tentukan item pending yang akan diproses
        let targetIdx = index;
        if (!queue[targetIdx] || queue[targetIdx].status !== 'pending') {
          targetIdx = queue.findIndex(q => q.status === 'pending');
        }

        if (targetIdx === -1 || targetIdx >= queue.length) {
          console.log('[MALAQBI Assistant] Tidak ada lagi antrian pending. Selesai.');
          await chrome.storage.local.set({ malaqbi_is_running: false });
          chrome.runtime.sendMessage({ action: 'QUEUE_FINISHED', payload: { queue } }).catch(() => {});
          return;
        }

        index = targetIdx;
        const currentItem = queue[index];

        // Tandai status item saat ini sebagai processing
        currentItem.status = 'processing';
        currentItem.timestamp = new Date().toLocaleTimeString('id-ID');
        await chrome.storage.local.set({ malaqbi_queue: queue, malaqbi_queue_index: index });
        chrome.runtime.sendMessage({
          action: 'QUEUE_STATUS_UPDATE',
          payload: { queue, index, status: 'processing' }
        }).catch(() => {});

        // Tunggu sedikit agar form stabil lalu isi
        setTimeout(async () => {
          try {
            await fillCreateForm(currentItem, autoSubmit, delayMs);
            if (!autoSubmit) {
              currentItem.status = 'success';
              await chrome.storage.local.set({ malaqbi_queue: queue, malaqbi_is_running: false });
              chrome.runtime.sendMessage({
                action: 'QUEUE_STATUS_UPDATE',
                payload: { queue, index, status: 'manual_filled' }
              }).catch(() => {});
            }
          } catch (err) {
            console.error('[MALAQBI Assistant] Gagal mengisi form:', err);
            currentItem.status = 'failed';
            currentItem.errorMessage = err.message;
            currentItem.timestamp = new Date().toLocaleTimeString('id-ID');
            await chrome.storage.local.set({
              malaqbi_queue: queue,
              malaqbi_is_running: false // Jeda agar user bisa perbaiki
            });
            chrome.runtime.sendMessage({
              action: 'QUEUE_STATUS_UPDATE',
              payload: { queue, index, status: 'error', error: err.message }
            }).catch(() => {});
          }
        }, 1000);
      }
    } catch (e) {
      console.error('[MALAQBI Assistant] Error checkQueueOnPageLoad:', e);
    }
  }

  // Jalankan pengecekan antrian setelah halaman siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkQueueOnPageLoad);
  } else {
    checkQueueOnPageLoad();
  }
})();
