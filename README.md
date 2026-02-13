# AI LeafyTab

AI LeafyTab automatically classifies new tabs into label-based groups, syncs labels and learned domain rules across devices, and keeps the API key local.

## Install (Unpacked)
1. Open `chrome://extensions` in Chrome.
2. Turn on Developer mode (top right).
3. Click "Load unpacked".
4. Select the folder `/Users/rosa04/BD-workspace/AI-lab/ai-tab-grouper`.

## Configure
1. Click the extension icon and choose "Open settings".
2. Pick a provider (OpenAI or Gemini).
3. Enter your API key and click "Test & Load" to verify and load models.
4. Choose a model from the list.
5. Optionally add a custom prompt to guide grouping.
6. Adjust labels and colors.
7. Toggle whether AI can create new labels.
8. Manage domain rules or clear them to restart grouping.
9. Enable local logs for AI input/output debugging.
10. If your network requires it, set a proxy for AI API requests in the Proxy section.
11. Use the Tab Groups section to remove groups in the current window or across all windows. Saved tab groups in Chrome’s toolbar must be removed manually.
12. Use Duplicate Tabs to remove repeated tabs (current window or all windows).
13. Reorder labels by dragging or use the sort buttons in the Labels page.

## Copyright
© 2026 Rosa04. All rights reserved.

## Package for Chrome Web Store
1. Update the version in `manifest.json`.
2. Make sure the icons in `icons/` are included.
3. In this folder, run: `zip -r ai-tab-grouper.zip . -x '*.DS_Store'`.
4. Upload the zip in the Chrome Web Store Developer Dashboard.
5. Prepare a privacy policy that explains API calls, data usage, and that API keys stay local.

## Notes
- Detailed sync design: see `SYNC_DESIGN.md`.
- Labels and domain rules sync across devices using Chrome account sync.
- API key is stored only in `chrome.storage.local` on this device.
- If you change label names, existing domain rules will follow automatically.
