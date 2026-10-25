# Tab Box (Chrome Extension)

A side panel extension to persist and manage tab groups and windows in a vertical side panel. Displays a tree of Window → Tab Group → Tab, and closed windows, groups, or tabs are remembered in the panel to be re-opened at any time you want.

[Tab Box - Chrome Web Store link](https://chromewebstore.google.com/detail/tab-box/dalpageodkfccllcklgekddlpkinjjep)

<img width="377" height="799" alt="image" src="https://github.com/user-attachments/assets/798dd4e5-a13c-4387-8a4f-c29160dac409" />


## Features

- Side panel with a searchable tree: Window → Tab Group → Tab
- Syncs current tab groups to panel automatically (create/update/move)
- Closing a tab group does not remove it from Tab Box
- Closing a tab in a group keeps in group-level history in Tab Box
- Clicking a tab group in Tab Box focuses it, or re-opens it in the window it was in
- Configurable sync exclusions for tab titles/URLs, group names, and Tab Box window names
- JSON export/import for transferring saved groups and history to another machine

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

## Notes

- Tab state is stored locally using `chrome.storage.local`; automatic account/device sync is not provided.
- On browser or window restart, restored tabs and groups get new Chrome IDs, so Tab Box must do a name based reconciliation with stored data -- duplicate group names can cause problems
- Chrome events are not always completely reliable, use right-click on the extension icon and "Refresh Side Panel" to attempt to resync
- This extension uses Manifest V3 and the Side Panel API with a React + Tailwind UI built via Vite.

## Exclusions and backups

Click the **gear icon** beside search to open Settings. Use **Exclusions** to edit rules or **Backups** to export and import.

Exclusions use one pattern per line, ignore case, and match an entire title, URL, or name. `*` matches any text, and `?` matches one character. For substring matching, use `*private*`. Tab rules match titles or URLs; group rules exclude the group and all its history; window rules match names you assign inside Tab Box. Ungrouped tabs are still outside Tab Box's existing scope.

Defaults exclude `Claude`, `Claude in Chrome*`, and Claude extension pages (`chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/*`). They target automation markers, including the user's reported Claude group; Chrome does not expose a general “AI controlled” flag. [Claude documents its use of separate tab groups](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome). Customize the patterns for other agents. A personal tab/group/window using a matching name is also excluded; ordinary Claude website URLs are not excluded by domain.

**Saving rules removes matching saved entries and history.** Browser tabs remain open. Export a backup first if you want to keep that history. Removing a rule allows currently open browser groups to sync again, but does not recover removed history. An excluded window's name and ID are retained internally with no groups, so later events keep it excluded; this metadata is omitted from the panel and exports. Window-name rules apply to the Tab Box name, not Chrome's active-tab title.

**Export backup** downloads versioned JSON with saved windows, groups, tabs, history, and rules, after applying exclusions. It includes browsing URLs. Transfer the file to the other machine, load Tab Box, and choose **Import backup**. Import validates the complete file before saving and adds windows under **Closed Windows** without opening tabs. Existing entries are kept. All imported IDs are reassigned, so they cannot point at unrelated live tabs on the destination machine. Expand Closed Windows and click a group to restore it; history remains available separately. Re-importing the same file adds another copy.

Imports use the destination's exclusions by default. Select **Also replace exclusions with rules from the backup** to transfer rules too; matching existing saved data will then be removed. Backups are limited to 10 MB and 50,000 imported items. Export/import is a manual transfer, not continuous cross-device synchronization.

## Verification

```bash
npm test
npm run typecheck
npm run build
```

Tests cover pattern matching, defaults, history filtering, window exclusion persistence, live group changes, backup validation, portable IDs, and queued worker operations using a mocked Chrome API. Reload the unpacked extension after building. See [REVIEW.md](REVIEW.md) for suggested performance and correctness fixes that have not been implemented.

## Todo

- [ ] User preferences:
  - [ ] Delete group if ungrouped
  - [ ] Reconcile data on focus
  - [ ] Expand groups by default
  - [ ] Expand closed groups by default
  - [ ] Sync group expand/collapse from panel
- [x] Export/Import
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
- [x] Re-opening and restoring tabs caused a shit ton of duplicates
