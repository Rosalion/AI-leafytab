const COLOR_PALETTE = [
  { id: "blue", hex: "#3b82f6" },
  { id: "red", hex: "#ef4444" },
  { id: "yellow", hex: "#f59e0b" },
  { id: "green", hex: "#10b981" },
  { id: "pink", hex: "#ec4899" },
  { id: "purple", hex: "#8b5cf6" },
  { id: "cyan", hex: "#06b6d4" },
  { id: "orange", hex: "#f97316" },
  { id: "grey", hex: "#94a3b8" }
];

const CUSTOM_PROMPT_MAX = 1000;
const EXPORT_KEYS = [
  "labels",
  "domainRules",
  "defaultLabelId",
  "domainRulesEnabled",
  "allowNewLabels",
  "customPrompt"
];

const TABS = ["api", "domains", "labels", "logs", "language", "account"];
const PROVIDERS = ["openai", "gemini", "deepseek", "zhipu", "openrouter"];

const state = {
  sync: null,
  local: null,
  models: { openai: [], gemini: [], deepseek: [], zhipu: [], openrouter: [] },
  lastSyncUpdateAt: ""
};

let localeMessages = null;
let dragLabelId = null;

document.addEventListener("DOMContentLoaded", () => {
  init().catch(console.error);
});

async function init() {
  await loadSettings();
  await applyLocalization();
  setVersion();
  applyPromptLimit();
  render();
  bindEvents();
  bindStorageListeners();
  initTabs();
  document.addEventListener("click", closeAllColorMenus);
}

async function applyLocalization() {
  const uiLanguage = state.local?.uiLanguage || "auto";
  localeMessages = null;

  if (uiLanguage !== "auto") {
    localeMessages = await loadLocaleMessages(uiLanguage);
  }

  const htmlLang = uiLanguage === "auto" ? chrome.i18n.getUILanguage() : uiLanguage;
  document.documentElement.setAttribute("lang", htmlLang);
  document.title = t("optionsTitle") || document.title;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = t(key);
    if (message) el.textContent = message;
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const message = t(key);
    if (message) el.setAttribute("placeholder", message);
  });

  applyPromptLimit();
}

async function loadLocaleMessages(locale) {
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn("Failed to load locale", locale, err);
    return null;
  }
}

function t(key, substitutions) {
  if (localeMessages && localeMessages[key] && localeMessages[key].message) {
    return substitute(localeMessages[key].message, substitutions);
  }
  return chrome.i18n.getMessage(key, substitutions);
}

function substitute(message, substitutions) {
  if (!substitutions) return message;
  const items = Array.isArray(substitutions) ? substitutions : [substitutions];
  let result = message;
  items.forEach((value, idx) => {
    const token = `$${idx + 1}`;
    result = result.replaceAll(token, String(value));
  });
  return result;
}

function applyPromptLimit() {
  const prompt = document.getElementById("custom-prompt");
  if (prompt) {
    prompt.maxLength = CUSTOM_PROMPT_MAX;
  }
  const limitHint = document.getElementById("prompt-limit");
  if (limitHint) {
    limitHint.textContent =
      t("noteCustomPromptLimit", [String(CUSTOM_PROMPT_MAX)]) ||
      `Max ${CUSTOM_PROMPT_MAX} characters.`;
  }
}

function setVersion() {
  const el = document.getElementById("app-version");
  if (!el) return;
  el.textContent = chrome.runtime.getManifest().version || el.textContent;
}

