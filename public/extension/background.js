chrome.runtime.onInstalled.addListener(() => {
  console.log("Smart Privacy Guard Extension Installed");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan") {
    // Logic for scanning from popup
    sendResponse({ status: "scanning" });
  }
});
