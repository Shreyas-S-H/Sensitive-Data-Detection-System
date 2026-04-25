import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import cors from "cors";
import Tesseract from "tesseract.js";
import { Jimp } from "jimp";
import fs from "fs";
import { createRequire } from "module";
import { GoogleGenAI } from "@google/genai";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Gemini
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  // Configure multer for file uploads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
  });
  
  const upload = multer({ storage });

  // API routes
  app.use(cors());
  app.use(express.json());

  // Prevent HTML responses for any /api routes and log requests
  app.use("/api", (req, res, next) => {
    console.log(`[Backend] API Request: ${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Type Normalization and Refined Detection Patterns
  function normalizeType(type: string) {
    return type.toLowerCase().replace(" card", "").trim();
  }

  function cleanOCR(text: string) {
    return text
      .replace(/O/g, "0")
      .replace(/I/g, "1")
      .replace(/[^0-9A-Za-z\s]/g, " ");
  }

  const SENSITIVE_PATTERNS = [
    { type: 'aadhaar', label: 'Aadhaar Card', regex: /\b\d{4}[ \-]?\d{4}[ \-]?\d{4}\b|\b\d{12}\b/g },
    { type: 'pan', label: 'PAN Card', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
    { type: 'dl', label: 'Driving License', regex: /\b[A-Z]{2}[0-9]{2}[ ]?[0-9]{4,11}\b/g },
    { type: 'vehicle', label: 'Vehicle Number', regex: /\b[A-Z]{2}[ -]?[0-9]{1,2}[ -]?[A-Z]{1,2}[ -]?[0-9]{1,4}\b/g },
    { type: 'chassis', label: 'Chassis Number', regex: /\b[A-Z0-9]{17}\b/g },
    { type: 'engine', label: 'Engine Number', regex: /\b[A-Z0-9]{10,12}\b/g },
    { type: 'phone', label: 'Phone Number', regex: /\b(?:\+91[ \-]?)?[6-9]\d{9}\b/g },
    { type: 'email', label: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,10}\b/g },
    { type: 'bank', label: 'Bank Account', regex: /\b\d{9,18}\b/g },
    { type: 'ifsc', label: 'IFSC Code', regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
    { type: 'card', label: 'Card Number', regex: /\b(?:\d{4}[ \-]?){3}\d{4}\b/g },
    { type: 'cvv', label: 'CVV', regex: /(?:CVV|CVC)\s*(?::|-)?\s*(\d{3,4})/gi },
    { type: 'password', label: 'Password', regex: /password\s*(?::|-|=)?\s*([^\s,]{4,})/gi }
  ];

  function detectSensitiveData(text: string) {
    console.log("[Backend] OCR/Raw TEXT:", text);
    const cleanedText = cleanOCR(text);
    
    const results: any[] = [];
    SENSITIVE_PATTERNS.forEach(p => {
      let match;
      const targetText = p.type === 'aadhaar' ? cleanedText : text;
      p.regex.lastIndex = 0;
      while ((match = p.regex.exec(targetText)) !== null) {
        const fullMatch = match[0];
        const secretValue = match[1] || fullMatch;
        const secretIndex = match.index + (fullMatch.indexOf(secretValue));
        let confidence = 0.7; // Base confidence

        // Specific validation for PAN
        if (p.type === 'pan') {
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(secretValue)) continue;
          confidence = 0.95;
        }

        // Aadhaar specific context check
        if (p.type === 'aadhaar') {
          const contextRange = text.substring(Math.max(0, secretIndex - 150), Math.min(text.length, secretIndex + 150));
          const hasContext = /aadhaar|uidai|dob|gender|male|female|yob|enrollment|identity|india|uid|identity card|government id/gi.test(contextRange);
          const isFormatted = fullMatch.includes(' ') || fullMatch.includes('-');
          
          if (hasContext) confidence += 0.2;
          if (isFormatted) confidence += 0.1;

          if (!hasContext && !isFormatted) {
            console.log(`[Backend] Skipping ambiguous Aadhaar-like number: ${secretValue}`);
            continue;
          }
          console.log(`[Backend] Aadhaar Match: ${secretValue}, Context: ${hasContext}, Formatted: ${isFormatted}`);
        }

        // Generic context boost
        if (['phone', 'email', 'bank', 'ifsc'].includes(p.type)) {
          const smallContext = text.substring(Math.max(0, secretIndex - 40), Math.min(text.length, secretIndex + 40));
          if (new RegExp(p.type, 'i').test(smallContext)) confidence += 0.15;
        }

        results.push({
          type: normalizeType(p.type),
          label: p.label,
          value: secretValue,
          index: secretIndex,
          length: secretValue.length,
          confidence: Math.min(confidence, 1.0)
        });
      }
    });

    results.sort((a, b) => a.index - b.index || b.length - a.length);
    const uniqueResults = [];
    let lastEnd = -1;
    for (const r of results) {
      if (r.index >= lastEnd) {
        uniqueResults.push(r);
        lastEnd = r.index + r.length;
      }
    }
    return uniqueResults;
  }

  function maskText(originalText: string, detections: any[], selectedTypes: string[]) {
    // Sort detections by index descending to replace from end to start
    // This prevents offset shifts from breaking subsequent replacements
    const sorted = [...detections].sort((a, b) => b.index - a.index);
    const normalizedSelected = selectedTypes.map(normalizeType);
    let maskedText = originalText;

    console.log(`[Backend] Masking with types: ${JSON.stringify(normalizedSelected)}`);
    console.log(`[Backend] Total detections: ${sorted.length}`);

    sorted.forEach(item => {
      const type = normalizeType(item.type);

      if (normalizedSelected.includes(type)) {
        const value = item.value;
        if (!value) return;

        let masked = "";
        if (type === 'phone' || type === 'ph') {
          const digits = value.replace(/\D/g, '');
          if (digits.length >= 10) {
            masked = `XXX-XXX-${digits.slice(-4)}`;
          } else {
            masked = value.replace(/.(?=.{4})/g, "*");
          }
        } else if (type === 'email') {
          const [user, domain] = value.split('@');
          if (user && user.length > 1) {
            masked = `${user[0]}***@${domain}`;
          } else {
            masked = `***@${domain}`;
          }
        } else {
          // Standard masking: keep last 4
          masked = value.replace(/.(?=.{4})/g, "*");
        }
        
        // POSITIONAL REPLACEMENT (Robust for OCR)
        // We use the index and length provided by the detection result
        if (maskedText.substring(item.index, item.index + item.length) === item.value) {
          maskedText = maskedText.slice(0, item.index) + masked + maskedText.slice(item.index + item.length);
        } else {
          // Fallback to global replace if index is slightly off, but preferred is positional
          console.log(`[Backend] Index mismatch for ${item.value}, using global fallback`);
          maskedText = maskedText.split(item.value).join(masked);
        }
      }
    });

    return maskedText;
  }

  // Endpoints:
  // POST /api/detect - Handles upload and returns text + detections (with bboxes)
  app.post("/api/detect", (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        console.error("[Backend] Multer upload error:", err);
        return res.status(400).json({ error: "File upload failed", details: err.message });
      }
      next();
    });
  }, async (req, res) => {
    try {
      if (!req.file) {
        console.error("[Backend] Detect called without file");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const filePath = req.file.path;
      const fileName = req.file.originalname;
      const fileType = req.file.mimetype;

      let extractedText = "";
      let words: any[] = [];
      let previewBase64 = "";

      if (fileType.startsWith('image/')) {
        const ocrData: any = await Tesseract.recognize(filePath, 'eng');
        extractedText = ocrData.data.text || "";
        
        let cursor = 0;
        words = (ocrData.data.words || []).map((w: any) => {
          // Find the word's position in the full text
          const index = extractedText.indexOf(w.text, cursor);
          if (index !== -1) cursor = index + w.text.length;
          
          return {
            text: w.text,
            index: index,
            bbox: {
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1
            }
          };
        });
        
        const image = await Jimp.read(filePath);
        const buffer = await image.getBuffer('image/png' as any);
        previewBase64 = `data:image/png;base64,${buffer.toString('base64')}`;

      } else if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
        const dataBuffer = fs.readFileSync(filePath);
        const parseFunc = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
        const pdfData = await parseFunc(dataBuffer);
        extractedText = pdfData.text || "";
        words = []; 
      } else {
        extractedText = fs.readFileSync(filePath, 'utf-8');
      }

      const detections = detectSensitiveData(extractedText);
      
      // Associate word bboxes with detections using character indices
      const enrichedDetections = detections.map(det => {
        const valWords = words.filter(w => 
          w.index !== -1 && 
          w.index >= det.index && 
          (w.index + w.text.length) <= (det.index + det.length)
        );

        let bbox = null;
        if (valWords.length > 0) {
          bbox = {
            x: Math.min(...valWords.map(w => w.bbox.x0)),
            y: Math.min(...valWords.map(w => w.bbox.y0)),
            width: Math.max(...valWords.map(w => w.bbox.x1)) - Math.min(...valWords.map(w => w.bbox.x0)),
            height: Math.max(...valWords.map(w => w.bbox.y1)) - Math.min(...valWords.map(w => w.bbox.y0))
          };
        }
        return { ...det, bbox };
      });

      // AI Analysis
      let aiAnalysis = null;
      if (process.env.GEMINI_API_KEY && enrichedDetections.length > 0) {
        try {
          const detectionsSummary = enrichedDetections.map(d => `${d.label}: ${d.value}`).join(', ');
          
          const prompt = `Analyze the potential privacy risks for a document containing the following sensitive information:
          ${detectionsSummary}
          
          Context from document:
          ${extractedText.substring(0, 1000)}
          
          Provide a structured analysis in JSON format including:
          1. riskScore (number 0-100)
          2. riskLevel (string: Low, Medium, High, or Critical)
          3. summary (string: brief overview)
          4. suggestions (array of strings: 3 practical steps to take)
          5. riskPoints (array of strings: why exactly it is risky)
          
          Return ONLY the JSON.`;

          const response = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          });

          const text = response.text || "{}";
          // Extract JSON if model returned markdown
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            aiAnalysis = JSON.parse(jsonMatch[0]);
          }
        } catch (aiErr) {
          console.error("[Backend] AI Analysis error:", aiErr);
        }
      }

      // Fallback heuristic analysis if AI failed or no detections
      if (!aiAnalysis && enrichedDetections.length > 0) {
        const score = Math.min(enrichedDetections.length * 20, 100);
        aiAnalysis = {
          riskScore: score,
          riskLevel: score > 80 ? 'Critical' : score > 50 ? 'High' : score > 20 ? 'Medium' : 'Low',
          summary: "Risk analysis performed using local heuristic evaluation.",
          suggestions: ["Manually review all detected points", "Ensure you only share what is necessary", "Mask highly sensitive IDs before sharing"],
          riskPoints: ["Multiple sensitive data points were identified in the scanning process."]
        };
      } else if (!aiAnalysis) {
        aiAnalysis = {
          riskScore: 0,
          riskLevel: 'Low',
          summary: "No sensitive data detected in this document.",
          suggestions: ["This document appears safe for sharing."],
          riskPoints: []
        };
      }

      res.json({
        success: true,
        fileId: path.basename(filePath),
        originalFileName: fileName,
        fileType,
        extractedText,
        detections: enrichedDetections,
        aiAnalysis,
        preview: previewBase64
      });

    } catch (err: any) {
      console.error("[Backend] Detect error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/mask - Applies masking to the physical file regions
  app.post("/api/mask", async (req, res) => {
    try {
      const { fileId, detections, selectedIndices } = req.body;
      const filePath = path.join(uploadsDir, fileId);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found or expired" });
      }

      const fileExt = path.extname(filePath).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.bmp'].includes(fileExt);
      
      if (isImage) {
        try {
          const image = await Jimp.read(filePath);
          const toMask = detections.filter((_: any, i: number) => selectedIndices.includes(i));

          for (const det of toMask) {
            if (det.bbox) {
              // Mask with a solid black rectangle
              const mask = new (Jimp as any)({
                width: Math.floor(det.bbox.width),
                height: Math.floor(det.bbox.height),
                color: 0x000000FF
              });
              image.composite(mask, Math.floor(det.bbox.x), Math.floor(det.bbox.y));
            }
          }

          const maskedFileName = `masked_${fileId}${fileExt}`;
          const maskedPath = path.join(uploadsDir, maskedFileName);
          await (image as any).write(maskedPath);

          const maskedBuffer = await image.getBuffer('image/png' as any);
          const maskedPreview = `data:image/png;base64,${maskedBuffer.toString('base64')}`;

          // Also generate masked text for the image
          const ocrData: any = await Tesseract.recognize(filePath, 'eng');
          const textToMask = ocrData.data.text || "";
          const types = Array.from(new Set(toMask.map((d: any) => normalizeType(d.type)))) as string[];
          const maskedTextResult = maskText(textToMask, toMask, types);
          
          const maskedTextFileName = `masked_${fileId}.txt`;
          const maskedTextPath = path.join(uploadsDir, maskedTextFileName);
          fs.writeFileSync(maskedTextPath, maskedTextResult);

          res.json({
            success: true,
            downloadUrl: `/api/download/${maskedFileName}`,
            textDownloadUrl: `/api/download/${maskedTextFileName}`,
            preview: maskedPreview,
            maskedText: maskedTextResult,
            fileType: 'image',
            message: "Image masked and text extracted successfully"
          });
        } catch (err) {
          console.error("Image processing error, falling back:", err);
        }
      }

    if (!res.headersSent) {
      // Fallback for PDF/Text: Mask the text and return as .txt
      let textToMask = "";
      if (fileExt === '.pdf') {
          const dataBuffer = fs.readFileSync(filePath);
          const parseFunc = typeof pdfParse === 'function' ? pdfParse : pdfParse.default;
          const pdfData = await parseFunc(dataBuffer);
          textToMask = pdfData.text || "";
        } else {
          textToMask = fs.readFileSync(filePath, 'utf-8');
        }

        const toMask = detections.filter((_: any, i: number) => selectedIndices.includes(i));
        const types = Array.from(new Set(toMask.map((d: any) => normalizeType(d.type)))) as string[];
        const maskedTextResult = maskText(textToMask, toMask, types);

        const maskedFileName = `masked_${fileId}.txt`;
        const maskedPath = path.join(uploadsDir, maskedFileName);
        fs.writeFileSync(maskedPath, maskedTextResult);

        res.json({
          success: true,
          downloadUrl: `/api/download/${maskedFileName}`,
          maskedText: maskedTextResult,
          fileType: 'text',
          message: "Document masked and converted to text successfully"
        });
      }

    } catch (err: any) {
      console.error("[Backend] Mask error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/download/:filename
  app.get("/api/download/:filename", (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(uploadsDir, fileName);
    
    if (fs.existsSync(filePath)) {
      res.download(filePath);
    } else {
      res.status(404).json({ error: "File not found" });
    }
  });


  // API 404 handler (placed before Vite middleware)
  app.use("/api", (req, res) => {
    console.warn(`[Backend] API 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: "Not Found", 
      message: `API route not found: ${req.method} ${req.originalUrl}` 
    });
  });

  // Global error handler (should be before Vite middleware)
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("[Backend] Global Error:", err);
    if (!req.url.startsWith('/api')) {
      return next(err);
    }
    if (res.headersSent) {
      return next(err);
    }
    res.status(err.status || 500).json({ 
      error: "Internal Server Error", 
      message: err.message || "An unexpected error occurred",
      path: req.url
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