async function loadSettings() {
  const defaults = getDefaultSyncSettings();
  const sync = await chrome.storage.sync.get(defaults);

  const patch = {};
  if (!Array.isArray(sync.labels) || sync.labels.length === 0) {
    patch.labels = defaults.labels;
  }
  if (!sync.defaultLabelId) {
    patch.defaultLabelId = defaults.defaultLabelId;
  }
  if (typeof sync.allowNewLabels !== "boolean") {
    patch.allowNewLabels = defaults.allowNewLabels;
  }
  if (typeof sync.autoGroup !== "boolean") {
    patch.autoGroup = defaults.autoGroup;
  }
  if (!sync.domainRules || typeof sync.domainRules !== "object") {
    patch.domainRules = defaults.domainRules;
  }
  if (!sync.modelOpenAI) {
    patch.modelOpenAI = defaults.modelOpenAI;
  }
  if (!sync.modelGemini) {
    patch.modelGemini = defaults.modelGemini;
  }
  if (typeof sync.modelDeepSeek !== "string") {
    patch.modelDeepSeek = defaults.modelDeepSeek;
  }
  if (typeof sync.modelZhipu !== "string") {
    patch.modelZhipu = defaults.modelZhipu;
  }
  if (typeof sync.modelOpenRouter !== "string") {
    patch.modelOpenRouter = defaults.modelOpenRouter;
  }
  if (typeof sync.customPrompt !== "string") {
    patch.customPrompt = defaults.customPrompt;
  }
  if (typeof sync.domainRulesEnabled !== "boolean") {
    patch.domainRulesEnabled = defaults.domainRulesEnabled;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }

  const local = await chrome.storage.local.get({
    apiProvider: "openai",
    apiKeyOpenAI: "",
    apiKeyGemini: "",
    apiKeyDeepSeek: "",
    apiKeyZhipu: "",
    apiKeyOpenRouter: "",
    apiKey: "",
    loggingEnabled: true,
    proxyEnabled: false,
    proxyHost: "",
    proxyPort: "",
    proxyScheme: "http",
    uiLanguage: "auto",
    activeTab: "api",
    modelCacheOpenAI: [],
    modelCacheGemini: [],
    modelCacheDeepSeek: [],
    modelCacheZhipu: [],
    modelCacheOpenRouter: [],
    lastSyncUpdateAt: ""
  });

  if (local.apiKey && !local.apiKeyOpenAI && !local.apiKeyGemini) {
    const migrated =
      (local.apiProvider || "openai") === "gemini"
        ? { apiKeyGemini: local.apiKey }
        : (local.apiProvider || "openai") === "deepseek"
          ? { apiKeyDeepSeek: local.apiKey }
          : (local.apiProvider || "openai") === "zhipu"
            ? { apiKeyZhipu: local.apiKey }
            : (local.apiProvider || "openai") === "openrouter"
              ? { apiKeyOpenRouter: local.apiKey }
              : { apiKeyOpenAI: local.apiKey };
    await chrome.storage.local.set(migrated);
    local.apiKeyOpenAI = migrated.apiKeyOpenAI || local.apiKeyOpenAI;
    local.apiKeyGemini = migrated.apiKeyGemini || local.apiKeyGemini;
    local.apiKeyDeepSeek = migrated.apiKeyDeepSeek || local.apiKeyDeepSeek;
    local.apiKeyZhipu = migrated.apiKeyZhipu || local.apiKeyZhipu;
    local.apiKeyOpenRouter = migrated.apiKeyOpenRouter || local.apiKeyOpenRouter;
  }

  state.sync = { ...defaults, ...sync, ...patch };
  state.local = {
    apiProvider: local.apiProvider || "openai",
    apiKeyOpenAI: local.apiKeyOpenAI || "",
    apiKeyGemini: local.apiKeyGemini || "",
    apiKeyDeepSeek: local.apiKeyDeepSeek || "",
    apiKeyZhipu: local.apiKeyZhipu || "",
    apiKeyOpenRouter: local.apiKeyOpenRouter || "",
    loggingEnabled: typeof local.loggingEnabled === "boolean" ? local.loggingEnabled : true,
    proxyEnabled: !!local.proxyEnabled,
    proxyHost: local.proxyHost || "",
    proxyPort: local.proxyPort || "",
    proxyScheme: local.proxyScheme || "http",
    uiLanguage: local.uiLanguage || "auto",
    activeTab: local.activeTab || "api"
  };
  state.models = {
    openai: Array.isArray(local.modelCacheOpenAI) ? local.modelCacheOpenAI : [],
    gemini: Array.isArray(local.modelCacheGemini) ? local.modelCacheGemini : [],
    deepseek: Array.isArray(local.modelCacheDeepSeek) ? local.modelCacheDeepSeek : [],
    zhipu: Array.isArray(local.modelCacheZhipu) ? local.modelCacheZhipu : [],
    openrouter: Array.isArray(local.modelCacheOpenRouter) ? local.modelCacheOpenRouter : []
  };
  state.lastSyncUpdateAt = typeof local.lastSyncUpdateAt === "string" ? local.lastSyncUpdateAt : "";
}

function getDefaultSyncSettings() {
  const lang = chrome.i18n.getUILanguage();
  const isZh = lang && lang.toLowerCase().startsWith("zh");

  const labels = isZh
    ? [
        { id: "work", name: "工作", color: "blue" },
        { id: "read", name: "阅读", color: "yellow" },
        { id: "social", name: "社交", color: "pink" },
        { id: "video", name: "视频", color: "red" },
        { id: "shopping", name: "购物", color: "orange" },
        { id: "other", name: "其他", color: "grey" }
      ]
    : [
        { id: "work", name: "Work", color: "blue" },
        { id: "read", name: "Read", color: "yellow" },
        { id: "social", name: "Social", color: "pink" },
        { id: "video", name: "Video", color: "red" },
        { id: "shopping", name: "Shopping", color: "orange" },
        { id: "other", name: "Other", color: "grey" }
      ];

  return {
    labels,
    defaultLabelId: "other",
    allowNewLabels: true,
    autoGroup: true,
    domainRulesEnabled: true,
    domainRules: {},
    modelOpenAI: "gpt-4o-mini",
    modelGemini: "gemini-1.5-flash",
    modelDeepSeek: "",
    modelZhipu: "",
    modelOpenRouter: "",
    customPrompt: ""
  };
}

function initTabs() {
  const buttons = document.querySelectorAll(".nav-item");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveTab(button.dataset.tab);
    });
  });

  const stored = TABS.includes(state.local.activeTab) ? state.local.activeTab : "api";
  setActiveTab(stored);
}

async function setActiveTab(tab) {
  if (!TABS.includes(tab)) return;
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
  state.local.activeTab = tab;
  await chrome.storage.local.set({ activeTab: tab });
}

function render() {
  const providerSelect = document.getElementById("provider");
  const apiKeyInput = document.getElementById("api-key");
  const autoGroup = document.getElementById("auto-group");
  const allowNew = document.getElementById("allow-new");

  state.local.apiProvider = PROVIDERS.includes(state.local.apiProvider)
    ? state.local.apiProvider
    : "openai";
  providerSelect.value = state.local.apiProvider;
  autoGroup.checked = !!state.sync.autoGroup;
  allowNew.checked = !!state.sync.allowNewLabels;
  document.getElementById("rules-enabled").checked = !!state.sync.domainRulesEnabled;
  document.getElementById("logging-enabled").checked = !!state.local.loggingEnabled;
  document.getElementById("custom-prompt").value = state.sync.customPrompt || "";
  document.getElementById("proxy-enabled").checked = !!state.local.proxyEnabled;
  document.getElementById("proxy-host").value = state.local.proxyHost || "";
  document.getElementById("proxy-port").value = state.local.proxyPort || "";
  document.getElementById("proxy-scheme").value = state.local.proxyScheme || "http";
  document.getElementById("language-select").value = state.local.uiLanguage || "auto";
  renderSyncInfo();

  const currentKey = getCurrentApiKey();
  if (currentKey) {
    apiKeyInput.value = "";
    apiKeyInput.setAttribute("placeholder", t("placeholderApiKeySaved") || "Saved");
  } else {
    apiKeyInput.value = "";
    apiKeyInput.removeAttribute("placeholder");
  }

  renderColorOptions();
  renderLabels();
  renderRuleOptions();
  renderRules();
  renderModelSelect();
}

