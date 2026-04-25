/**
 * Content Script - The Heart of Sensitive Data Guard
 */

// Import detection logic if available, otherwise define basic patterns
// (In production, you'd bundle these)
// Default patterns (fallback)
const DETECTION_PATTERNS = {
  aadhaar: /\b\d{4}[ \-]?\d{4}[ \-]?\d{4}\b|\b\d{12}\b/,
  pan: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/,
  phone: /\b(?:\+91[ \-]?)?[6-9]\d{9}\b/,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}\b/
};

/**
 * Mask sensitive data based on type
 */
function maskValue(value, type) {
  if (type === 'PHONE') {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 10) {
      return `XXX-XXX-${digits.slice(-4)}`;
    }
  } else if (type === 'EMAIL') {
    const [user, domain] = value.split('@');
    if (user && user.length > 1) {
      return `${user[0]}***@${domain}`;
    }
    return `***@${domain}`;
  }
  return value.replace(/.(?=.{4})/g, "*");
}

let extensionEnabled = true;

// Initialize
chrome.storage.local.get(['isEnabled'], (data) => {
  extensionEnabled = data.isEnabled !== false;
  if (extensionEnabled) {
    init();
  }
});

function init() {
  console.log("Sensitive Data Guard: Active");
  
  // 1. Observe text inputs
  document.addEventListener('input', debounce(handleInput, 500));
  
  // 2. Observe file uploads
  document.addEventListener('change', handleFileSelection);
  
  // 3. Intercept form submissions
  window.addEventListener('submit', handleFormSubmit, true);
}

/**
 * Handle user typing in inputs/textareas
 */
function handleInput(e) {
  if (!extensionEnabled) return;
  const target = e.target;
  if (!(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  const text = target.value;
  const results = scanText(text);

  if (results.length > 0) {
    highlightField(target, true);
    showWarning(target, results);
    logDetection(results[0]);
  } else {
    highlightField(target, false);
    removeWarning(target);
  }
}

/**
 * Handle file upload selections (OCR)
 */
async function handleFileSelection(e) {
  if (!extensionEnabled) return;
  const target = e.target;
  if (target.type !== 'file') return;

  const files = target.files;
  if (!files || files.length === 0) return;

  for (const file of files) {
    if (file.type.startsWith('image/')) {
      console.log("Analyzing image via OCR:", file.name);
      processImageForSensitiveData(file, target);
    }
  }
}

/**
 * Basic Regex Scanner (Fallback if utility not loaded)
 */
function scanText(text) {
  const matches = [];
  // Basic OCR character correction logic
  const cleanedText = text.replace(/O/g, "0").replace(/I/g, "1");
  
  for (const [key, regex] of Object.entries(DETECTION_PATTERNS)) {
    const target = key === 'aadhaar' ? cleanedText : text;
    const match = target.match(regex);
    if (match) {
      const val = match[0];
      const index = target.indexOf(val);

      // Aadhaar context check
      if (key === 'aadhaar') {
        const isFormatted = val.includes(' ') || val.includes('-');
        const contextRange = text.substring(Math.max(0, index - 150), Math.min(text.length, index + 150));
        const hasContext = /aadhaar|uidai|dob|gender|male|female|yob|enrollment|identity|india|uid|identity card|government id/gi.test(contextRange);
        if (!hasContext && !isFormatted) continue;
      }
      
      // PAN validation
      if (key === 'pan') {
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(val)) continue;
      }

      matches.push({ type: key.toUpperCase(), value: val });
    }
  }
  return matches;
}

/**
 * OCR Processing using Tesseract.js
 */
async function processImageForSensitiveData(file, inputElement) {
  // In a real extension, Tesseract.js would be local
  // For this demo, we assume the library is injected or we show a placeholder
  if (typeof Tesseract === 'undefined') {
    console.warn("Tesseract library not loaded. Image scanning skipped.");
    return;
  }

  try {
    const { data: { text } } = await Tesseract.recognize(file, 'eng');
    const results = scanText(text);
    if (results.length > 0) {
      showWarning(inputElement, results, true);
      logDetection(results[0]);
    }
  } catch (err) {
    console.error("OCR Error:", err);
  }
}

/**
 * Injected UI: Warning Box (Updated for Bold Typography theme)
 */
function showWarning(element, results, isFile = false) {
  let warningId = 'sdg-warning-' + element.id;
  let existing = document.getElementById(warningId);
  if (existing) existing.remove();

  const warning = document.createElement('div');
  warning.id = warningId;
  warning.className = 'sdg-injected-warning';
  
  const typeNames = results.map(r => r.type).join(', ');
  
  warning.innerHTML = `
    <div class="sdg-warning-content">
      <div class="sdg-icon-bold">!</div>
      <div class="sdg-text-bold">
        CRITICAL ALERT: SENSITIVE DATA PATTERN (${typeNames}) DETECTED ${isFile ? 'IN FILE UPLOAD' : 'IN INPUT FIELD'}.
      </div>
    </div>
    <button class="sdg-close-btn-bold">DISMISS</button>
  `;

  // Position logic (place above or near the element)
  const rect = element.getBoundingClientRect();
  warning.style.top = (window.scrollY + rect.top - 70) + 'px';
  warning.style.left = (window.scrollX + rect.left) + 'px';

  document.body.appendChild(warning);

  warning.querySelector('.sdg-close-btn-bold').onclick = (e) => {
    e.preventDefault();
    warning.remove();
  };
}

function removeWarning(element) {
  const warning = document.getElementById('sdg-warning-' + element.id);
  if (warning) warning.remove();
}

function highlightField(element, isRisky) {
  if (isRisky) {
    element.style.outline = '2px solid #FF3B30';
    element.style.boxShadow = '0 0 8px rgba(255, 59, 48, 0.4)';
  } else {
    element.style.outline = '';
    element.style.boxShadow = '';
  }
}

/**
 * Prevent form submission if data detected
 */
function handleFormSubmit(e) {
  if (!extensionEnabled) return;
  
  const forms = document.querySelectorAll('form');
  // Check if any risky field exists in the form
  const riskyFields = e.target.querySelectorAll('input, textarea');
  let hasSensitiveData = false;

  riskyFields.forEach(field => {
    if (scanText(field.value).length > 0) {
      hasSensitiveData = true;
    }
  });

  if (hasSensitiveData) {
    const confirmSubmit = confirm("⚠️ SENSITIVE DATA ALERT: This form contains sensitive information (Aadhaar/PAN). Are you sure you want to proceed?");
    if (!confirmSubmit) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }
}

function logDetection(result) {
  chrome.runtime.sendMessage({
    action: "logDetection",
    data: {
      type: result.type,
      url: window.location.href,
      pageTitle: document.title
    }
  });
}

// Utils
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
