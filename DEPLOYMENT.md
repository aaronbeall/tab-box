# Tab Box - Chrome Web Store Deployment

This guide explains how to package and publish Tab Box to the Chrome Web Store.

## Prerequisites

- A Google account
- A Chrome Developer account ($5 one-time registration fee)
- The extension source code built locally
- A 128×128 PNG icon for the store listing

## Pre-Deployment Checklist

1. **Build the UI**
   ```bash
   npm install
   npm run build
   ```

2. **Update version** in [manifest.json](manifest.json)
   - Bump `version` field: `"version": "0.2.0"`
   - Keep `manifest_version: 3`

3. **Test locally** by loading unpacked in Chrome:
   - Chrome → Extensions → Enable Developer mode
   - Load unpacked → select the tab-box folder
   - Verify core functionality (tree rendering, search, click actions, sync)

4. **Create extension icon** if missing:
   - Design or export a 128×128 PNG icon
   - Save as `icons/icon128.png`
   - Optional: add 16px, 32px, 48px variants

## Step 1: Package the Extension

### Option A: Using Chrome's Built-in Packer

1. Open Chrome and go to `chrome://extensions/`
2. Enable Developer mode (toggle in top right)
3. Click **Pack extension**
4. Select the tab-box folder as the "Extension root directory"
5. Leave the "Private key file" blank (Chrome will generate one on first pack)
6. Click **Pack extension**
7. Chrome creates:
   - `tab-box.crx` (signed extension file)
   - `tab-box.pem` (private key—**keep this safe!**)

### Option B: Create a ZIP for Web Store Upload

```bash
# From the tab-box folder, create a zip archive
zip -r tab-box.zip . \
  -x "node_modules/*" \
  ".git/*" \
  "web/node_modules/*" \
  ".DS_Store" \
  "*.pem"
```

**Important:** Do not include `node_modules/` or `.pem` files in the submission ZIP.

## Step 2: Register as a Chrome Developer

1. Visit https://chrome.google.com/webstore/devconsole/
2. Sign in with your Google account
3. Pay the $5 developer registration fee
4. Verify your email and account

## Step 3: Create a New Item in the Web Store

1. Open the **Chrome Web Store Developer Console**
2. Click **Create new item**
3. Choose **Upload a file** and select your `.crx` (from Option A) or `.zip` (from Option B)
4. Click **Upload**

## Step 4: Fill in Store Listing Details

Chrome will scan the extension and populate basic fields from `manifest.json`. Complete the form:

### Required Fields

- **Name:** Tab Box
- **Summary:** Persist and manage tab groups with a searchable vertical side panel.
- **Full description:**
  ```
  Tab Box is a Chrome extension that helps you organize and persist tab groups 
  with a clean side panel UI. All groups are automatically synced and saved when closed, 
  so they persist even after closing and reopening groups.

  Features:
  - Tree view of Windows → Tab Groups → Tabs
  - Full-text search across windows, groups, and tab URLs
  - Click to focus/open/recreate windows, groups, and tabs
  - Automatic sync with browser tab groups
  - Persistent tab group storage

  Closed tab groups are not deleted—reopen them anytime from the side panel.
  ```
- **Category:** Productivity (or Extensions if Productivity unavailable)
- **Language:** English
- **Country/region:** (your location or target region)

### Optional but Recommended

- **Icon:** Upload a 128×128 PNG (or drag to the icon slot)
- **Screenshots:** 
  - 1280×800 or 640×400 PNG/JPG showing the side panel tree and search
  - 2–5 screenshots demonstrating key features
- **Promotional tiles:** For store display (optional)
- **Video URL:** (optional, demo screencast)

### Permissions Justification

Chrome requires you to justify requested permissions in the **Additional fields** section:

- **bookmarks:** To persist tab groups and metadata in the user's bookmarks folder
- **tabs:** To monitor and sync tab group membership and metadata
- **tabGroups:** To listen for and manage tab group creation/updates
- **windows:** To focus and create windows from saved groups
- **storage:** For future enhancement (optional, not currently used)

## Step 5: Submit for Review

1. Scroll to the bottom of the listing page
2. Click **Submit for review**
3. Read and accept the **Chrome Web Store Program Policies**
4. Click **Submit**

### Review Timeline

- Initial review: 1–3 hours (usually faster)
- If approved: Extension goes live immediately
- If rejected: You'll receive an email with reasons; address them and resubmit

## Step 6: Post-Publishing Updates

### To Release a New Version

1. Increment `version` in [manifest.json](manifest.json)
2. Rebuild:
   ```bash
   npm run build
   ```
3. Create an updated ZIP:
   ```bash
   zip -r tab-box.zip . \
     -x "node_modules/*" ".git/*" "web/node_modules/*" ".DS_Store" "*.pem"
   ```
4. Go to **Chrome Web Store Developer Console**
5. Click on Tab Box in your items list
6. In **Package** section, click **Upload new package**
7. Select the new ZIP
8. Review the updated fields (if any changes)
9. Click **Submit for review** (or **Publish**, if automatic)

### Versioning Best Practices

- Use semantic versioning: `MAJOR.MINOR.PATCH` (e.g., `1.0.0`)
- Increment `PATCH` for bug fixes
- Increment `MINOR` for new features (backward compatible)
- Increment `MAJOR` for breaking changes

## Troubleshooting

### "Extension rejected"

Common reasons and fixes:

- **Overly broad permissions:** Justify why each permission is needed in the description
- **Manifest errors:** Run `npm run build` to ensure `web/dist` is valid
- **Icon missing/wrong size:** Use 128×128 PNG; ensure it's uploaded
- **Privacy policy:** If collecting user data, include a privacy policy link
- **Functionality broken:** Test unpacked locally; verify `background.js` and React UI load

### "Cannot upload file"

- Ensure `web/dist/index.html` exists and is valid
- Verify ZIP doesn't include `node_modules/` (too large)
- Try uploading a fresh ZIP instead of `.crx`

### "Version already published"

- Check the current version in the developer console
- Bump `version` in `manifest.json` higher than the published version

## Debugging Published Extension

Once published, users can:

- Install directly from https://chrome.google.com/webstore/detail/[extension-id]
- View extension ID in their Chrome Extensions list
- Report bugs or request features via the **Support** tab on the store listing

To debug user issues:

1. Ask users to enable Developer mode on the Extensions page
2. Right-click the extension → **Inspect views** → **service worker**
3. Check **Console** for errors in [background.js](background.js)
4. Check **Application** → **Storage** → **Bookmarks** for Tab Box folder

## Useful Links

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- [Extension Publishing Documentation](https://developer.chrome.com/docs/webstore/publish/)
- [Content Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [How to Create a Great Store Listing](https://developer.chrome.com/docs/webstore/best_practices/)
