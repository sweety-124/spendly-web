# Spendly

Spendly is a local-first expense and bill manager built with React, TypeScript, and Vite. This initial phase focuses on bill capture, editable OCR, and persistent browser storage.

## What works today

- Add expenses manually or attach one or more bill images.
- Merchant and total fields are optional; uploading a bill starts OCR automatically to fill them when detected, while preserving any values already typed.
- Use the device camera where the browser supports image capture.
- Run English OCR in the browser, then review the extracted merchant, AED total, spend category, and receipt item names/prices before saving.
- Choose from UAE-friendly spending categories such as groceries, dining, entertainment, health, transport/fuel, home utilities, telecom, travel, education, and more. Each bill item has its own editable price and category.
- Create, edit, view, search, filter, and delete expense records.
- Store expense records and original bill images in IndexedDB.
- View a dashboard with recent transactions, category distribution, and six-month spending bars.
- Export filtered expenses as CSV or all local records and images as a JSON backup.
- Manage local data, inspect browser storage usage, and clear images or all expense data with confirmation.
- Switch between light and dark themes.

All expense amounts use AED. Existing saved numeric amounts are kept as-is and are now treated as AED. Data is not uploaded to a Spendly server. Tesseract.js may download its OCR worker and English language model when scanning for the first time; bill images are processed in the browser. The app currently needs a connection for those first-time OCR assets.

## Run locally

```sh
npm install
npm run dev
```

Run the TypeScript checks and production build with:

```sh
npm run build
```

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. In Vercel, choose **Add New Project** and import that repository.
3. Keep the framework preset as **Vite**. The build command is `npm run build`, and the output directory is `dist`.
4. No environment variables are required for the local-only phase.
5. Deploy. Vercel's Vite preset serves the SPA entry point for app routes; configure a rewrite to `/index.html` if you later add a client-side router.

Preview deployments can be enabled from the Vercel project's Git settings. Deploy over HTTPS so mobile browser camera features can be used.

## iOS / Capacitor path

Capacitor packaging is a follow-on phase and has not been configured or verified in this initial implementation. Once native camera handling and the PWA assets are finalized, the standard Capacitor workflow is:

```sh
npm install @capacitor/core @capacitor/cli
npx cap init Spendly com.example.spendly
npm install @capacitor/ios
npx cap add ios
npm run build
npx cap sync ios
npx cap open ios
```

Set Capacitor's `webDir` to `dist`, replace the example bundle ID with an owned reverse-DNS identifier, and use Xcode on macOS to configure signing, app icons, launch screens, privacy usage descriptions, and App Store distribution. Verify camera permissions and IndexedDB persistence on physical devices before submission. A PWA manifest, service worker, cloud sync, report/PDF exports, and production iOS validation are not part of this phase yet.

## Current scope

This is the local-storage foundation. Cloud accounts/synchronization, restore-from-backup, advanced analytics and report generation, installable PWA/offline asset caching, and automated test coverage are planned for later phases.
