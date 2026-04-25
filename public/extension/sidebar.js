let currentFileData = null;
let currentFileType = null;
let currentExtractedText = null;
let currentBackendOrigin = null;
let detections = [];

console.log("[SmartPrivacy] Sidebar script loaded.");

document.addEventListener('DOMContentLoaded', () => {
    console.log("[SmartPrivacy] Sidebar DOM ready, signaling parent...");
    window.parent.postMessage({ type: 'SIDEBAR_READY' }, '*');
});

window.addEventListener('message', async (event) => {
    console.log("[SmartPrivacy] Message received by sidebar:", event.data.type);
    
    if (event.data.type === 'ANALYZE_FILE') {
        const { name, mime, data, backendOrigin } = event.data;
        console.log("[SmartPrivacy] Analysis started for:", name);
        
        document.getElementById('file-name').textContent = name;
        currentFileData = data;
        currentFileType = mime;
        currentBackendOrigin = backendOrigin;
        
        startAnalysis(data, mime);
    }
});

async function startAnalysis(data, mime) {
    showLoader();
    console.log("[SmartPrivacy] Scanning started...");

    try {
        // Mock OCR delay
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Real extracted text (simulated for demo)
        const sampleText = `Name: Rahul Sharma
Email: rahul.sharma@example.com
Phone: +91-9876543210
Address: 12, MG Road, Bengaluru, Karnataka

Login Credentials:
Username: rahul_test_user
Password: Test@1234

Bank Details:
Bank Name: State Bank of India
Account Number: 50100123456789
IFSC: SBIN0001234

Card Details:
Card Number: 4111 1111 1111 1111
Expiry: 12/28
CVV: 123

Other Info:
PAN: ABCDE1234F
Aadhaar: 1234 5678 9012

--------------------------------------

Name: Priya Verma
Email: priya.verma@example.com
Phone: +91-9123456780

Username: priya_user
Password: MyPass@2024

Card Number: 4111 2222 3333 4444
CVV: 456`;
        
        currentExtractedText = sampleText; 
        console.log("[SmartPrivacy] OCR/Text Extraction completed. Input preserved.");
        
        const patterns = [
            { type: 'aadhaar', regex: /\b\d{4}\s\d{4}\s\d{4}\b/g, label: 'Aadhaar Card' },
            { type: 'pan', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, label: 'PAN Card' },
            { type: 'phone', regex: /\b(?:\+91[- ]?)?[6-9]\d{9}\b/g, label: 'Phone Number' },
            { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: 'Email' },
            { type: 'bank', regex: /\b\d{9,18}\b/g, label: 'Bank Account' },
            { type: 'ifsc', regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g, label: 'IFSC Code' },
            { type: 'card', regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/g, label: 'Credit/Debit Card' },
            { type: 'cvv', regex: /(?:CVV|cvv)\s*[:=]?\s*(\d{3})\b/gi, label: 'CVV' },
            { type: 'password', regex: /(?:password|pwd|pass)\s*[:=]\s*(\S+)/gi, label: 'Password' }
        ];

        detections = [];

        patterns.forEach(p => {
            let matches;
            while ((matches = p.regex.exec(sampleText)) !== null) {
                const fullMatch = matches[0];
                const value = matches[1] || fullMatch;
                const index = matches.index + (matches[1] ? fullMatch.indexOf(matches[1]) : 0);

                detections.push({
                    id: `${p.type}-${index}`,
                    type: p.type,
                    label: p.label,
                    value: value.trim(),
                    index: index,
                    length: value.trim().length,
                    masked: true,
                    confidence: 0.95
                });
            }
        });

        detections.sort((a, b) => a.index - b.index);

        console.log("[SmartPrivacy] Detection results:", detections.length, "items found.");

        renderResults();
        renderPreview(data);
    } catch (error) {
        console.error("[SmartPrivacy] Analysis failed:", error);
        alert("Scanning failed. Check console for details.");
    } finally {
        hideLoader();
    }
}