function renderSyncInfo() {
  const node = document.getElementById("sync-last-update");
  if (!node) return;
  node.textContent = formatSyncTime(state.lastSyncUpdateAt);
}

function formatSyncTime(value) {
  if (!value) return t("syncNever") || "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("syncNever") || "Never";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function renderColorOptions() {
  const container = document.getElementById("new-label-color");
  container.innerHTML = "";
  const selected = container.dataset.selectedColor || COLOR_PALETTE[0].id;
  container.dataset.selectedColor = selected;
  const select = buildColorSelect(selected, (colorId) => {
    container.dataset.selectedColor = colorId;
  });
  container.appendChild(select);
}

function renderLabels() {
  const container = document.getElementById("labels-list");
  container.innerHTML = "";

  for (const label of state.sync.labels) {
    const row = document.createElement("div");
    row.className = "label-row";
    row.dataset.id = label.id;
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      row.classList.add("drag-over");
    });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      row.classList.remove("drag-over");
      handleDropLabel(label.id);
    });

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "drag-handle";
    dragHandle.setAttribute("aria-label", "Drag to reorder");
    dragHandle.textContent = "⋮⋮";
    dragHandle.draggable = true;
    dragHandle.addEventListener("dragstart", (event) => {
      dragLabelId = label.id;
      event.dataTransfer.setData("text/plain", label.id);
      event.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    dragHandle.addEventListener("dragend", () => {
      dragLabelId = null;
      row.classList.remove("dragging");
    });

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = label.name;

    const colorSelect = buildColorSelect(label.color, (colorId) =>
      updateLabelColor(label.id, colorId)
    );

    const deleteButton = document.createElement("button");
    deleteButton.textContent = t("buttonDelete") || "Delete";

    nameInput.addEventListener("change", () => updateLabelName(label.id, nameInput.value));
    deleteButton.addEventListener("click", () => deleteLabel(label.id));

    row.appendChild(dragHandle);
    row.appendChild(nameInput);
    row.appendChild(colorSelect);
    row.appendChild(deleteButton);

    container.appendChild(row);
  }
}

function renderRuleOptions() {
  const select = document.getElementById("new-rule-label");
  select.innerHTML = "";
  for (const label of state.sync.labels) {
    const option = document.createElement("option");
    option.value = label.id;
    option.textContent = label.name;
    select.appendChild(option);
  }
}

function renderRules() {
  const container = document.getElementById("rules-list");
  container.innerHTML = "";

  const entries = Object.entries(state.sync.domainRules || {}).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  for (const [host, rule] of entries) {
    if (!state.sync.labels.some((l) => l.id === rule.labelId)) {
      rule.labelId = state.sync.defaultLabelId;
      chrome.storage.sync.set({ domainRules: state.sync.domainRules });
    }

    const row = document.createElement("div");
    row.className = "rule-row";
    row.dataset.host = host;

    const domainInput = document.createElement("input");
    domainInput.type = "text";
    domainInput.value = host;

    const labelSelect = document.createElement("select");
    for (const label of state.sync.labels) {
      const option = document.createElement("option");
      option.value = label.id;
      option.textContent = label.name;
      if (label.id === rule.labelId) option.selected = true;
      labelSelect.appendChild(option);
    }

    const deleteButton = document.createElement("button");
    deleteButton.textContent = t("buttonDelete") || "Delete";

    domainInput.addEventListener("change", () => updateRuleDomain(host, domainInput.value));
    labelSelect.addEventListener("change", () => updateRuleLabel(host, labelSelect.value));
    deleteButton.addEventListener("click", () => deleteRule(host));

    row.appendChild(domainInput);
    row.appendChild(labelSelect);
    row.appendChild(deleteButton);
    container.appendChild(row);
  }
}

function buildColorSelect(selectedColor, onSelect) {
  const wrapper = document.createElement("div");
  wrapper.className = "color-select";
  wrapper.dataset.value = selectedColor;

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "color-select-trigger";
  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    wrapper.classList.toggle("open");
  });

  const triggerSwatch = document.createElement("span");
  triggerSwatch.className = "color-dot";
  const triggerLabel = document.createElement("span");
  triggerLabel.className = "color-label";

  trigger.appendChild(triggerSwatch);
  trigger.appendChild(triggerLabel);

  const menu = document.createElement("div");
  menu.className = "color-select-menu";

  for (const color of COLOR_PALETTE) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "color-option";
    option.dataset.color = color.id;
    option.addEventListener("click", (event) => {
      event.stopPropagation();
      setColorSelectValue(wrapper, color.id);
      wrapper.classList.remove("open");
      onSelect(color.id);
    });

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.setProperty("--swatch", color.hex);
    const label = document.createElement("span");
    label.textContent = formatColorName(color.id);
    option.appendChild(dot);
    option.appendChild(label);
    menu.appendChild(option);
  }

  wrapper.appendChild(trigger);
  wrapper.appendChild(menu);
  setColorSelectValue(wrapper, selectedColor);
  return wrapper;
}

function setColorSelectValue(wrapper, colorId) {
  const color = COLOR_PALETTE.find((item) => item.id === colorId) || COLOR_PALETTE[0];
  wrapper.dataset.value = color.id;
  const swatch = wrapper.querySelector(".color-select-trigger .color-dot");
  const label = wrapper.querySelector(".color-select-trigger .color-label");
  if (swatch) swatch.style.setProperty("--swatch", color.hex);
  if (label) label.textContent = formatColorName(color.id);
  wrapper.querySelectorAll(".color-option").forEach((option) => {
    option.classList.toggle("active", option.dataset.color === color.id);
  });
}

function formatColorName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function closeAllColorMenus() {
  document.querySelectorAll(".color-select.open").forEach((el) => el.classList.remove("open"));
}

