# TIMEPIX at school - Kit packing

A minimal kit-packing app for TIMEPIX at school, built with React, JavaScript, Vite, Tailwind CSS, qr-scanner and Papa Parse. No application backend, accounts, analytics, CDN fonts, or external runtime services. Inventory and camera frames stay in your browser. The host receives ordinary requests for static app files.

## Local setup

Use Node.js 24 (or Node 22.12+).

    npm ci
    npm run dev

Open the printed localhost URL. Camera access requires HTTPS or localhost. A phone accessing a LAN IP over plain HTTP cannot use its camera.

    npm test
    npm run build
    npm run preview

The service worker is enabled only in production. Use preview for offline testing.

## GitHub Pages

1. Create a GitHub repository and push the application to its main branch. Keep node_modules, dist, and real inventory/backups out of Git.
2. In Settings → Pages → Build and deployment, select GitHub Actions.
3. The included .github/workflows/deploy.yml runs tests, builds and deploys dist. It also supports manual runs in Actions.
4. Open the deployment URL. Relative Vite assets support repository subpaths and custom-domain roots.

This workspace has no connected remote repository. Publishing requires Git/GitHub access and the intended repository. Never commit real inventory or backups to a public repository.

## Packing

- Import a UTF-8 CSV with a header row. Map serial and destination columns. The required accessory is an extension USB cable.
- Duplicate serials are rejected. Matching trims surrounding spaces, normalizes Unicode NFC and ignores case. Original serial text and leading zeros are kept.
- Scan a QR containing the serial as plain text, or enter it manually. Unknown serials and already-packed devices produce clear messages. QR contents are never opened as links.
- Confirm or modify the destination and check required accessories. Save progress or Mark as packed. Packing requires a non-empty destination, confirmation, and all accessories. Saving progress reopens a packed record.
- View/edit original columns under Other device details. Serial identity stays fixed.
- Use Scan for camera/manual lookup and Device list for search and status. A single bar shows progress. Import and export CSV from Files.
- Use JSON backup for exact recovery, including the complete accessory checklist.

Original columns retain their order, including unrecognized fields. CSV export uses UTF-8 with a BOM, CRLF and correct quoting; original CSV formatting, delimiters and blank lines are not preserved. Four reserved columns are appended or updated: __packlane_status, __packlane_accessories (JSON array), __packlane_confirmed and __packlane_updated. Do not use these names for unrelated data.

Spreadsheet formula protection is always on for CSV exports from Files. It prefixes potentially executable text with an apostrophe, including column headers and formulas after leading whitespace. This deliberately changes those downloaded CSV values; the locally stored originals are unchanged. Use JSON backups if you need exact values. JSON always preserves exact values. USB stick and starter guide presence are separate Yes/No fields. JSON retains the complete workspace.

## Data protection and recovery

IndexedDB saves report success only after the transaction commits. Revision checks inside the transaction prevent stale tabs from silently overwriting one another. If another tab changes the database, export any needed backup and reload. Unsaved editor changes prompt before closing or leaving.

Every change retains the preceding state as an atomic recovery snapshot (last three states). Replacement requires acknowledgement. Files > Backup & recovery downloads/restores validated JSON and snapshots, requests persistent browser storage and clears inventory with a typed confirmation. Clearing retains snapshots; removing site storage deletes everything.

Storage is specific to this browser, profile, device and origin. It is not encrypted by the app. Private browsing, cleanup, storage pressure or device loss can remove data. Browser-granted persistent storage does not replace external backups. All writers must honor the revision protocol; another app on the same origin is not isolated from this storage.

CSV imports are limited to 10 MB, 20,000 devices, 120 total columns and 10,000 characters per field. React renders untrusted fields as text. There is no HTML injection, expression evaluation or QR-based URL navigation. CSP restricts scripts, workers and connections to the app origin and disallows plugins and form submission. The application transmits no inventory data. Use a dedicated origin if other apps hosted there are untrusted.

## Offline and mobile

Production precaches the app shell, all built JavaScript/CSS, icons, manifest and the qr-scanner decoder worker. Wait for Available offline after the first online visit. Install via the browser menu or Safari Share → Add to Home Screen. A first online visit is required.

