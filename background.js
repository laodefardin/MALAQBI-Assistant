/**
 * MALAQBI CPMK Assistant - Background Service Worker
 * Mengatur side panel, manajemen state antrian navigasi lintas halaman, dan listener event
 */

// Buka side panel saat ikon ekstensi diklik
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(err => {
    console.error('Error setting panel behavior:', err);
  });
  console.log('MALAQBI CPMK Assistant terpasang.');
});

// Listener pesan dari side panel atau content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action, payload } = message || {};

  if (action === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] || null });
    });
    return true; // Asynchronous response
  }

  if (action === 'NAVIGATE_TAB') {
    const { tabId, url } = payload || {};
    if (tabId && url) {
      chrome.tabs.update(tabId, { url }, (tab) => {
        sendResponse({ success: true, tab });
      });
      return true;
    }
  }

  if (action === 'NOTIFY_SIDE_PANEL') {
    // Teruskan broadcast ke semua runtime (side panel akan menangkapnya)
    chrome.runtime.sendMessage(message).catch(() => {
      // Abaikan jika side panel sedang tertutup
    });
    sendResponse({ received: true });
    return false;
  }
});