function renderModelSelect() {
  const provider = state.local.apiProvider;
  const models = state.models[provider] || [];
  const select = document.getElementById("model-select");
  const hint = document.getElementById("model-hint");

  select.innerHTML = "";
  if (!models.length) {
    const option = document.createElement("option");
    option.textContent = t("placeholderModelEmpty") || "Test API to load models";
    option.value = "";
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
    select.disabled = true;
    hint.textContent = t("noteModelHelp") || "Model list loads after API test.";
    return;
  }

  select.disabled = false;
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.display || model.id;
    select.appendChild(option);
  }

  const currentModel = getCurrentModelSelection(provider);
  const exists = models.some((m) => m.id === currentModel);
  select.value = exists ? currentModel : models[0].id;
  if (!exists) {
    saveModelSelection(select.value);
  }
  hint.textContent = t("noteModelCount", [String(models.length)]) || "";
}

function bindEvents() {
  document.getElementById("provider").addEventListener("change", async (event) => {
    const value = event.target.value;
    state.local.apiProvider = value;
    await chrome.storage.local.set({ apiProvider: value });
    render();
  });

  document.getElementById("test-api").addEventListener("click", testAndLoadModels);
  document.getElementById("refresh-models").addEventListener("click", refreshModels);

  document.getElementById("model-select").addEventListener("change", (event) => {
    saveModelSelection(event.target.value);
  });

  document.getElementById("custom-prompt").addEventListener("input", (event) => {
    let value = event.target.value;
    if (value.length > CUSTOM_PROMPT_MAX) {
      value = value.slice(0, CUSTOM_PROMPT_MAX);
      event.target.value = value;
    }
    state.sync.customPrompt = value;
    chrome.storage.sync.set({ customPrompt: value });
  });

  document.getElementById("auto-group").addEventListener("change", (event) => {
    const value = !!event.target.checked;
    state.sync.autoGroup = value;
    chrome.storage.sync.set({ autoGroup: value });
  });

  document.getElementById("allow-new").addEventListener("change", (event) => {
    const value = !!event.target.checked;
    state.sync.allowNewLabels = value;
    chrome.storage.sync.set({ allowNewLabels: value });
  });

  document.getElementById("rules-enabled").addEventListener("change", (event) => {
    const value = !!event.target.checked;
    state.sync.domainRulesEnabled = value;
    chrome.storage.sync.set({ domainRulesEnabled: value });
  });

  document.getElementById("add-label").addEventListener("click", addLabel);
  document.getElementById("sort-labels-asc").addEventListener("click", () =>
    sortLabelsByName("asc")
  );
  document.getElementById("sort-labels-desc").addEventListener("click", () =>
    sortLabelsByName("desc")
  );

  document.getElementById("add-rule").addEventListener("click", addRule);
  document.getElementById("clear-rules").addEventListener("click", clearRules);

  document.getElementById("export-data").addEventListener("click", exportData);
  document.getElementById("import-data").addEventListener("click", () => {
    const input = document.getElementById("import-file");
    if (input) input.click();
  });
  document.getElementById("import-file").addEventListener("change", handleImportFile);

  document.getElementById("ungroup-tabs").addEventListener("click", ungroupTabs);
  document.getElementById("ungroup-all-tabs").addEventListener("click", ungroupAllTabs);
  document.getElementById("dedupe-tabs").addEventListener("click", dedupeTabs);
  document.getElementById("dedupe-all-tabs").addEventListener("click", dedupeAllTabs);

  document.getElementById("logging-enabled").addEventListener("change", (event) => {
    const value = !!event.target.checked;
    state.local.loggingEnabled = value;
    chrome.storage.local.set({ loggingEnabled: value });
  });

  document.getElementById("download-logs").addEventListener("click", downloadLogs);
  document.getElementById("clear-logs").addEventListener("click", clearLogs);

  document.getElementById("proxy-enabled").addEventListener("change", async (event) => {
    const value = !!event.target.checked;
    state.local.proxyEnabled = value;
    await chrome.storage.local.set({ proxyEnabled: value });
    if (!value) {
      await disableProxy();
    }
  });

  document.getElementById("proxy-scheme").addEventListener("change", (event) => {
    const value = event.target.value;
    state.local.proxyScheme = value;
    chrome.storage.local.set({ proxyScheme: value });
  });

  document.getElementById("proxy-host").addEventListener("change", (event) => {
    const value = event.target.value.trim();
    state.local.proxyHost = value;
    chrome.storage.local.set({ proxyHost: value });
  });

  document.getElementById("proxy-port").addEventListener("change", (event) => {
    const value = event.target.value.trim();
    state.local.proxyPort = value;
    chrome.storage.local.set({ proxyPort: value });
  });

  document.getElementById("apply-proxy").addEventListener("click", applyProxy);
  document.getElementById("clear-proxy").addEventListener("click", disableProxy);

  document.getElementById("language-select").addEventListener("change", async (event) => {
    const value = event.target.value;
    state.local.uiLanguage = value;
    await chrome.storage.local.set({ uiLanguage: value });
    await applyLocalization();
    render();
    setLanguageStatus("success", t("statusLanguageSaved") || "Language updated.");
  });

  document.getElementById("sync-now").addEventListener("click", async () => {
    setSyncStatus("", t("statusSyncing") || "Syncing...");
    state.lastSyncUpdateAt = new Date().toISOString();
    await chrome.storage.local.set({ lastSyncUpdateAt: state.lastSyncUpdateAt });
    renderSyncInfo();
    await chrome.storage.sync.set({ syncPingAt: state.lastSyncUpdateAt });
    setSyncStatus("success", t("statusSyncedNow") || "Synced.");
  });
}

