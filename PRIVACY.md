# Tab Box Privacy Policy

Last updated: October 26, 2026

Tab Box is a Chrome extension for saving, searching, and restoring tab groups. This policy describes how the extension handles information on your device.

## Information the extension handles

To provide its features, Tab Box reads and saves URLs and titles of tabs in browser tab groups, including saved group history. It also handles group names, colors, order and collapsed state; browser window, group and tab identifiers; window names you enter in Tab Box; and your exclusion patterns.

The extension does not read page bodies, passwords, authentication cookies, form fields, emails, or messages. A tab title or URL may itself contain personal information, so saved tab data and backups should be treated as private.

## Storage and use

Saved windows, groups, tab history and exclusion rules are stored in Chrome's local extension storage on your device. Chrome's session extension storage is used to track the current browser session and avoid restoring unrelated tabs through stale identifiers.

This information is used to display and search your saved groups, reconcile them with open browser tabs, apply exclusions, and restore the tabs you choose. Tab Box does not provide automatic account-based or cross-device synchronization.

## Sharing and network activity

Tab Box does not send saved tab data to its developer or to developer-operated servers, sell it, or use it for advertising. The extension includes no analytics or telemetry code and requires no Tab Box account.

When you restore a tab, Chrome visits the corresponding URL as a normal browser navigation. Tab icons are displayed through Chrome's favicon API. The sites you open and the browser's own services may process information under their respective privacy policies.

## Export and import

Exporting creates a JSON file containing the saved windows, groups, tabs, history and exclusion rules included in your backup. Matching excluded data is omitted. Backup files are not encrypted by Tab Box. You decide where to store or share them; transferring a file through another service is subject to that service's policies.

Importing reads the backup file you select and adds its saved data to local extension storage. You may also choose to replace your exclusion rules with those in the backup.

## Retention and your controls

Saved tab data remains in local extension storage until you remove it through Tab Box, clear the extension's storage, or uninstall the extension. Closed tabs and groups may be retained so you can restore them later.

Saving exclusions removes matching saved groups, tabs and history while leaving the browser tabs open. A matching window's name and identifier may remain locally, without its groups or tabs, to keep that window excluded. Removing an exclusion can allow currently open tabs and groups to be saved again; it does not recover deleted history.

Exported backup files are separate from extension storage and remain wherever you saved them until you delete them. Backups may retain information that you subsequently remove from Tab Box.

## Changes and contact

This policy may be updated when the extension's data handling changes. The date above identifies the latest revision.

For questions or to report a privacy issue, contact the developer through the [Tab Box project issues page](https://github.com/aaronbeall/tab-box/issues). Avoid including private tab URLs or backup files in a public issue.
