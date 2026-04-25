/**
 * Background Service Worker
 * Manages storage and extension-wide state.
 */

chrome.runtime.onInstalled.addListener(() => {
  console.log("Sensitive Data Guard installed.");
  // Initialize storage
  chrome.storage.local.set({
    isEnabled: true,
    scanHistory: [],
    settings: {
      alertOnSubmit: true,
      maskOnDetection: false
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "logDetection") {
    saveToHistory(request.data);
    
    // Optional: Show notification for serious threats
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
  }
  
  if (request.action === "getSettings") {
    chrome.storage.local.get(['isEnabled', 'settings'], (data) => {
      sendResponse(data);
    });
    return true; // Keep channel open for async response
  }
});

function saveToHistory(detection) {
  chrome.storage.local.get(['scanHistory'], (result) => {
    const history = result.scanHistory || [];
    const newEntry = {
      ...detection,
      timestamp: new Date().toISOString(),
      url: detection.url
    };
    
    // Keep only last 50 entries
    const updatedHistory = [newEntry, ...history].slice(0, 50);
    chrome.storage.local.set({ scanHistory: updatedHistory });
  });
}