function bindStorageListeners() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.lastSyncUpdateAt) {
      state.lastSyncUpdateAt = changes.lastSyncUpdateAt.newValue || "";
      renderSyncInfo();
      setSyncStatus("success", t("statusSyncUpdated") || "Sync settings updated from another device.");
      return;
    }

    if (areaName !== "sync") return;
    const watchKeys = ["labels", "domainRules", "defaultLabelId", "domainRulesEnabled"];
    let changed = false;
    for (const key of watchKeys) {
      if (!(key in changes)) continue;
      state.sync[key] = changes[key].newValue;
      changed = true;
    }
    if (changed) {
      render();
      setSyncStatus("success", t("statusSyncUpdated") || "Sync settings updated from another device.");
    }
  });
}

function getCurrentApiKey() {
  switch (state.local.apiProvider) {
    case "gemini":
      return state.local.apiKeyGemini;
    case "deepseek":
      return state.local.apiKeyDeepSeek;
    case "zhipu":
      return state.local.apiKeyZhipu;
    case "openrouter":
      return state.local.apiKeyOpenRouter;
    default:
      return state.local.apiKeyOpenAI;
  }
}

function getCurrentModelSelection(provider) {
  switch (provider) {
    case "gemini":
      return state.sync.modelGemini;
    case "deepseek":
      return state.sync.modelDeepSeek;
    case "zhipu":
      return state.sync.modelZhipu;
    case "openrouter":
      return state.sync.modelOpenRouter;
    default:
      return state.sync.modelOpenAI;
  }
}

function saveModelSelection(modelId) {
  const provider = state.local.apiProvider;
  if (provider === "gemini") {
    state.sync.modelGemini = modelId;
    chrome.storage.sync.set({ modelGemini: modelId });
    return;
  }
  if (provider === "deepseek") {
    state.sync.modelDeepSeek = modelId;
    chrome.storage.sync.set({ modelDeepSeek: modelId });
    return;
  }
  if (provider === "zhipu") {
    state.sync.modelZhipu = modelId;
    chrome.storage.sync.set({ modelZhipu: modelId });
    return;
  }
  if (provider === "openrouter") {
    state.sync.modelOpenRouter = modelId;
    chrome.storage.sync.set({ modelOpenRouter: modelId });
    return;
  }
  state.sync.modelOpenAI = modelId;
  chrome.storage.sync.set({ modelOpenAI: modelId });
}

async function exportData() {
  try {
    const data = await chrome.storage.sync.get(EXPORT_KEYS);
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      data
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-leaftab-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setImportExportStatus("success", t("statusExported") || "Exported.");
  } catch (err) {
    console.error(err);
    setImportExportStatus(
      "error",
      (t("statusExportFail") || "Export failed.") + " " + (err?.message || "")
    );
  }
}

function handleImportFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const overwritePrompt = !!document.getElementById("import-overwrite-prompt")?.checked;
  const rulesMode =
    document.querySelector('input[name="import-rules-mode"]:checked')?.value || "merge";
  const labelsMode =
    document.querySelector('input[name="import-labels-mode"]:checked')?.value || "merge";
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const raw = String(reader.result || "");
      const parsed = JSON.parse(raw);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || !Array.isArray(data.labels)) {
        setImportExportStatus("error", t("statusImportInvalid") || "Invalid file.");
        return;
      }
      const incoming = {
        labels: data.labels,
        domainRules: data.domainRules && typeof data.domainRules === "object" ? data.domainRules : {},
        defaultLabelId: data.defaultLabelId || (data.labels[0] && data.labels[0].id) || "other",
        domainRulesEnabled: typeof data.domainRulesEnabled === "boolean" ? data.domainRulesEnabled : true,
        allowNewLabels: typeof data.allowNewLabels === "boolean" ? data.allowNewLabels : true,
        customPrompt: typeof data.customPrompt === "string" ? data.customPrompt : ""
      };

      const existing = await chrome.storage.sync.get(getDefaultSyncSettings());
      const labels =
        labelsMode === "overwrite"
          ? incoming.labels
          : mergeLabels(existing.labels || [], incoming.labels || []);
      const domainRules =
        rulesMode === "overwrite"
          ? incoming.domainRules
          : mergeRules(existing.domainRules || {}, incoming.domainRules || {});
      const customPrompt = overwritePrompt ? incoming.customPrompt : existing.customPrompt || "";

      const payload = {
        labels,
        domainRules,
        defaultLabelId:
          labelsMode === "overwrite"
            ? incoming.defaultLabelId
            : existing.defaultLabelId || incoming.defaultLabelId,
        domainRulesEnabled:
          typeof existing.domainRulesEnabled === "boolean"
            ? existing.domainRulesEnabled
            : incoming.domainRulesEnabled,
        allowNewLabels:
          typeof existing.allowNewLabels === "boolean" ? existing.allowNewLabels : incoming.allowNewLabels,
        customPrompt: customPrompt.slice(0, CUSTOM_PROMPT_MAX)
      };

      if (!payload.labels.find((label) => label.id === payload.defaultLabelId)) {
        payload.defaultLabelId = payload.labels[0]?.id || "other";
      }
      await chrome.storage.sync.set(payload);
      await loadSettings();
      render();
      setImportExportStatus("success", t("statusImported") || "Imported.");
    } catch (err) {
      console.error(err);
      setImportExportStatus(
        "error",
        (t("statusImportFail") || "Import failed.") + " " + (err?.message || "")
      );
    } finally {
      input.value = "";
    }
  };
  reader.onerror = () => {
    setImportExportStatus("error", t("statusImportFail") || "Import failed.");
    input.value = "";
  };
  reader.readAsText(file);
}

function setImportExportStatus(type, message) {
  const status = document.getElementById("import-export-status");
  if (!status) return;
  status.className = `status ${type}`;
  status.textContent = message;
}

function mergeLabels(existing, incoming) {
  const map = new Map();
  const result = [];
  for (const label of existing || []) {
    if (!label || !label.id) continue;
    map.set(label.id, label);
    result.push(label);
  }
  for (const label of incoming || []) {
    if (!label || !label.id) continue;
    if (map.has(label.id)) continue;
    map.set(label.id, label);
    result.push(label);
  }
  return result;
}

