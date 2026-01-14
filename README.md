# Tab Box (Chrome Extension)

A side panel extension to persist and manage tab groups and windows in a vertical side panel. Displays a tree of Window → Tab Group → Tab, and closed windows, groups, or tabs are remembered in the panel to be re-opened at any time you want.

## Features

- Side panel with a searchable tree: Window → Tab Group → Tab
- Syncs current tab groups to panel automatically (create/update/move)
- Closing a tab group does not remove it from Tab Box (persisted)
- Clicking a tab group focuses it, or re-opens it in the window

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

## Todo

- [ ] User preferences:
  - [ ] Delete group if ungrouped
  - [ ] Reconcile data on focus
  - [ ] Expand groups by default
  - [ ] Expand closed groups by default
  - [ ] Sync group expand/collapse from panel
- [ ] Export/Import
- [ ] Account data sync
- [x] Collapsable groups
- [x] Sync group collapsed state
- [x] Sync group order
- [ ] Include pinned tabs as psuedo group
- [ ] Sync window name (as of now Chrome API doesn't support this)
- [x] Refresh button to force reconcile data
- [ ] Share (shares list tab group URLs)
- [ ] Tab group management from panel
  - [ ] Edit group name/color
  - [ ] Move group to window
  - [ ] Move group tabs to other group
  - [ ] Remove tab
  - [ ] Move tab (drag and drop)
  - [ ] Move tab group (drag and drop)
- [ ] Trash (deleted items, empty trash)
- [x] Other Windows section, collapsable
- [x] Empty state (no tab groups)
- [ ] Onboarding
- [x] Click currently focused group should collapse it (in panel and chrome) to make cycling easy
- [ ] Pin groups, so they stay at the top of the list, search pinned groups
- [ ] Archive groups

## Bugs
- [x] Detaching and re-attaching group to windows causes sync issues
  - [x] Drag group out of window -- it still appears in old window
  - [x] Dragging group into window caused all other groups in window to be shown as closed, clicking them caused duplicates -- reconcile fixed it
  - [x] Dragged group out of window, it ended up showing the old window as closed - refresh fixed
- [x] Opening closed group caused it to be duplicated, duplicate group did not have history (timing issue?)