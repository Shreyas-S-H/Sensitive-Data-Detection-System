/**
 * Sensitive Data Detection Engine
 * Uses Regex to identify Indian ID formats and other sensitive info.
 */

const DETECTION_PATTERNS = {
  aadhaar: {
    name: "Aadhaar Number",
    label: "Aadhaar Card",
    regex: /\b\d{4}[ \-]?\d{4}[ \-]?\d{4}\b|\b\d{12}\b/g,
    validator: (str) => {
      const digits = str.replace(/[ \-]/g, '');
      return digits.length === 12;
    }
  },
  pan: {
    name: "PAN Card",
    label: "PAN Card",
    regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
    validator: (str) => {
      return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(str);
    }
  },
  phone: {
    name: "Phone Number",
    label: "Phone Number",
    regex: /\b(?:\+91[ \-]?)?[6-9]\d{9}\b/g,
    validator: (str) => true
  },
  email: {
    name: "Email Address",
    label: "Email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}\b/g,
    validator: () => true
  }
};

/**
 * Scans text for sensitive data matches
 * @param {string} text 
 * @returns {Array} List of detected matches
 */
function scanText(text) {
  const matches = [];
  // Basic OCR character correction
  const cleanedText = text
    .replace(/O/g, "0")
    .replace(/I/g, "1");
  
  for (const [key, pattern] of Object.entries(DETECTION_PATTERNS)) {
    const targetText = key === 'aadhaar' ? cleanedText : text;
    pattern.regex.lastIndex = 0;
    
    let finding;
    while ((finding = pattern.regex.exec(targetText)) !== null) {
      const val = finding[0];
      const index = finding.index;
      let confidence = 0.7;

      if (pattern.validator(val)) {
        // Aadhaar accuracy refinement
        if (key === 'aadhaar') {
          const contextRange = text.substring(Math.max(0, index - 150), Math.min(text.length, index + 150));
          const hasContext = /aadhaar|uidai|dob|gender|male|female|yob|enrollment|identity|india|uid|identity card|government id/gi.test(contextRange);
          const isFormatted = val.includes(' ') || val.includes('-');
          
          if (hasContext) confidence += 0.2;
          if (isFormatted) confidence += 0.1;

          if (!hasContext && !isFormatted) continue;
        }

        if (key === 'pan') {
          confidence = 0.95;
        }

        matches.push({
          type: pattern.label || pattern.name,
          value: val,
          confidence: Math.min(confidence, 1.0),
          key: key,
          index: index
        });
      }
    }
  }
  
  return matches;
}

// Export for different environments
if (typeof module !== 'undefined') {
  module.exports = { scanText, DETECTION_PATTERNS };
} else {
  window.DetectionUtils = { scanText, DETECTION_PATTERNS };
}
