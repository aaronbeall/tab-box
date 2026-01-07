# Tab Box (Chrome Extension)

A side panel extension to persist and manage tab groups via bookmarks. Displays a tree of Window → Tab Group → Tab, stored under a bookmarks folder named "Tab Box".

## Features

- Side panel with a searchable tree: Window → Tab Group → Tab
- Syncs current tab groups to bookmarks automatically (create/update/move)
- Closing a tab group does not remove it from Tab Box (persisted)
- Clicking window focuses/opens it; clicking group opens/focuses it; clicking tab opens/focuses it
- Auto-expands the currently focused window (groups remain collapsed by default)

## Install (Unpacked)

1. Open Chrome → More Tools → Extensions.
2. Enable Developer mode.
3. Run the build to generate the side panel assets.
   
	```bash
	npm install
	npm run build
	```
4. Click "Load unpacked" and select this folder.
4. Pin the extension (optional). Click the extension icon to open the side panel.

## Usage

- The extension will create a bookmarks folder named "Tab Box" (under Other bookmarks) and maintain Window folders and Group subfolders with tab bookmarks.
- Use the search input at the top to filter windows, groups, or tabs by name or URL.
- Clicking a window node focuses the existing window or creates a new window from its saved groups.
- Clicking a group node focuses the existing group if present; otherwise, re-creates the group in the focused window.
- Clicking a tab node focuses the existing tab with the same URL or opens it if not present.

## Notes

- Group metadata (title/color) is stored in a special bookmark inside the group folder (URL: `tabbox:meta`).
- Tab list is rebuilt to reflect current group membership on changes.
- This extension uses Manifest V3 and the Side Panel API with a React + Tailwind UI built via Vite.