function mergeRules(existing, incoming) {
  const result = { ...(existing || {}) };
  for (const [host, labelId] of Object.entries(incoming || {})) {
    if (!result[host]) {
      result[host] = labelId;
    }
  }
  return result;
}

async function testAndLoadModels() {
  const provider = state.local.apiProvider;
  const apiKeyInput = document.getElementById("api-key");
  const testButton = document.getElementById("test-api");
  const refreshButton = document.getElementById("refresh-models");

  const key = apiKeyInput.value.trim() || getCurrentApiKey();
  if (!key) {
    setStatus("error", t("statusKeyMissing") || "Please enter API key.");
    return;
  }

  testButton.disabled = true;
  refreshButton.disabled = true;
  setStatus("", t("statusTesting") || "Testing API...");

  try {
    const models = await fetchModels(provider, key);
    if (!models.length) {
      setStatus("error", t("statusModelsEmpty") || "No models available.");
      return;
    }

    await saveApiKey(provider, key);
    state.models[provider] = models;
    await persistModelCache(provider, models);

    setStatus("success", t("statusTestOk") || "API connected. Models loaded.");
    apiKeyInput.value = "";
    apiKeyInput.setAttribute("placeholder", t("placeholderApiKeySaved") || "Saved");
    renderModelSelect();
  } catch (err) {
    console.error(err);
    setStatus("error", (t("statusTestFail") || "API test failed.") + " " + (err?.message || ""));
  } finally {
    testButton.disabled = false;
    refreshButton.disabled = false;
  }
}

async function refreshModels() {
  const provider = state.local.apiProvider;
  const key = getCurrentApiKey();
  if (!key) {
    setStatus("error", t("statusKeyMissing") || "Please enter API key.");
    return;
  }

  const refreshButton = document.getElementById("refresh-models");
  refreshButton.disabled = true;
  setStatus("", t("statusRefreshing") || "Refreshing models...");

  try {
    const models = await fetchModels(provider, key);
    state.models[provider] = models;
    await persistModelCache(provider, models);
    setStatus("success", t("statusModelsLoaded") || "Models updated.");
    renderModelSelect();
  } catch (err) {
    console.error(err);
    setStatus("error", (t("statusTestFail") || "API test failed.") + " " + (err?.message || ""));
  } finally {
    refreshButton.disabled = false;
  }
}

function setStatus(type, message) {
  const status = document.getElementById("api-status");
  status.classList.remove("success", "error");
  if (type) status.classList.add(type);
  status.textContent = message;
}

async function saveApiKey(provider, key) {
  if (provider === "gemini") {
    state.local.apiKeyGemini = key;
    await chrome.storage.local.set({ apiKeyGemini: key });
    return;
  }
  if (provider === "deepseek") {
    state.local.apiKeyDeepSeek = key;
    await chrome.storage.local.set({ apiKeyDeepSeek: key });
    return;
  }
  if (provider === "zhipu") {
    state.local.apiKeyZhipu = key;
    await chrome.storage.local.set({ apiKeyZhipu: key });
    return;
  }
  if (provider === "openrouter") {
    state.local.apiKeyOpenRouter = key;
    await chrome.storage.local.set({ apiKeyOpenRouter: key });
    return;
  }
  state.local.apiKeyOpenAI = key;
  await chrome.storage.local.set({ apiKeyOpenAI: key });
}

async function persistModelCache(provider, models) {
  if (provider === "gemini") {
    await chrome.storage.local.set({ modelCacheGemini: models });
    return;
  }
  if (provider === "deepseek") {
    await chrome.storage.local.set({ modelCacheDeepSeek: models });
    return;
  }
  if (provider === "zhipu") {
    await chrome.storage.local.set({ modelCacheZhipu: models });
    return;
  }
  if (provider === "openrouter") {
    await chrome.storage.local.set({ modelCacheOpenRouter: models });
    return;
  }
  await chrome.storage.local.set({ modelCacheOpenAI: models });
}

async function fetchModels(provider, apiKey) {
  if (provider === "gemini") {
    return fetchGeminiModels(apiKey);
  }
  if (provider === "deepseek") {
    return fetchOpenAICompatibleModels(apiKey, "https://api.deepseek.com/v1");
  }
  if (provider === "zhipu") {
    return fetchZhipuModels(apiKey);
  }
  if (provider === "openrouter") {
    return fetchOpenAICompatibleModels(apiKey, "https://openrouter.ai/api/v1", {
      "X-Title": "AI LeafyTab",
      "HTTP-Referer": "https://ai-leaftab.local"
    });
  }
  return fetchOpenAIModels(apiKey);
}

