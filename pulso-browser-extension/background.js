const BRIDGE_URL = "http://localhost:17342/tab-update";

async function reportActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith("http")) return;

    await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: tab.url, title: tab.title || "" }),
    });
  } catch {
    // OKlrev Tracker probably isn't running right now — fail silently, try again on the next event.
  }
}

// Switched to a different tab.
chrome.tabs.onActivated.addListener(reportActiveTab);

// Navigated to a new URL within the same tab, or finished loading.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete" || changeInfo.url) reportActiveTab();
});

// Switched between browser windows (or to/from another application).
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) reportActiveTab();
});
