# Shop.app Receipt Exporter

A lightweight Chrome extension that exports visible Shop.app receipt line items into an accounting-friendly CSV file.

This extension is intended for personal or internal use when Shop.app's receipt view does not provide a useful printable or importable order format.

## Features

- One-click export from a visible Shop.app order page.
- CSV output with order number, item name, variant, quantity, unit price, and extended total.
- Privacy-first local processing. No receipt data is sent to external services.
- Unpacked Chrome extension install. No Chrome Web Store account is required.

## Prerequisites

- Google Chrome or another Chromium browser that supports Manifest V3 extensions.
- Access to your Shop.app order history.

## Installation

### From a GitHub Release

1. Download the latest `shop-app-receipt-exporter-vX.Y.Z.zip` file from the repository's **Releases** page.
2. Extract the zip file to a permanent folder on your computer.
3. Open Chrome and go to `chrome://extensions/`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder.
7. Pin the extension to your toolbar.

### From Source

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.
6. Pin the extension to your toolbar.

## Usage

1. Log into `https://shop.app`.
2. Open a specific order receipt under `shop.app/orders`.
3. Wait for the line items to finish loading.
4. Click the extension icon.
5. Chrome downloads `Shop_Receipt_[OrderNumber].csv`.

## Updating

1. Download and extract the newer release zip.
2. Replace the previous extension folder with the new extracted folder.
3. Open `chrome://extensions/`.
4. Click **Reload** on the Shop.app Receipt Exporter card.

## CSV Columns

- `Order Number`
- `Item Name`
- `Variant`
- `Quantity`
- `Unit Price`
- `Extended Total`

## Privacy

The extension runs entirely in your browser. It reads the visible Shop.app receipt page, builds a CSV file locally, and triggers a browser download. It does not use a server, third-party API, analytics service, or remote storage.

## Troubleshooting

- **No items found:** Confirm you are on a specific Shop.app order receipt page and that the product line items are visible before clicking the extension.
- **Wrong or missing values:** Shop.app may have changed its page structure, or the receipt may use a layout this scraper does not support yet.
- **Extension does nothing:** Confirm the page URL includes `shop.app/orders`, then reload the extension from `chrome://extensions/`.

## Files

- `manifest.json`: Chrome extension configuration and permissions.
- `background.js`: Runs the content script when the toolbar icon is clicked on Shop.app order pages.
- `content.js`: Extracts visible receipt data and downloads the CSV.

## Known Limitations

- This is a receipt line-item exporter, not a complete invoice generator.
- It does not currently export tax, shipping, discounts, payment method, billing address, or shipping address.
- Shop.app can change its frontend markup at any time. If exports stop finding items, the selectors in `content.js` may need to be adjusted.
- Always compare the generated CSV against the visible receipt before using it for bookkeeping.