async function fetchOpenAIModels(apiKey) {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  const data = await res.json();
  const models = Array.isArray(data.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
  models.sort();
  return models.map((id) => ({ id, display: id }));
}

async function fetchOpenAICompatibleModels(apiKey, baseUrl, extraHeaders = {}) {
  const res = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  const data = await res.json();
  const models = Array.isArray(data.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
  models.sort();
  return models.map((id) => ({ id, display: id }));
}

async function fetchGeminiModels(apiKey) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
    headers: {
      "x-goog-api-key": apiKey
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }

  const data = await res.json();
  const models = Array.isArray(data.models) ? data.models : [];
  const filtered = models
    .filter((model) =>
      Array.isArray(model.supportedGenerationMethods)
        ? model.supportedGenerationMethods.includes("generateContent")
        : true
    )
    .map((model) => {
      const id = model.baseModelId || (model.name ? model.name.replace(/^models\//, "") : "");
      return {
        id,
        display: model.displayName || id
      };
    })
    .filter((model) => model.id);

  filtered.sort((a, b) => a.display.localeCompare(b.display));
  return filtered;
}

async function fetchZhipuModels(apiKey) {
  const res = await fetch("https://open.bigmodel.cn/api/paas/v4/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (res.ok) {
    const data = await res.json();
    const models = Array.isArray(data.data) ? data.data.map((m) => m.id).filter(Boolean) : [];
    models.sort();
    return models.map((id) => ({ id, display: id }));
  }

  if (res.status === 404 || res.status === 405) {
    const fallback = [
      "glm-4.7",
      "glm-4.6",
      "glm-4.5-air",
      "glm-4.5-airx",
      "glm-4.5-flash",
      "glm-4-flash-250414",
      "glm-4-flash"
    ];
    return fallback.map((id) => ({ id, display: id }));
  }

  const text = await res.text();
  throw new Error(text || res.statusText);
}

function addRule() {
  const domainInput = document.getElementById("new-rule-domain");
  const labelSelect = document.getElementById("new-rule-label");
  const domain = normalizeDomain(domainInput.value);
  if (!domain) {
    setRulesStatus("error", t("statusRuleInvalid") || "Invalid domain.");
    return;
  }

  const labelId = labelSelect.value;
  if (!labelId) return;

  state.sync.domainRules[domain] = { labelId };
  chrome.storage.sync.set({ domainRules: state.sync.domainRules });
  domainInput.value = "";
  renderRules();
  setRulesStatus("success", t("statusRuleSaved") || "Rule saved.");
}

function updateRuleDomain(oldDomain, newDomainInput) {
  const normalized = normalizeDomain(newDomainInput);
  if (!normalized) {
    renderRules();
    return;
  }
  if (normalized === oldDomain) return;

  const rule = state.sync.domainRules[oldDomain];
  if (!rule) return;
  delete state.sync.domainRules[oldDomain];
  state.sync.domainRules[normalized] = rule;
  chrome.storage.sync.set({ domainRules: state.sync.domainRules });
  renderRules();
}

function updateRuleLabel(domain, labelId) {
  const rule = state.sync.domainRules[domain];
  if (!rule) return;
  rule.labelId = labelId;
  chrome.storage.sync.set({ domainRules: state.sync.domainRules });
}

function deleteRule(domain) {
  if (!state.sync.domainRules[domain]) return;
  delete state.sync.domainRules[domain];
  chrome.storage.sync.set({ domainRules: state.sync.domainRules });
  renderRules();
}

function clearRules() {
  if (!confirm(t("confirmClearRules") || "Clear all rules?")) return;
  state.sync.domainRules = {};
  chrome.storage.sync.set({ domainRules: {} });
  renderRules();
  setRulesStatus("success", t("statusRulesCleared") || "Rules cleared.");
}

async function ungroupTabs() {
  setUngroupStatus("", t("statusUngrouping") || "Removing groups...");
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const grouped = tabs.filter((tab) => typeof tab.groupId === "number" && tab.groupId !== -1);
    if (!grouped.length) {
      setUngroupStatus("success", t("statusUngroupNone") || "No groups found.");
      return;
    }
    await chrome.tabs.ungroup(grouped.map((tab) => tab.id));
    setUngroupStatus(
      "success",
      t("statusUngroupDone", [String(grouped.length)]) || "Groups removed."
    );
  } catch (err) {
    console.error(err);
    setUngroupStatus("error", (t("statusUngroupFail") || "Failed to remove groups.") + " " + (err?.message || ""));
  }
}

async function ungroupAllTabs() {
  setUngroupStatus("", t("statusUngroupingAll") || "Removing groups in all windows...");
  try {
    const tabs = await chrome.tabs.query({});
    const grouped = tabs.filter((tab) => typeof tab.groupId === "number" && tab.groupId !== -1);
    if (!grouped.length) {
      setUngroupStatus("success", t("statusUngroupNone") || "No groups found.");
      return;
    }
    await chrome.tabs.ungroup(grouped.map((tab) => tab.id));
    setUngroupStatus(
      "success",
      t("statusUngroupDone", [String(grouped.length)]) || "Groups removed."
    );
  } catch (err) {
    console.error(err);
    setUngroupStatus(
      "error",
      (t("statusUngroupFail") || "Failed to remove groups.") + " " + (err?.message || "")
    );
  }
}

async function dedupeTabs() {
  await runDedupe({ allWindows: false });
}

async function dedupeAllTabs() {
  if (!confirm(t("confirmDedupeAll") || "Remove duplicate tabs in all windows?")) return;
  await runDedupe({ allWindows: true });
}

async function runDedupe({ allWindows }) {
  setDedupeStatus(
    "",
    allWindows
      ? t("statusDedupeRunningAll") || "Removing duplicates in all windows..."
      : t("statusDedupeRunning") || "Removing duplicate tabs..."
  );
  try {
    const tabs = await chrome.tabs.query(allWindows ? {} : { currentWindow: true });
    const toClose = collectDuplicateTabs(tabs);
    if (!toClose.length) {
      setDedupeStatus("success", t("statusDedupeNone") || "No duplicates found.");
      return;
    }
    await chrome.tabs.remove(toClose);
    setDedupeStatus(
      "success",
      t("statusDedupeDone", [String(toClose.length)]) || "Duplicate tabs removed."
    );
  } catch (err) {
    console.error(err);
    setDedupeStatus(
      "error",
      (t("statusDedupeFail") || "Failed to remove duplicate tabs.") + " " + (err?.message || "")
    );
  }
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

async function downloadLogs() {
  const data = await chrome.storage.local.get({ classificationLogs: [] });
  const logs = Array.isArray(data.classificationLogs) ? data.classificationLogs : [];
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
  anchor.download = `ai-tab-grouper-logs-${stamp}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setDebugStatus("success", t("statusLogsDownloaded") || "Logs downloaded.");
}

async function clearLogs() {
  if (!confirm(t("confirmClearLogs") || "Clear logs?")) return;
  await chrome.storage.local.set({ classificationLogs: [] });
  setDebugStatus("success", t("statusLogsCleared") || "Logs cleared.");
}

async function applyProxy() {
  const enabled = !!document.getElementById("proxy-enabled").checked;
  if (!enabled) {
    setProxyStatus("error", t("statusProxyDisabled") || "Enable the proxy toggle first.");
    return;
  }

  const host = document.getElementById("proxy-host").value.trim();
  const port = document.getElementById("proxy-port").value.trim();
  const scheme = document.getElementById("proxy-scheme").value;

  if (!host || !port) {
    setProxyStatus("error", t("statusProxyInvalid") || "Proxy host/port required.");
    return;
  }

  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    setProxyStatus("error", t("statusProxyInvalid") || "Proxy host/port required.");
    return;
  }

  setProxyStatus("", t("statusProxyApplying") || "Applying proxy...");
  const result = await chrome.runtime.sendMessage({
    type: "APPLY_PROXY",
    host,
    port,
    scheme
  });

  if (result?.ok) {
    state.local.proxyEnabled = true;
    state.local.proxyHost = host;
    state.local.proxyPort = port;
    state.local.proxyScheme = scheme;
    await chrome.storage.local.set({
      proxyEnabled: true,
      proxyHost: host,
      proxyPort: port,
      proxyScheme: scheme
    });
    setProxyStatus("success", t("statusProxyApplied") || "Proxy applied.");
  } else {
    setProxyStatus(
      "error",
      (t("statusProxyFail") || "Proxy failed.") + " " + (result?.error || "")
    );
  }
}

async function disableProxy() {
  const result = await chrome.runtime.sendMessage({ type: "CLEAR_PROXY" });
  if (result?.ok) {
    state.local.proxyEnabled = false;
    await chrome.storage.local.set({ proxyEnabled: false });
    document.getElementById("proxy-enabled").checked = false;
    setProxyStatus("success", t("statusProxyCleared") || "Proxy disabled.");
  } else {
    setProxyStatus(
      "error",
      (t("statusProxyFail") || "Proxy failed.") + " " + (result?.error || "")
    );
  }
}

function normalizeDomain(input) {
  let value = input.trim().toLowerCase();
  if (!value) return "";
  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch (_) {
      // fall through
    }
  }
  value = value.replace(/^https?:\/\//, "");
  value = value.split("/")[0];
  value = value.split(":")[0];
  value = value.replace(/^www\./, "");
  return value;
}

function setRulesStatus(type, message) {
  const el = document.getElementById("rules-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setProxyStatus(type, message) {
  const el = document.getElementById("proxy-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setDebugStatus(type, message) {
  const el = document.getElementById("debug-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setUngroupStatus(type, message) {
  const el = document.getElementById("ungroup-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setDedupeStatus(type, message) {
  const el = document.getElementById("dedupe-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setLanguageStatus(type, message) {
  const el = document.getElementById("language-status");
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
  el.textContent = message || "";
}

function setSyncStatus(type, message) {
  const status = document.getElementById("sync-status");
  if (!status) return;
  status.className = "status";
  if (type) status.classList.add(type);
  status.textContent = message || "";
}

function updateLabelName(id, newName) {
  const trimmed = newName.trim();
  if (!trimmed) {
    renderLabels();
    return;
  }
  const label = state.sync.labels.find((l) => l.id === id);
  if (!label) return;
  label.name = trimmed;
  chrome.storage.sync.set({ labels: state.sync.labels });
  renderRuleOptions();
  renderRules();
}

function updateLabelColor(id, newColor) {
  const label = state.sync.labels.find((l) => l.id === id);
  if (!label) return;
  label.color = newColor;
  chrome.storage.sync.set({ labels: state.sync.labels });
}

function sortLabelsByName(direction) {
  const dir = direction === "desc" ? -1 : 1;
  state.sync.labels.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) * dir
  );
  chrome.storage.sync.set({ labels: state.sync.labels });
  renderLabels();
  renderRuleOptions();
  renderRules();
}

function handleDropLabel(targetId) {
  if (!dragLabelId || dragLabelId === targetId) return;
  const labels = state.sync.labels;
  const fromIndex = labels.findIndex((l) => l.id === dragLabelId);
  const toIndex = labels.findIndex((l) => l.id === targetId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = labels.splice(fromIndex, 1);
  labels.splice(toIndex, 0, moved);
  chrome.storage.sync.set({ labels });
  renderLabels();
  renderRuleOptions();
  renderRules();
}

async function deleteLabel(id) {
  if (state.sync.labels.length <= 1) return;
  const labels = state.sync.labels.filter((l) => l.id !== id);
  let defaultLabelId = state.sync.defaultLabelId;
  if (defaultLabelId === id) {
    defaultLabelId = labels[0].id;
  }

  const domainRules = { ...state.sync.domainRules };
  for (const host of Object.keys(domainRules)) {
    if (domainRules[host]?.labelId === id) {
      domainRules[host] = { labelId: defaultLabelId };
    }
  }

  state.sync.labels = labels;
  state.sync.defaultLabelId = defaultLabelId;
  state.sync.domainRules = domainRules;
  await chrome.storage.sync.set({ labels, defaultLabelId, domainRules });
  renderLabels();
  renderRuleOptions();
  renderRules();
}

function addLabel() {
  const nameInput = document.getElementById("new-label-name");
  const name = nameInput.value.trim() || t("placeholderNewLabel") || "New Label";
  const colorContainer = document.getElementById("new-label-color");
  const color = colorContainer.dataset.selectedColor || COLOR_PALETTE[0].id;

  const label = {
    id: uniqueId(slugify(name), state.sync.labels),
    name,
    color
  };

  state.sync.labels.push(label);
  chrome.storage.sync.set({ labels: state.sync.labels });

  nameInput.value = "";
  renderLabels();
  renderRuleOptions();
  renderRules();
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "label"
  );
}

function uniqueId(base, labels) {
  let id = base;
  let counter = 1;
  while (labels.some((l) => l.id === id)) {
    id = `${base}-${counter++}`;
  }
  return id;
}