Updates wait until all Packlane tabs close, avoiding interruption of active packing. Camera streams stop on record opening, dialogs, manual stop, hidden tabs and component unmount. Camera permission, focus, flashlight, install prompts, persistence and background behavior vary by browser. Manual entry remains available.

The interface includes responsive phone layouts, safe-area insets, keyboard navigation, trapped dialog focus, reduced-motion support, explicit saves and recovery controls. Runtime dependencies are React/React DOM, qr-scanner and Papa Parse. fake-indexeddb is test-only.
## Branding and browser checks

The original Timepix at school logo is bundled locally from the official CERN project site:
https://timepix-at-school.web.cern.ch/wp-content/uploads/2026/05/timepix@school_logo_original-on-black_72-dpi.png

The interface uses turquoise (#17BCBA), black and white. Existing IndexedDB identifiers are retained to preserve saved inventories.

The main interface has one progress bar and two views: Scan and Device list. Backup, recovery and install controls are under Files > Backup & recovery. The extension USB cable is the only required accessory.

After building, run the optional local Chrome check:

    npm run test:browser

Set CHROME_PATH if Chrome is installed in a different location. The check uses a temporary browser profile and local server. Ignored screenshots and test exports are saved in .artifacts.
## Standard Timepix CSV

Download the blank template from Files > CSV template. The columns are:

1. Serial number (unique; text such as 3680, including leading zeros)
2. Readout chip ID (unique; such as F06-W0316)
3. Sensor thickness (such as 300um; repeated values are allowed)
4. Sensor class (A, B or C)
5. Condition (OK or BAD)
6. Extension USB cable (Yes or No)
7. Destination
8. Packing date (YYYY-MM-DD; filled automatically by the app)
9. USB stick (Yes or No)
10. Starter guide (Yes or No)
11. Comments

Current location is omitted. The template is public/timepix-template.csv; public/timepix-sample.csv contains three illustrative detector records with Germany, Netherlands and Switzerland as destinations and blank Comments values.

Both identifiers are checked independently for duplicates, ignoring case and surrounding spaces. Readout chip IDs can be corrected in the record form, with the same uniqueness check on save. Sensor class and condition use fixed choices; invalid imported values are rejected.

The extension USB cable is the only required accessory. USB stick and starter guide presence is recorded independently; absence does not prevent packing. BAD is recorded as the device condition and does not automatically prevent packing.

Mark as packed requires the chip ID, sensor thickness, sensor class, condition, confirmed destination and extension cable. It writes the browser's local calendar date into Packing date. Saving progress does not create a new date. Editing a packed record preserves its existing date; reopening retains the previous packing date for reference, and packing it again updates the date.

Existing saved lists retain their original columns and comments. Missing standard fields are appended. Older packed records that lack the new required details reopen as in progress for review. The previous saved workspace is retained as a recovery snapshot on the next successful save. Unknown original CSV columns remain available under Other original columns.
Destinations are selectable from a dropdown populated from the saved device list, including imported CSV values. Choose Add a new destination to enter a new name. Once Save progress or Mark as packed succeeds, the destination becomes available for other devices and remains available after reload and CSV export/reimport. Repeated values appear once; blank values are omitted. Changing the destination clears its confirmation so it can be checked again.
## Device overview and identity

Device list shows serial number and readout chip ID as separate, explicitly labelled identifiers. For example, serial 3680 and chip F06-W0316 refer to one device. Both can be scanned or entered for lookup; values matching different devices across identifier types produce an ambiguity message rather than choosing silently.

The overview includes sensor thickness/class, condition, destination, extension cable/USB stick/starter guide presence, packing status/date, comments and an Edit action. Desktop uses a detailed table; phones use device cards. Search matches either identifier or other original fields. Status, condition and destination filters can be combined.

Imports cannot map a serial number or readout chip ID column as Destination. A missing Destination header is not silently inferred from the first column. Existing saved mapping errors are corrected from recognized headers while preserving all original cell values; affected confirmations are cleared and packed records reopen for review. Values genuinely entered into the Destination column remain data and can be corrected in the editor.