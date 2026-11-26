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