function renderResults() {
    const list = document.getElementById('findings-list');
    list.innerHTML = '';
    
    if (detections.length === 0) {
        list.innerHTML = '<p style="font-size: 13px; color: #64748b; padding: 10px;">No sensitive data detected.</p>';
    }

    const uniqueTypes = Array.from(new Set(detections.map(d => d.type)));

    uniqueTypes.forEach(type => {
        const matchesForType = detections.filter(d => d.type === type);
        const label = matchesForType[0].label;
        const allMasked = matchesForType.every(d => d.masked);

        const item = document.createElement('div');
        item.className = 'finding-item';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'flex-start';
        item.style.gap = '8px';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
                <div class="finding-label" style="font-size: 11px; font-weight: 800;">${label.toUpperCase()} (${matchesForType.length})</div>
                <input type="checkbox" ${allMasked ? 'checked' : ''} data-type="${type}">
            </div>
            <div style="padding-left: 24px; display: flex; flex-direction: column; gap: 4px;">
                ${matchesForType.slice(0, 3).map((det, idx) => `
                    <div style="font-family: monospace; font-size: 10px; color: #94a3b8;">
                        ${idx === 2 && matchesForType.length > 3 ? "...and more" : (det.masked ? det.value.replace(/.(?=.{4})/g, "*") : det.value)}
                    </div>
                `).join('')}
            </div>
        `;
        
        item.querySelector('input').addEventListener('change', (e) => {
            const checked = e.target.checked;
            detections.filter(d => d.type === type).forEach(d => d.masked = checked);
            console.log("[SmartPrivacy] Mask state changed for type", type);
            renderResults();
            updateMask();
        });
        
        list.appendChild(item);
    });
    
    document.getElementById('results').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
}

function renderPreview(data) {
    const canvas = document.getElementById('mask-canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        const maxWidth = 400;
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        updateMask();
    };
    img.src = data;
}

function updateMask() {
    const canvas = document.getElementById('mask-canvas');
    const ctx = canvas.getContext('2d');
    
    const img = new Image();
    img.onload = () => {
        const maxWidth = 400;
        const scale = maxWidth / img.width;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
        
        detections.forEach((det, index) => {
            if (det.masked) {
                console.log("[SmartPrivacy] Applying mask to preview for", det.type);
                ctx.fillStyle = 'rgba(0,0,0,0.9)';
                // Simulate coordinate placement based on index for demo
                ctx.fillRect(40, 60 + (index * 80), 320, 60);
                
                ctx.fillStyle = 'white';
                ctx.font = 'bold 14px Arial';
                ctx.fillText('PROTECTED: ' + det.type.toUpperCase(), 60, 95 + (index * 80));
            }
        });
    };
    img.src = currentFileData;
}

document.getElementById('mask-all-btn').onclick = () => {
    console.log("[SmartPrivacy] Mask All clicked.");
    detections.forEach(d => d.masked = true);
    renderResults();
    updateMask();
};

document.getElementById('close-btn').onclick = () => {
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
};

document.getElementById('upload-masked').onclick = async () => {
    console.log("[SmartPrivacy] Upload Masked requested.");
    
    try {
        const payload = {
            text: currentExtractedText || "No text extracted",
            detections: detections,
            selectedTypes: detections.filter(d => d.masked).map(d => d.type.toLowerCase())
        };
        
        console.log("[SmartPrivacy] Masking Payload:", payload);

        const apiBase = currentBackendOrigin || ('https://' + window.location.host);
        
        const response = await fetch(apiBase + '/api/mask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("[SmartPrivacy] Masking Result:", data);

        if (data.success) {
            alert('Document successfully masked and uploaded!\n\nMasked items: ' + data.maskedItems.join(', '));
        } else {
            throw new Error(data.error || "Masking failed on server");
        }
    } catch (err) {
        console.error("[SmartPrivacy] Masking/Upload failed:", err);
        alert('Masking failed: ' + err.message);
    }
    
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
};

document.getElementById('upload-original').onclick = () => {
    console.log("[SmartPrivacy] Upload Original requested.");
    alert('Proceeding with original file upload.');
    window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
};

document.getElementById('download-masked').onclick = async () => {
    console.log("[SmartPrivacy] Download Masked requested.");
    
    // Download image from canvas
    const canvas = document.getElementById('mask-canvas');
    const link = document.createElement('a');
    link.download = 'protected_' + document.getElementById('file-name').textContent;
    link.href = canvas.toDataURL();
    link.click();
};

function showLoader() {
    document.getElementById('loader').classList.remove('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
}

function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}
