# Watched folder: feasibility

Status: research only, no code. Checked 30 Oct 2026 against main after #190 (see [ROADMAP.md](../ROADMAP.md)).

## Verdict

Feasible, but only for a minority: Chromium desktop users whose files land in a folder the browser
is allowed to open. It cannot be the main fresh-data path. Garmin Express writes to folders that
Chrome refuses to open, and phone-only users have no local folder at all. Build the incremental
re-import first (it serves everyone), then add the watched folder as a Chromium-only extra.

## 1. What the browser can do

| Capability                          | Chrome / Edge desktop              | Safari        | Firefox       |
| ----------------------------------- | ---------------------------------- | ------------- | ------------- |
| `showDirectoryPicker` (read access) | Yes, since 105                     | No            | No            |
| Access kept after the tab closes    | Opt-in per user, Chrome 122 and up | n/a           | n/a           |
| `FileSystemObserver`                | Shipped in 133                     | No            | No            |
| `<input webkitdirectory>` fallback  | Yes                                | Yes (one-off) | Yes (one-off) |

Sources: [caniuse](https://caniuse.com/native-filesystem-api) (Chrome and Edge 105, Safari and
Firefox unsupported, Mozilla's position listed as "harmful", Chrome for Android unsupported);
[MDN showDirectoryPicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
(HTTPS only, needs a click, `id` and `startIn` options).

### Permission after a reload

- A directory handle is structured-cloneable, so it can be stored in IndexedDB
  ([Chrome guide](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)).
- Access normally ends when the origin's last tab closes. The handle survives; the permission does not.
- From Chrome 122 the prompt offers "Allow on every visit". Without that choice the app must call
  `requestPermission()` on the stored handle, which needs a click
  ([persistent permissions](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)).
- Chrome can still revoke access after a tab sits in the background. After three denials the
  three-way prompt stops appearing. Installed PWAs keep permission.
- So the design needs a visible "Reconnect folder" state. Silent background reading cannot be promised.

### FileSystemObserver

- Origin trial Chrome 129 to 134, shipped in Chrome 133 (the intent said desktop only) and Edge 133
  ([Chrome 133 notes](https://developer.chrome.com/release-notes/133),
  [intent to ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/6oOaFmia2dc/m/gx0KgpQqBQAJ),
  [web.dev](https://web.dev/blog/web-platform-01-2025)). MDN still labels it experimental and non-standard
  ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver)).
- It works on handles from `showDirectoryPicker`. Record types: appeared, disappeared, modified, moved,
  unknown (events were missed, rescan), errored. The per-origin limit and event detail depend on the OS
  ([trial article](https://developer.chrome.com/blog/file-system-observer)).
- It only helps while the tab is open. A scan on open covers the same need, so treat it as optional.

### Polling cost

One scan lists the folder and reads `lastModified` and `size` from each file. A few thousand files
is about a second or two of work (an estimate, not measured here). Scan on app open, on
`visibilitychange` to visible, and on observer events. No timer, which matches the event-driven
check-in. A FIT file is read in full only when its name, size and time are new.

## 2. Where the files actually land

Chrome blocks whole trees from the picker. From
[the Chromium source](https://github.com/chromium/chromium/blob/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc):

- Windows: `AppData` (roaming and local) and `ProgramData` are blocked, with all children.
- macOS: `~/Library` is blocked with all children. `Library/Mobile Documents` (iCloud),
  `Library/CloudStorage` (Dropbox, Drive, OneDrive) and `Library/Containers` are allowed.
- Your home folder itself is blocked. Its subfolders such as Documents and Downloads are fine.

| Source                    | Where files land                                                                                                   | Reachable by the picker?            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Garmin Express, Windows   | `C:\ProgramData\Garmin\GarminConnect\<device>\Upload`, staging in `...\Core Update Service\Sync`                   | No (`ProgramData` blocked)          |
| Garmin Express, macOS     | `~/Library/Application Support/Garmin/GarminConnect/<id>/Upload/FIT_TYPE_4`                                        | No (`~/Library` blocked)            |
| Garmin watch over USB     | Watch drive, `GARMIN/Activity`. Some models use MTP and show no drive on a Mac.                                    | Yes if it mounts as a drive         |
| Garmin Connect mobile     | No documented local copy. Originals come from Connect web "Export Original" or the data-export email.              | No folder exists                    |
| Wahoo ELEMNT              | Wahoo app can push FIT files to Dropbox, reported as `Apps/WahooFitness`. Path unconfirmed by Wahoo.               | Yes, via the Dropbox desktop folder |
| Zwift                     | `Documents/Zwift/Activities` on older installs. Windows moved in Feb 2026 to the tray "Open Logs Folder" location. | Yes (Documents)                     |
| COROS                     | Cloud and partner pushes. Single FIT export from the app, bulk export by email.                                    | Only if the user copies files over  |
| Suunto                    | SuuntoLink folder is gone. One FIT export at a time from the app.                                                  | Only if the user copies files over  |
| iCloud, Dropbox, OneDrive | Any folder the user or an automation fills                                                                         | Yes                                 |

Sources: Garmin forum threads on
[Express paths](https://forums.garmin.com/apps-software/mac-windows-software/f/garmin-express-windows/155965/where-does-express-6-11-1-0-put-activity-files/863519)
and [the Mac upload path](https://forums.garmin.com/apps-software/mac-windows-software/f/garmin-express-windows/155965/where-does-express-6-11-1-0-put-activity-files/878830);
[Zwift support](https://support.zwift.com/en_us/locating-your-activity-log-and-workout-files-BykKO63fr.md);
[COROS export](https://support.coros.com/hc/en-us/articles/360043975752-Exporting-Workout-Data-and-Uploading-to-3rd-Party-Apps);
[Suunto forum](https://forum.suunto.com/post/65268);
[Wahoo to Dropbox project](https://github.com/masc4ii/WaoStats). Garmin and Wahoo paths come from
forums, differ by Express version, and one Express release stopped keeping copies. Treat them as
unverified until a tester confirms them on their own machine.

Net: the Garmin Express folders are the most likely home of a Garmin user's files and the picker
refuses them. A user could copy or sync them to Documents or Dropbox, but few will. The realistic
reachable group is Zwift, Wahoo through Dropbox, and people who already keep an export folder.

## 3. Minimal prototype in this codebase

What exists today:

- Imports go through `addFiles(files: File[], baseline)` in `apps/web/src/ui/useAccount.ts`
  (`importActions.ts`). `File` objects are sent to the worker by reference (`protocol.ts`, `addFiles`).
  A `FileSystemFileHandle.getFile()` result is a `File`, so the whole pipeline is reused unchanged.
- File picking is `useFilePicker.tsx`; accepted types are in `ui/readableFiles.ts`.
- There is no file-hash skip. `sessionSource.ts` hashes a file only when files are kept
  (`hashFiles`), and the hash goes to `createActivity` in `worker/accountSave.ts`. The device library
  (`worker/deviceLibrary.ts`, IndexedDB `rca-device-library`) stores no file hash.
- Re-import is already safe. `importFile` parses the file and `consider` (`sessionKeep.ts`) compares
  the workout with held ones through `dedupeKey` (sport plus start second) and `duplicates.ts`. A
  re-sent file comes back as a duplicate. The cost is parsing every file again, and the import notice
  would list each one as a duplicate.

Proposed modules (names are suggestions):

1. `ui/watchedFolder/handleStore.ts`: one IndexedDB database `rca-watched-folder`, with the handle and a
   ledger keyed by relative path, holding `size` and `lastModified`. Cleared on sign-out and by a
   "Forget folder" button, like the same-route fingerprints.
2. `ui/watchedFolder/scan.ts`: walks the handle, keeps `.fit`, `.fit.gz`, `.gpx`, `.tcx` (no zips),
   skips ledger hits, returns the new `File[]`. Pure and testable with a fake directory handle.
3. `ui/watchedFolder/useWatchedFolder.ts`: permission state (`none`, `needs-click`, `granted`,
   `unsupported`), scan on open and on visible, optional `FileSystemObserver`. Calls `addFiles(newFiles)`,
   then writes the ledger after the import reports success.
4. A "Connect a folder" control next to the file picker, shown only when `showDirectoryPicker` exists,
   and a "Reconnect folder" prompt on `needs-click`.

Where hash skip plugs in: the ledger above is the cheap pre-parse skip (name, size, mtime).
A SHA-256 check (`core/sha256.ts`) only matters when a tool rewrites a file with a new mtime.
Add it as a second ledger key if testers hit that. Do not store hashes in the digest.

Filter duplicates out of the notice: mark folder-driven imports so `mergeOutcomes.ts` and
`skipTally.ts` report only what was added ("3 new activities since last import").

Build the universal path first: remember the last import time, and after any picker or drop,
tell the athlete how many files were new. Safari and Firefox users can re-pick the folder with
`webkitdirectory`, filtered by the same ledger. That is one click, no handle, no persistence.

## 4. Cost and risks

- Prototype for Chromium: about 2 to 3 days (estimate): scan, ledger, handle store, permission states,
  UI, unit tests with a fake handle. Add about 1 day for the observer and for hardening.
- E2E needs a stubbed `showDirectoryPicker`; Playwright cannot drive the native picker.
- Reach is small: Chromium desktop is part of the audience, the folder is reachable for a fraction of
  that, and the permission prompt is another step.
- Privacy fits: nothing leaves the browser, and the handle is local. Add the folder name to the privacy
  page and to "forget on sign-out".

## 5. Recommendation

1. Do the "since your last import" check-in on the existing picker and drop first: ledger by path,
   size and mtime, plus a "new since" count. Works in every browser.
2. Ask the five testers where their files land (Express, watch drive, Dropbox, phone only) first.
3. If two or more testers have a reachable folder, build the Chromium prototype in stage E.
   Do not promise Garmin Express support.
