/**
 * Extension Popup Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    const shieldToggle = document.getElementById('shield-toggle');
    const historyContainer = document.getElementById('history-container');

    // Load initial state
    chrome.storage.local.get(['isEnabled', 'scanHistory'], (data) => {
        shieldToggle.checked = data.isEnabled !== false;
        renderHistory(data.scanHistory || []);
    });

    // Handle toggle change
    shieldToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        chrome.storage.local.set({ isEnabled });
        
        // Notify background of change
        chrome.runtime.sendMessage({ action: "settingsChanged", isEnabled });
    });

    function renderHistory(history) {
        if (history.length === 0) return;

        historyContainer.innerHTML = history.map(item => `
            <div class="history-item">
                <span class="type">${item.type} Blocked</span>
                <span class="url">${new URL(item.url || 'http://').hostname}</span>
                <span class="time">${formatDate(item.timestamp)}</span>
            </div>
        `).join('');
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
});
