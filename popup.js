document.addEventListener("DOMContentLoaded", () => {
  localize();
  setVersion();
  init().catch(console.error);
});

function localize() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = chrome.i18n.getMessage(key);
    if (message) el.textContent = message;
  });
}

function setVersion() {
  const el = document.getElementById("app-version");
  if (!el) return;
  el.textContent = chrome.runtime.getManifest().version || el.textContent;
}

async function init() {
  const sync = await chrome.storage.sync.get({ autoGroup: true });
  const local = await chrome.storage.local.get({
    apiProvider: "openai",
    apiKeyOpenAI: "",
    apiKeyGemini: "",
    apiKeyDeepSeek: "",
    apiKeyZhipu: "",
    apiKeyOpenRouter: "",
    apiKey: ""
  });
  const status = document.getElementById("status");
  const autoSwitch = document.getElementById("auto-switch");

  const apiProvider = local.apiProvider || "openai";
  let apiKey = "";
  if (apiProvider === "gemini") {
    apiKey = local.apiKeyGemini || local.apiKey || "";
  } else if (apiProvider === "deepseek") {
    apiKey = local.apiKeyDeepSeek || local.apiKey || "";
  } else if (apiProvider === "zhipu") {
    apiKey = local.apiKeyZhipu || local.apiKey || "";
  } else if (apiProvider === "openrouter") {
    apiKey = local.apiKeyOpenRouter || local.apiKey || "";
  } else {
    apiKey = local.apiKeyOpenAI || local.apiKey || "";
  }

  if (!apiKey) {
    status.textContent = chrome.i18n.getMessage("popupNoKey") || "API key not set.";
  } else {
    status.textContent = sync.autoGroup
      ? chrome.i18n.getMessage("popupStatusOn") || "Auto grouping is on."
      : chrome.i18n.getMessage("popupStatusOff") || "Auto grouping is off.";
  }

  autoSwitch.checked = !!sync.autoGroup;

  document.getElementById("group-now").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.runtime.sendMessage({ type: "REGROUP_WINDOW", windowId: tab.windowId });
    }
    window.close();
  });

  autoSwitch.addEventListener("change", async () => {
    const newValue = !!autoSwitch.checked;
    await chrome.storage.sync.set({ autoGroup: newValue });
    status.textContent = newValue
      ? chrome.i18n.getMessage("popupStatusOn") || "Auto grouping is on."
      : chrome.i18n.getMessage("popupStatusOff") || "Auto grouping is off.";
    sync.autoGroup = newValue;
  });

  document.getElementById("dedupe-now").addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const toClose = collectDuplicateTabs(tabs);
      if (!toClose.length) {
        status.textContent =
          chrome.i18n.getMessage("popupDedupeNone") || "No duplicates found.";
        return;
      }
      await chrome.tabs.remove(toClose);
      status.textContent =
        chrome.i18n.getMessage("popupDedupeDone", [String(toClose.length)]) ||
        "Duplicate tabs removed.";
    } catch (err) {
      console.error(err);
      status.textContent =
        (chrome.i18n.getMessage("popupDedupeFail") || "Failed to remove duplicate tabs.") +
        " " +
        (err?.message || "");
    }
  });

  document.getElementById("open-options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
}

function collectDuplicateTabs(tabs) {
  const map = new Map();
  for (const tab of tabs) {
    if (!tab.url || !isHttpUrl(tab.url)) continue;
    const key = normalizeTabUrl(tab.url);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(tab);
  }

  const toClose = [];
  for (const group of map.values()) {
    if (group.length <= 1) continue;
    const keep = group.find((tab) => tab.active) || group.find((tab) => tab.pinned) || group[0];
    for (const tab of group) {
      if (tab.id === keep.id) continue;
      if (tab.pinned) continue;
      toClose.push(tab.id);
    }
  }
  return toClose;
}

function normalizeTabUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const path = parsed.pathname.replace(/\/$/, "");
    return `${parsed.origin}${path}${parsed.search}`;
  } catch (_) {
    return url;
  }
}

function isHttpUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}
