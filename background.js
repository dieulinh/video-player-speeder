// Service worker: toggles the in-page control panel on every icon click.
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' }).catch(() => {
    // Tab may be a restricted page (chrome://, extension pages, etc.) — ignore.
  });
});
