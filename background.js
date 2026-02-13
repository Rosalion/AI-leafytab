const COLOR_PALETTE = [
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
  "grey"
];

const TAB_PROCESS_COOLDOWN_MS = 10000;
const SYNC_REGROUP_DEBOUNCE_MS = 1500;
const SYNC_TRIGGER_KEYS = ["labels", "domainRules", "defaultLabelId", "domainRulesEnabled"];

const inFlight = new Map();
const processed = new Map();

chrome.runtime.onInstalled.addListener(() => {
  ensureSyncDefaults().catch(console.error);
  ensureProxySettings().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureSyncDefaults().catch(console.error);
  ensureProxySettings().catch(console.error);
});

let regroupTimer = null;

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  const touched = SYNC_TRIGGER_KEYS.some((key) => key in changes);
  if (!touched) return;

  chrome.storage.local
    .set({ lastSyncUpdateAt: new Date().toISOString() })
    .catch(console.error);

  if (regroupTimer) {
    clearTimeout(regroupTimer);
  }

  regroupTimer = setTimeout(() => {
    regroupAllWindows().catch(console.error);
    regroupTimer = null;
  }, SYNC_REGROUP_DEBOUNCE_MS);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    maybeGroupTab(tabId, tab, { force: false }).catch(console.error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  inFlight.delete(tabId);
  processed.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "REGROUP_WINDOW") {
    regroupWindow(message.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message?.type === "APPLY_PROXY") {
    applyProxyFromMessage(message)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message?.type === "CLEAR_PROXY") {
    clearProxy()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

async function ensureSyncDefaults() {
  const defaults = getDefaultSyncSettings();
  const current = await chrome.storage.sync.get(defaults);
  const patch = {};

  if (!Array.isArray(current.labels) || current.labels.length === 0) {
    patch.labels = defaults.labels;
  }
  if (!current.defaultLabelId) {
    patch.defaultLabelId = defaults.defaultLabelId;
  }
  if (typeof current.allowNewLabels !== "boolean") {
    patch.allowNewLabels = defaults.allowNewLabels;
  }
  if (typeof current.autoGroup !== "boolean") {
    patch.autoGroup = defaults.autoGroup;
  }
  if (typeof current.domainRulesEnabled !== "boolean") {
    patch.domainRulesEnabled = defaults.domainRulesEnabled;
  }
  if (!current.domainRules || typeof current.domainRules !== "object") {
    patch.domainRules = defaults.domainRules;
  }
  if (!current.modelOpenAI) {
    patch.modelOpenAI = defaults.modelOpenAI;
  }
  if (!current.modelGemini) {
    patch.modelGemini = defaults.modelGemini;
  }
  if (typeof current.modelDeepSeek !== "string") {
    patch.modelDeepSeek = defaults.modelDeepSeek;
  }
  if (typeof current.modelZhipu !== "string") {
    patch.modelZhipu = defaults.modelZhipu;
  }
  if (typeof current.modelOpenRouter !== "string") {
    patch.modelOpenRouter = defaults.modelOpenRouter;
  }
  if (typeof current.customPrompt !== "string") {
    patch.customPrompt = defaults.customPrompt;
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.sync.set(patch);
  }
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

async function getSyncSettings() {
  const defaults = getDefaultSyncSettings();
  const data = await chrome.storage.sync.get(defaults);
  return {
    labels: Array.isArray(data.labels) ? data.labels : defaults.labels,
    defaultLabelId: data.defaultLabelId || defaults.defaultLabelId,
    allowNewLabels:
      typeof data.allowNewLabels === "boolean"
        ? data.allowNewLabels
        : defaults.allowNewLabels,
    autoGroup:
      typeof data.autoGroup === "boolean" ? data.autoGroup : defaults.autoGroup,
    domainRulesEnabled:
      typeof data.domainRulesEnabled === "boolean"
        ? data.domainRulesEnabled
        : defaults.domainRulesEnabled,
    domainRules: data.domainRules && typeof data.domainRules === "object" ? data.domainRules : {},
    modelOpenAI: data.modelOpenAI || defaults.modelOpenAI,
    modelGemini: data.modelGemini || defaults.modelGemini,
    modelDeepSeek: typeof data.modelDeepSeek === "string" ? data.modelDeepSeek : defaults.modelDeepSeek,
    modelZhipu: typeof data.modelZhipu === "string" ? data.modelZhipu : defaults.modelZhipu,
    modelOpenRouter:
      typeof data.modelOpenRouter === "string"
        ? data.modelOpenRouter
        : defaults.modelOpenRouter,
    customPrompt: typeof data.customPrompt === "string" ? data.customPrompt : ""
  };
}

async function getLocalSettings() {
  const data = await chrome.storage.local.get({
    apiProvider: "openai",
    apiKeyOpenAI: "",
    apiKeyGemini: "",
    apiKeyDeepSeek: "",
    apiKeyZhipu: "",
    apiKeyOpenRouter: "",
    apiKey: "",
    loggingEnabled: true
  });
  const apiProvider = data.apiProvider || "openai";
  let apiKey = "";
  if (apiProvider === "gemini") {
    apiKey = data.apiKeyGemini || data.apiKey || "";
  } else if (apiProvider === "deepseek") {
    apiKey = data.apiKeyDeepSeek || data.apiKey || "";
  } else if (apiProvider === "zhipu") {
    apiKey = data.apiKeyZhipu || data.apiKey || "";
  } else if (apiProvider === "openrouter") {
    apiKey = data.apiKeyOpenRouter || data.apiKey || "";
  } else {
    apiKey = data.apiKeyOpenAI || data.apiKey || "";
  }
  const loggingEnabled =
    typeof data.loggingEnabled === "boolean" ? data.loggingEnabled : true;
  return { apiKey, apiProvider, loggingEnabled };
}

async function maybeGroupTab(tabId, tab, { force }) {
  if (!tab || typeof tabId !== "number") return;
  if (tab.incognito) return;
  if (tab.pinned) return;
  if (!tab.url || !tab.title) return;

  if (!isHttpUrl(tab.url)) return;

  const now = Date.now();
  const recent = processed.get(tabId);
  if (!force && recent && recent.url === tab.url && now - recent.ts < TAB_PROCESS_COOLDOWN_MS) {
    return;
  }

  if (inFlight.has(tabId)) return;
  inFlight.set(tabId, true);

  try {
    const sync = await getSyncSettings();
    if (!force && !sync.autoGroup) return;

    const local = await getLocalSettings();

    const url = new URL(tab.url);
    const host = url.hostname;

    const labelsById = indexLabels(sync.labels);
    let labelId = null;
    let aiSucceeded = false;

    if (sync.domainRulesEnabled) {
      const rule = sync.domainRules[host];
      if (rule && labelsById[rule.labelId]) {
        labelId = rule.labelId;
      }
    }

    if (!labelId) {
      const result = await classifyTab({
        title: tab.title,
        url: tab.url,
        host,
        labels: sync.labels,
        defaultLabelId: sync.defaultLabelId,
        allowNewLabels: sync.allowNewLabels,
        apiKey: local.apiKey,
        apiProvider: local.apiProvider,
        modelOpenAI: sync.modelOpenAI,
        modelGemini: sync.modelGemini,
        modelDeepSeek: sync.modelDeepSeek,
        modelZhipu: sync.modelZhipu,
        modelOpenRouter: sync.modelOpenRouter,
        customPrompt: sync.customPrompt,
        loggingEnabled: local.loggingEnabled
      });
      if (!result) return;
      labelId = result.labelId;
      aiSucceeded = result.aiSucceeded;
    }

    const refreshedLabelsById = indexLabels(sync.labels);
    const finalLabel = refreshedLabelsById[labelId] || refreshedLabelsById[sync.defaultLabelId];
    if (!finalLabel) return;

    await groupTab(tabId, tab.windowId, finalLabel.name, finalLabel.color);

    if (host && sync.domainRulesEnabled && aiSucceeded) {
      sync.domainRules[host] = { labelId: finalLabel.id };
      await chrome.storage.sync.set({ domainRules: sync.domainRules, labels: sync.labels });
    }

    processed.set(tabId, { url: tab.url, ts: now });
  } finally {
    inFlight.delete(tabId);
  }
}

async function classifyTab({
  title,
  url,
  host,
  labels,
  defaultLabelId,
  allowNewLabels,
  apiKey,
  apiProvider,
  modelOpenAI,
  modelGemini,
  modelDeepSeek,
  modelZhipu,
  modelOpenRouter,
  customPrompt,
  loggingEnabled
}) {
  const labelsById = indexLabels(labels);

  if (!apiKey) {
    return null;
  }

  const labelNames = labels.map((l) => l.name);
  const prompt = buildPrompt({ title, url, host, labelNames, allowNewLabels, customPrompt });
  const modelSelected = pickModelForProvider({
    apiProvider,
    modelOpenAI,
    modelGemini,
    modelDeepSeek,
    modelZhipu,
    modelOpenRouter
  });

  let resultText = "";
  try {
    if (!modelSelected) return null;
    if (apiProvider === "gemini") {
      resultText = await callGemini(prompt, apiKey, modelGemini);
    } else if (apiProvider === "deepseek") {
      resultText = await callOpenAICompatible({
        prompt,
        apiKey,
        model: modelSelected,
        baseUrl: "https://api.deepseek.com/v1"
      });
    } else if (apiProvider === "zhipu") {
      resultText = await callOpenAICompatible({
        prompt,
        apiKey,
        model: modelSelected,
        baseUrl: "https://open.bigmodel.cn/api/paas/v4"
      });
    } else if (apiProvider === "openrouter") {
      resultText = await callOpenAICompatible({
        prompt,
        apiKey,
        model: modelSelected,
        baseUrl: "https://openrouter.ai/api/v1",
        extraHeaders: {
          "X-Title": "AI LeafyTab",
          "HTTP-Referer": "https://ai-leaftab.local"
        }
      });
    } else {
      resultText = await callOpenAI(prompt, apiKey, modelSelected || modelOpenAI);
    }
    if (loggingEnabled) {
      try {
        await appendLog({
          ts: Date.now(),
          provider: apiProvider,
          model: modelSelected,
          title,
          url,
          host,
          labels: labelNames,
          allowNewLabels,
          customPrompt,
          prompt,
          response: resultText
        });
      } catch (logErr) {
        console.warn("Log write failed", logErr);
      }
    }
  } catch (err) {
    console.warn("AI classification failed", err);
    if (loggingEnabled) {
      try {
        await appendLog({
          ts: Date.now(),
          provider: apiProvider,
          model: modelSelected,
          title,
          url,
          host,
          labels: labelNames,
          allowNewLabels,
          customPrompt,
          prompt,
          error: String(err)
        });
      } catch (logErr) {
        console.warn("Log write failed", logErr);
      }
    }
    return null;
  }

  const labelName = extractLabel(resultText);
  if (!labelName) return null;

  const matchedId = findLabelIdByName(labels, labelName);
  if (matchedId) return { labelId: matchedId, aiSucceeded: true };

  if (!allowNewLabels) {
    return null;
  }

  const newLabel = createLabel(labelName, labels);
  labels.push(newLabel);
  await chrome.storage.sync.set({ labels });
  labelsById[newLabel.id] = newLabel;
  return { labelId: newLabel.id, aiSucceeded: true };
}

function buildPrompt({ title, url, host, labelNames, allowNewLabels, customPrompt }) {
  return [
    "You are an assistant that categorizes browser tabs.",
    `Title: ${title}`,
    `URL: ${url}`,
    `Domain: ${host}`,
    `Existing labels: ${labelNames.join(", ")}`,
    ...customPromptLines(customPrompt),
    allowNewLabels
      ? "You may choose an existing label or create a new short label (1-4 words)."
      : "You must choose exactly one label from the existing labels.",
    "Return ONLY a JSON object like: {\"label\":\"...\"}",
    "No extra keys, no markdown, no explanations."
  ].join("\n");
}

function customPromptLines(text) {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  return ["Custom instructions:", trimmed];
}

async function callOpenAI(prompt, apiKey, model) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You respond with strict JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callOpenAICompatible({ prompt, apiKey, model, baseUrl, extraHeaders = {} }) {
  if (!model) {
    throw new Error("Model not set.");
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You respond with strict JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Provider error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "";
}

async function callGemini(prompt, apiKey, model) {
  const safeModel = model.startsWith("models/") ? model.slice(7) : model;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

function pickModelForProvider({
  apiProvider,
  modelOpenAI,
  modelGemini,
  modelDeepSeek,
  modelZhipu,
  modelOpenRouter
}) {
  if (apiProvider === "gemini") return modelGemini;
  if (apiProvider === "deepseek") return modelDeepSeek;
  if (apiProvider === "zhipu") return modelZhipu;
  if (apiProvider === "openrouter") return modelOpenRouter;
  return modelOpenAI;
}

function extractLabel(text) {
  if (!text) return "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed && typeof parsed.label === "string") {
        return sanitizeLabel(parsed.label);
      }
    } catch (_) {
      // fall through
    }
  }

  const firstLine = text.split(/\r?\n/)[0];
  return sanitizeLabel(firstLine);
}

function sanitizeLabel(label) {
  if (!label) return "";
  return label
    .trim()
    .replace(/^"|"$/g, "")
    .replace(/[\n\r]/g, "")
    .slice(0, 40);
}

function findLabelIdByName(labels, name) {
  const target = name.trim().toLowerCase();
  const exact = labels.find((l) => l.name.trim().toLowerCase() === target);
  return exact ? exact.id : "";
}

function createLabel(name, labels) {
  const baseId = slugify(name) || "label";
  let id = baseId;
  let counter = 1;
  while (labels.some((l) => l.id === id)) {
    id = `${baseId}-${counter++}`;
  }

  const color = pickNextColor(labels);
  return { id, name: name.trim(), color };
}

function pickNextColor(labels) {
  const used = new Set(labels.map((l) => l.color));
  for (const color of COLOR_PALETTE) {
    if (!used.has(color)) return color;
  }
  return COLOR_PALETTE[labels.length % COLOR_PALETTE.length];
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
}

function indexLabels(labels) {
  const map = {};
  for (const label of labels) {
    map[label.id] = label;
  }
  return map;
}

function isHttpUrl(url) {
  return url.startsWith("http://") || url.startsWith("https://");
}

async function appendLog(entry) {
  const data = await chrome.storage.local.get({ classificationLogs: [] });
  const logs = Array.isArray(data.classificationLogs) ? data.classificationLogs : [];
  logs.push(entry);
  const capped = logs.length > 200 ? logs.slice(logs.length - 200) : logs;
  await chrome.storage.local.set({ classificationLogs: capped });
}

async function ensureProxySettings() {
  const data = await chrome.storage.local.get({
    proxyEnabled: false,
    proxyHost: "",
    proxyPort: "",
    proxyScheme: "http"
  });
  if (data.proxyEnabled && data.proxyHost && data.proxyPort) {
    await setProxy({
      host: data.proxyHost,
      port: data.proxyPort,
      scheme: data.proxyScheme || "http"
    });
  }
}

async function applyProxyFromMessage(message) {
  const host = String(message.host || "").trim();
  const port = String(message.port || "").trim();
  const scheme = String(message.scheme || "http").toLowerCase();
  if (!host || !port) {
    throw new Error("Proxy host/port missing.");
  }
  await setProxy({ host, port, scheme });
}

async function setProxy({ host, port, scheme }) {
  const portNumber = Number(port);
  if (!Number.isInteger(portNumber) || portNumber <= 0 || portNumber > 65535) {
    throw new Error("Invalid proxy port.");
  }

  const proxySpec = buildProxySpec(host, portNumber, scheme);
  const pacScript = buildPacScript(proxySpec);
  await chrome.proxy.settings.set({
    value: {
      mode: "pac_script",
      pacScript: { data: pacScript }
    },
    scope: "regular"
  });
}

function buildProxySpec(host, port, scheme) {
  const sanitizedHost = host.replace(/\\s+/g, "");
  if (scheme === "socks5") return `SOCKS5 ${sanitizedHost}:${port}`;
  if (scheme === "socks4") return `SOCKS ${sanitizedHost}:${port}`;
  return `PROXY ${sanitizedHost}:${port}`;
}

function buildPacScript(proxySpec) {
  return [
    "function FindProxyForURL(url, host) {",
    "  if (dnsDomainIs(host, \"api.openai.com\")) {",
    `    return \"${proxySpec}\";`,
    "  }",
    "  if (dnsDomainIs(host, \"generativelanguage.googleapis.com\")) {",
    `    return \"${proxySpec}\";`,
    "  }",
    "  if (dnsDomainIs(host, \"api.deepseek.com\")) {",
    `    return \"${proxySpec}\";`,
    "  }",
    "  if (dnsDomainIs(host, \"open.bigmodel.cn\")) {",
    `    return \"${proxySpec}\";`,
    "  }",
    "  if (dnsDomainIs(host, \"openrouter.ai\")) {",
    `    return \"${proxySpec}\";`,
    "  }",
    "  return \"DIRECT\";",
    "}"
  ].join("\\n");
}

async function clearProxy() {
  await chrome.proxy.settings.clear({ scope: "regular" });
}

async function groupTab(tabId, windowId, title, color) {
  const groups = await chrome.tabGroups.query({ windowId });
  const existing = groups.find((g) => g.title === title);

  if (existing) {
    await chrome.tabs.group({ groupId: existing.id, tabIds: [tabId] });
    return;
  }

  const groupId = await chrome.tabs.group({ tabIds: [tabId], createProperties: { windowId } });
  await chrome.tabGroups.update(groupId, { title, color });
}

async function regroupWindow(windowId) {
  const tabs = await chrome.tabs.query({ windowId });
  for (const tab of tabs) {
    if (tab.status === "complete") {
      await maybeGroupTab(tab.id, tab, { force: true });
    }
  }
}

async function regroupAllWindows() {
  const windows = await chrome.windows.getAll({ populate: false });
  for (const win of windows) {
    await regroupWindow(win.id);
  }
}
