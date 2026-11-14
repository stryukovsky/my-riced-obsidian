# Reading progress and Canvas navigation

A small, offline Obsidian plugin with two features. No runtime dependencies, network requests, telemetry, or scroll-speed changes.

## Folder reading progress

Two icons appear in the left ribbon:

- **Track current folder / Untrack current folder**: toggle tracking for the open file's immediate parent folder. A notice confirms the change; the icon changes when the current folder is tracked. Files in the vault root are supported too.
- **Continue reading**: search tracked folders and open the last file you read in the selected folder.

Opening another file in a tracked folder updates its progress automatically. Subfolders are independent: tracking `Books` does not track `Books/Novel`. Progress means the last-opened file, not cursor or scroll position. Both ribbon actions are also available in the command palette.

### Storage and syncing

Progress is stored in `.obsidian/progress-track.json` (or the equivalent path if you use a custom vault configuration folder):

```json
{
  "version": 1,
  "folders": {
    "Books/Novel": "Books/Novel/Chapter 3.md"
  }
}
```

Use your existing sync tool to include this file **and the referenced notes**. The plugin does not provide a sync service, and not every sync tool includes arbitrary files inside `.obsidian`. Verify that this file reaches your other device. Concurrent edits on different devices can conflict; use one device at a time or resolve conflicts with your sync tool. Paths reveal folder and file names to whichever sync service you choose.

Writes within one plugin instance are queued and each update re-reads disk. Invalid data is reported instead of overwritten. In-vault renames update saved paths. Deleted/moved-away files remain recorded but are omitted from the picker until you open another file in that tracked folder. Deleted folders are untracked.

## Canvas navigation

With Canvas focused and no card being edited:

| Keys | Action |
| --- | --- |
| `Left`, `h`, or `р` | Pan view left |
| `Down`, `j`, or `о` | Pan view down |
| `Up`, `k`, or `л` | Pan view up |
| `Right`, `l`, or `д` | Pan view right |
| `+` or `=` | Zoom in |
| `-` | Zoom out |

All mappings work **with or without Ctrl**, including zoom. Physical key positions support both English and Russian keyboard layouts; numpad `+` and `-` also work. Alt/Meta combinations and Shift+direction keys are left alone.

Panning moves 20% of the visible viewport per press. Pan and center-based zoom animate smoothly; holding a key accumulates motion. Pointer/wheel input cancels the plugin's pending glide without changing native scrolling. These are keyboard keys, not additional ribbon buttons; Obsidian's existing Canvas zoom buttons remain unchanged.

Keys are left alone in text inputs, card editors, dialogs, other panes, and outside Canvas. The six Canvas actions also appear in the command palette and can be assigned custom hotkeys in **Settings → Hotkeys**. The built-in mappings above stay active within Canvas.

**Compatibility:** reading progress uses the public API; Canvas viewport navigation uses undocumented internals with runtime guards. Obsidian updates may require adjustments. Mobile-safe APIs are used; keyboard navigation requires a hardware keyboard. Real-device desktop/mobile testing is still required.

## Development and installation

```sh
npm install
npm test
npm run lint
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/my-riced-obsidian/`, reload Obsidian, then enable the plugin in **Settings → Community plugins**. `npm run dev` rebuilds on changes. Generated `main.js` is not committed.

For the local vault, run `npm run build` then `./install.sh`. The script copies the built plugin, manifest, and stylesheet into `~/Work/my-vault/.obsidian/plugins/my-riced-obsidian/`. It can be invoked from any directory and does not modify progress data.

### Manual acceptance check

1. Open `Books/A.md`, track the folder, then open `Books/B.md`. Verify the JSON records `Books/B.md`.
2. Open a file elsewhere, select **Continue reading**, choose `Books`, and verify `B.md` opens. Restart Obsidian and repeat.
3. Untrack `Books`; verify its JSON entry disappears. Check nested folders and files in the vault root independently.
4. Rename a tracked folder/file; verify Continue still works. Delete the saved file; verify it is skipped and opening a replacement updates progress.
5. In Canvas, try all directions and zoom keys, including holding keys. Confirm pan direction is view direction, zoom is centered, and both animate.
6. Edit a card, focus sidebar search, and open a dialog: typing and native shortcuts should work normally. Repeat in a pop-out window.
7. Disable/re-enable the plugin during an animation. Verify no lingering handlers or motion. Check a hardware keyboard on mobile.
8. With your sync tool, confirm the JSON arrives on a second device and Continue opens the same file.

## Development best practices used

- Keep lifecycle registration in `src/main.ts`; isolate progress storage, picker UI, and undocumented Canvas APIs.
- Use registered workspace/DOM events and cancel animation frames on unload.
- Prefer public APIs, `this.app`, normalized vault-relative paths, safe DOM helpers, and sentence-case UI.
- Use the adapter only for the requested hidden configuration file, which is outside the indexed Vault API.
- Keep all behavior local, avoid scanning the vault, and skip unchanged writes.
- Avoid global default hotkeys; the explicitly requested mappings are scoped to a non-editing Canvas.

References: [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines), [Developer policies](https://docs.obsidian.md/Developer+policies), [API reference](https://docs.obsidian.md/Reference/TypeScript+API), [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development).
