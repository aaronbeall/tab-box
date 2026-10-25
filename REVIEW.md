# Performance and correctness review

These are recommendations from source inspection, not implemented fixes. They concern existing behavior. The new exclusion and backup features have separate automated coverage. Priorities reflect risk of data loss or incorrect restoration before speed.

1. **High: stop reconciling distinct live groups by title alone.** `findStoredGroupByTitle` in `background.ts` returns the first title match, including an already-open group, and can fall back to another window. Two open groups named “Research” can overwrite or move each other's saved entry. Match only unattached candidates, score tab URL overlap, and preserve separate entries when ambiguous. Test duplicate and empty names across windows and after restart.

2. **High: validate saved identities before focusing existing Chrome objects.** `focusOrOpenWindow`, `focusOrOpenGroup`, and `focusOrOpenTab` probe old numeric IDs even when saved entries are closed. After browser restart, an ID can belong to an unrelated object. Use session-scoped live bindings plus ownership checks; never assume a successful ID lookup identifies the saved item. Imports use fresh negative IDs to avoid introducing this problem for transferred entries, but the original restart behavior remains.

3. **High: serialize context-menu reconciliation through the event queue.** The `resync-all` context-menu handler calls `reconcileAllWindows` directly while other event handlers use `queue`. Its read/modify/write sequence can interleave with edits and lose changes. Enqueue the entire refresh and verify concurrent refresh, rename, delete, and import retain all intended updates.

4. **Medium: reconcile both groups when tab membership changes.** The `tabs.onUpdated` handler only handles URL/title changes. Moving or ungrouping a tab can leave its former group stale until another event or refresh. Track previous group membership and handle `changeInfo.groupId`, updating source and destination together. Test grouping, ungrouping, and moving the last tab from a group.

5. **Medium: fix the detach lookup.** In `syncTabGroup`'s null-window branch, `stored.windowId` is overwritten with `-1` before indexing `data.windows`, so deletion targets the wrong window. Retain the original key and define how data stays recoverable between detach/attach. Verify interrupted drags and window closure during a move.

6. **Medium: keep a real placeholder when restoring a group containing only history.** `focusOrOpenGroup` creates a temporary tab/group and then removes its only tab. Chrome removes the now-empty group, leaving a saved ID for a nonexistent group. Keep a new-tab placeholder until a history tab is restored, or offer a history-specific restore action. Also define rollback for partially failed multi-tab restores; currently earlier tabs remain open if a later create fails.

7. **Medium: coalesce events and reconcile in one storage transaction.** Each group sync reads and writes the complete collection, queries all groups in its window, and broadcasts another complete panel reload. Full refresh repeats that work for every window/group, with nested group-position searches. Fetch a browser snapshot once, index windows/groups/tabs with maps, compute changes in memory, write once, and skip unchanged snapshots. Debounce repeated URL/title events per group while preserving ordering for destructive actions. Measure storage calls and refresh time with hundreds of groups and thousands of history entries.

8. **Medium: prevent panel reload races and remounting.** Every storage notification sets `isLoading`, replaces the tree with the loading view, and starts an unversioned asynchronous reload. This causes flicker, resets component-local history expansion, and permits older responses to overwrite newer state. Reserve the loading view for initial load, discard stale responses, and coalesce notifications. The settings panel is kept mounted during feature operations, but the existing tree behavior is otherwise unchanged.

9. **Low: complete search dependencies and focus handling.** The filtered search memo reads `currentWindowId` without listing it as a dependency, and the panel does not consume `windowFocused`. Define whether “current window” means the panel's owning window or the globally focused window, then keep filtering consistent with that definition and test switching windows during search.

10. **Low: bound retained history and disable verbose production logging.** History has no retention/size policy; every update handles the entire saved collection. Add an optional retention cap and explicit storage-quota feedback. `DEBUG = true` also logs whole stored groups with browsing URLs during normal operation; make detailed logs opt-in.

Suggested follow-up order: identity/reconciliation safeguards, queued refresh and group-membership handling, restoration edge cases, then batched storage and panel updates. No commits were created.
