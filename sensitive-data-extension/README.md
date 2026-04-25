# Sensitive Data Guard - Chrome Extension

This extension protects users from accidentally sharing sensitive information (Aadhaar, PAN, Driving License) on any website.

## Features
- **Real-time Detection:** Scans input fields as you type.
- **File Shielding:** Automatically scans uploaded images/PDFs using OCR.
- **Form Interception:** Warns you before submitting a form containing sensitive data.
- **Privacy First:** All detection and OCR processing happens locally in your browser.

## Project Structure
```
/sensitive-data-extension
├── manifest.json      # Extension configuration (MV3)
├── background.js      # Background service worker
├── content.js         # Core logic injected into pages
├── styles.css         # UI for warnings and dashboard
├── popup.html/js      # Extension dashboard
├── utils/
│   └── detection.js   # Regex-based scanner module
└── ocr/
    └── tesseract.min.js # (Instructions below)
```

## Setup Instructions

### 1. Finalize OCR Dependencies
To enable image scanning, you need to download `tesseract.min.js` and place it in the `ocr/` folder:
- Download from: [Tesseract.js GitHub](https://github.com/naptha/tesseract.js)
- Place `tesseract.min.js` in `/sensitive-data-extension/ocr/`

### 2. Load the Extension in Chrome
1. Open Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked**.
4. Select the `sensitive-data-extension` folder.

### 3. Testing
1. Visit any website with a form (e.g., [Google Sheets](https://sheets.google.com) or a dummy login page).
2. Type a sample Aadhaar format (e.g., `1234 5678 9012`).
3. You should see a red outline and a warning box appear.
4. Try to submit the form; a confirmation dialog will appear.

## Privacy Note
This extension does not send any data to external servers. All regex matches and OCR scans are computed on your local machine.
