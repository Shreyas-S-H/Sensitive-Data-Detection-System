import React, { useState, useEffect } from 'react';
import { 
  Shield, FileText, Lock, Eye, AlertTriangle, 
  CheckCircle, Download, Upload, Zap, LogOut, User, Clock, Search,
  Activity, Info, Lightbulb, ShieldAlert, TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { 
  collection, addDoc, serverTimestamp, query, 
  where, orderBy, onSnapshot, limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const [extractedText, setExtractedText] = useState("");
  const [maskedContent, setMaskedContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  
  const [fileId, setFileId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [textDownloadUrl, setTextDownloadUrl] = useState<string | null>(null);
  const [maskedPreviewUrl, setMaskedPreviewUrl] = useState<string | null>(null);
  const [showMaskedPreview, setShowMaskedPreview] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{
    score: number;
    level: 'Low' | 'Medium' | 'High' | 'Critical';
    summary: string;
    suggestions: string[];
    riskPoints: string[];
  } | null>(null);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load history
  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, 'scans'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const scanData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setHistory(scanData);
    });

    return unsubscribe;
  }, [user]);

  const saveToHistory = async (fileName: string, type: string, detectionsCount: number) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'scans'), {
        userId: user.uid,
        fileName,
        fileType: type,
        detectionsCount,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setProcessingError(null);
      setExtractedText("");
      setDetections([]);
      setFileId(null);
      setPreviewUrl(null);
      setSelectedIndices([]);
      setDownloadUrl(null);
      setShowMaskedPreview(false);
      
      await handleDetect(file);
    }
  };

  const handleDetect = async (file: File) => {
    try {
      setIsProcessing(true);
      setIsAnalyzingAI(true);
      setProcessingError(null);
      setDownloadUrl(null);
      setMaskedPreviewUrl(null);
      setMaskedContent("");
      setAiAnalysis(null);
      
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errorMsg = "Detection failed";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            errorMsg = errData.error || errData.message || errorMsg;
          } else {
            const text = await response.text();
            console.error("Non-JSON error response:", text.substring(0, 200));
            errorMsg = `Server error (${response.status}). Please check console for details.`;
          }
        } catch (e) {
          errorMsg = `HTTP error ${response.status}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data.success) {
        setFileId(data.fileId);
        setDetections(data.detections || []);
        setExtractedText(data.extractedText || "");
        setPreviewUrl(data.preview);
        
        // Use AI analysis from server
        if (data.aiAnalysis) {
          setAiAnalysis({
            score: data.aiAnalysis.riskScore,
            level: data.aiAnalysis.riskLevel,
            summary: data.aiAnalysis.summary,
            suggestions: data.aiAnalysis.suggestions,
            riskPoints: data.aiAnalysis.riskPoints
          });
        }

        // Auto select all for convenience
        const allIndices = (data.detections || []).map((_: any, i: number) => i);
        setSelectedIndices(allIndices);

        saveToHistory(file.name, file.type, data.detections?.length || 0);
        
        // Auto-trigger masking once detection is complete
        if (allIndices.length > 0) {
          // We need a small timeout to ensure state is updated or just call the logic directly
          setTimeout(() => {
            const btn = document.getElementById('generate-mask-btn');
            if (btn) btn.click();
          }, 100);
        }
      } else {
        throw new Error(data.error || "Detection failed");
      }
    } catch (err: any) {
      console.error("Detection failed:", err);
      setProcessingError(err.message || "Failed to analyze document.");
    } finally {
      setIsProcessing(false);
      setIsAnalyzingAI(false);
    }
  };

  const handleApplyMask = async () => {
    if (!fileId) return;
    try {
      setIsProcessing(true);
      setDownloadUrl(null);

      const response = await fetch('/api/mask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          detections,
          selectedIndices
        }),
      });

      if (!response.ok) {
        let errorMsg = "Masking failed";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            errorMsg = errData.error || errData.message || errorMsg;
          } else {
            const text = await response.text();
            console.error("Non-JSON error response:", text.substring(0, 200));
            errorMsg = `Server error (${response.status}).`;
          }
        } catch (e) {
          errorMsg = `HTTP error ${response.status}`;
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      if (data.success) {
        setDownloadUrl(data.downloadUrl);
        setTextDownloadUrl(data.textDownloadUrl || null);
        if (data.fileType === 'image') {
          setMaskedPreviewUrl(data.preview);
        } else {
          setMaskedContent(data.maskedText || "");
        }
        setShowMaskedPreview(true);
      } else {
        throw new Error(data.error || "Masking failed");
      }
    } catch (err: any) {
      console.error("Masking failed:", err);
      setProcessingError(err.message || "Failed to mask document.");
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleDetectionIndex = (index: number) => {
    setSelectedIndices(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const ResponsiveOverlays: React.FC<{ 
    detections: any[], 
    selectedIndices: number[], 
    onToggle: (index: number) => void 
  }> = ({ detections, selectedIndices, onToggle }) => {
    const [imageSize, setImageSize] = useState({ width: 0, height: 0, naturalWidth: 1, naturalHeight: 1 });
    const imgRef = React.useRef<HTMLImageElement>(null);

    useEffect(() => {
      const updateSize = () => {
        if (imgRef.current) {
          setImageSize({
            width: imgRef.current.clientWidth,
            height: imgRef.current.clientHeight,
            naturalWidth: imgRef.current.naturalWidth,
            naturalHeight: imgRef.current.naturalHeight
          });
        }
      };

      const img = document.getElementById('preview-image') as HTMLImageElement;
      if (img) {
        if (img.complete) updateSize();
        else img.onload = updateSize;
      }
      
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }, [previewUrl]);

    const scaleX = imageSize.width / imageSize.naturalWidth;
    const scaleY = imageSize.height / imageSize.naturalHeight;

    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <div style={{ position: 'relative', width: imageSize.width, height: imageSize.height }} className="pointer-events-none">
          {detections.map((det, idx) => {
            if (!det.bbox) return null;
            const isSelected = selectedIndices.includes(idx);
            
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0 }}
                animate={{ opacity: isSelected ? 0.6 : 0.25 }}
                whileHover={{ opacity: 0.8 }}
                onClick={() => onToggle(idx)}
                className={`absolute cursor-pointer border pointer-events-auto transition-colors ${
                  isSelected 
                    ? 'bg-blue-500 border-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
                    : 'bg-red-500/20 border-red-500/50'
                }`}
                style={{
                  left: det.bbox.x * scaleX,
                  top: det.bbox.y * scaleY,
                  width: det.bbox.width * scaleX,
                  height: det.bbox.height * scaleY,
                }}
                title={`${det.label}: ${det.value}`}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      handleDetect(file);
    }
  };

  const selectAll = () => {
    setSelectedIndices(detections.map((_, i) => i));
  };
  
  const deselectAll = () => {
    setSelectedIndices([]);
  };

  const handleDownloadExtension = async () => {
    try {
      setIsProcessing(true);
      
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const extFolder = zip.folder("smart-privacy-guard");

      const files = ['manifest.json', 'background.js', 'content.js', 'popup.html', 'sidebar.html', 'sidebar.js', 'sidebar.css', 'README.md'];

      for (const file of files) {
        try {
          const response = await fetch(`/extension/${file}`);
          if (response.ok) {
            const content = await response.text();
            extFolder?.file(file, content);
          }
        } catch (e) {
          console.error(`Error adding ${file}:`, e);
        }
      }

        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = "smart-privacy-guard-extension.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

      } catch (error) {
        console.error("Download failed:", error);
      } finally {
        setIsProcessing(false);
      }
    };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans">
      {/* Sidebar Navigation */}
      <div className="fixed inset-y-0 left-0 w-64 bg-[#0a0f1d] border-r border-slate-800 hidden lg:flex flex-col">
        <div className="p-6 flex items-center gap-2 mb-8">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Shield className="text-white" size={20} />
          </div>
          <span className="font-bold text-lg tracking-tight text-white">Privacy Guard</span>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600/10 text-blue-400 rounded-xl font-medium transition-all">
            <Search size={20} />
            Scanner
          </button>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 rounded-xl font-medium transition-all group">
            <Clock size={20} className="group-hover:text-white transition-colors" />
            History
          </button>
          <button 
            onClick={handleDownloadExtension}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:bg-slate-800/50 rounded-xl font-medium transition-all group"
          >
            <Download size={20} className="group-hover:text-white transition-colors" />
            Extension
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-2xl mb-4">
            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center">
              <User size={20} className="text-slate-400" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-white truncate">{user?.displayName || 'User'}</p>
              <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl font-bold transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:pl-64 min-h-screen">
        <header className="p-6 flex justify-between items-center bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-40 lg:hidden">
          <div className="flex items-center gap-2">
            <Shield className="text-blue-500" size={24} />
            <span className="font-bold text-xl text-white">Privacy Guard</span>
          </div>
          <button onClick={logout} className="p-2 text-slate-400"><LogOut size={20} /></button>
        </header>

        <main className="p-6 lg:p-10 max-w-6xl mx-auto">
          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">Security Dashboard</h1>
            <p className="text-slate-400">Protect your sensitive documents with AI-powered masking.</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Scan Tool */}
              <div className="bg-slate-900 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
                <div className="bg-slate-900/80 p-4 border-b border-slate-800 flex justify-between items-center">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Document Shield v1.0</span>
                </div>

                <div className="p-8">
                  <input 
                    type="file" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect}
                    accept="image/*,text/plain,application/pdf"
                  />
                  
                  {!selectedFile ? (
                    <motion.div 
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className="border-2 border-dashed border-slate-800 text-slate-400 rounded-3xl p-16 flex flex-col items-center justify-center transition-all cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5"
                    >
                      <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mb-6 text-slate-500 group-hover:text-blue-500">
                        <Upload size={32} />
                      </div>
                      <p className="font-bold text-white text-lg">Click to scan document</p>
                      <p className="text-sm mt-2 text-slate-500 text-center max-w-xs">Supports Aadhaar, PAN, Vehicle RC, Cards, and PDF documents.</p>
                    </motion.div>
                  ) : (
                    <div className="space-y-8">
                      {/* AI Risk Score Analysis */}
                      <AnimatePresence>
                        {(aiAnalysis || isAnalyzingAI) && (
                          <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-6 bg-slate-950 rounded-3xl border border-slate-800 relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-4">
                               <div className="flex items-center gap-2 px-3 py-1 bg-blue-600/10 rounded-full border border-blue-500/20">
                                 <Zap size={12} className="text-blue-500" />
                                 <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">AI analysis</span>
                               </div>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8 items-center">
                              <div className="relative w-32 h-32 shrink-0">
                                <svg className="w-full h-full transform -rotate-90">
                                  <circle
                                    cx="64"
                                    cy="64"
                                    r="58"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="transparent"
                                    className="text-slate-800"
                                  />
                                  <motion.circle
                                    cx="64"
                                    cy="64"
                                    r="58"
                                    stroke="currentColor"
                                    strokeWidth="8"
                                    fill="transparent"
                                    strokeDasharray="364.4"
                                    initial={{ strokeDashoffset: 364.4 }}
                                    animate={{ 
                                      strokeDashoffset: 364.4 - (364.4 * (aiAnalysis?.score || 0)) / 100 
                                    }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className={`${
                                      (aiAnalysis?.score || 0) > 75 ? 'text-red-500' : 
                                      (aiAnalysis?.score || 0) > 50 ? 'text-amber-500' : 
                                      'text-emerald-500'
                                    }`}
                                  />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                  <span className="text-3xl font-black text-white">{isAnalyzingAI ? '...' : aiAnalysis?.score}</span>
                                  <span className="text-[9px] font-bold text-slate-500 uppercase">Risk Score</span>
                                </div>
                              </div>

                              <div className="flex-1 space-y-4">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <h4 className="text-xl font-bold text-white">
                                      {isAnalyzingAI ? 'Analyzing document...' : `${aiAnalysis?.level} Risk Level`}
                                    </h4>
                                    {!isAnalyzingAI && (aiAnalysis?.score || 0) > 0 && (
                                      <TrendingUp className="text-red-500" size={18} />
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-400 leading-relaxed">
                                    {isAnalyzingAI ? 'Gemini is processing detections and evaluating privacy impact...' : aiAnalysis?.summary}
                                  </p>
                                </div>

                                {!isAnalyzingAI && aiAnalysis && (
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-emerald-400">
                                        <Lightbulb size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">AI Suggestions</span>
                                      </div>
                                      <ul className="space-y-1">
                                        {aiAnalysis.suggestions.map((s, i) => (
                                          <li key={i} className="text-[11px] text-slate-500 flex gap-2">
                                            <span className="text-emerald-500/50">•</span> {s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-red-400">
                                        <ShieldAlert size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Risk Factors</span>
                                      </div>
                                      <ul className="space-y-1">
                                        {aiAnalysis.riskPoints.map((r, i) => (
                                          <li key={i} className="text-[11px] text-slate-500 flex gap-2">
                                            <span className="text-red-500/50">•</span> {r}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center">
                            <FileText className="text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{selectedFile.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                              {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.name.split('.').pop()?.toUpperCase() || 'FILE'} • {selectedFile.type || 'Document'}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => { setSelectedFile(null); setDetections([]); }}
                          className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-xs font-bold transition-all"
                        >
                          Cancel
                        </button>
                      </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Source Preview</p>
                            <div className="aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center p-0 relative group">
                              {selectedFile.type.startsWith('image/') ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  <img 
                                    src={previewUrl || URL.createObjectURL(selectedFile)} 
                                    className="max-h-full max-w-full object-contain" 
                                    alt="Original" 
                                    id="preview-image"
                                  />
                                  
                                  {/* Refined Responsive Overlays Overlay */}
                                  <ResponsiveOverlays 
                                    detections={detections} 
                                    selectedIndices={selectedIndices}
                                    onToggle={toggleDetectionIndex}
                                  />
                                </div>
                              ) : (
                                <div className="w-full h-full overflow-y-auto font-mono text-[10px] text-slate-500 whitespace-pre-wrap text-left bg-slate-900/50 p-4 rounded-xl">
                                  {extractedText || "Scanning document content..."}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest px-1">Protected Output</p>
                            <div className="aspect-square bg-slate-950 rounded-2xl overflow-hidden border border-blue-500/20 flex items-center justify-center relative shadow-[0_0_20px_-10px_rgba(59,130,246,0.2)] p-4">
                              {isProcessing ? (
                                <div className="flex flex-col items-center">
                                  <Zap className="animate-pulse text-blue-500 mb-3" />
                                  <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">Processing...</span>
                                </div>
                              ) : processingError ? (
                                <div className="flex flex-col items-center p-6 text-center">
                                  <AlertTriangle className="text-red-500 mb-2" size={32} />
                                  <span className="text-xs font-bold text-red-500 uppercase tracking-widest">{processingError}</span>
                                </div>
                              ) : maskedPreviewUrl || maskedContent ? (
                                <div className="relative w-full h-full flex flex-col items-center">
                                  {maskedPreviewUrl ? (
                                    <img 
                                      src={maskedPreviewUrl} 
                                      className="max-h-[80%] max-w-full object-contain mb-4" 
                                      alt="Masked Result" 
                                    />
                                  ) : (
                                    <div className="w-full h-[80%] overflow-y-auto font-mono text-[10px] text-blue-400 whitespace-pre-wrap text-left bg-blue-600/5 p-4 rounded-xl mb-4">
                                      {maskedContent}
                                    </div>
                                  )}
                                  <div className="flex flex-col gap-2 w-full px-4">
                                    <div className="flex gap-2 justify-center">
                                      <a 
                                        href={downloadUrl!} 
                                        className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-600/20"
                                      >
                                        <Download size={14} />
                                        {textDownloadUrl ? "Download Image" : "Download"}
                                      </a>
                                      {textDownloadUrl && (
                                        <a 
                                          href={textDownloadUrl} 
                                          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                                        >
                                          <FileText size={14} />
                                          Download Text
                                        </a>
                                      )}
                                    </div>
                                    <button 
                                      onClick={() => { setDownloadUrl(null); setTextDownloadUrl(null); setMaskedPreviewUrl(null); setShowMaskedPreview(false); setMaskedContent(""); setAiAnalysis(null); }}
                                      className="w-full px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold"
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center p-8">
                                  <Lock size={32} className="mx-auto mb-4 text-slate-800" />
                                  <p className="text-xs text-slate-600">Select regions on the left and click "Generate Mask" to redact sensitive info.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                    </div>
                  )}
                </div>
              </div>

              {/* History List */}
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Clock size={18} className="text-slate-400" />
                    Recent Activity
                  </h3>
                </div>
                <div className="divide-y divide-slate-800 max-h-[400px] overflow-y-auto">
                  {history.length > 0 ? (
                    history.map((item) => (
                      <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${item.detectionsCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-green-500/10 text-green-500'}`}>
                            {item.detectionsCount > 0 ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white mb-0.5">{item.fileName}</p>
                            <p className="text-[10px] text-slate-500">
                              {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleString() : 'Just now'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-mono text-slate-400">{item.detectionsCount} threats</p>
                          <p className={`text-[9px] uppercase font-bold ${item.detectionsCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                            {item.detectionsCount > 0 ? 'Action Required' : 'Scan Clear'}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-12 text-center text-slate-500">
                      <Clock size={40} className="mx-auto mb-4 opacity-20" />
                      <p className="text-sm italic">No recent scans to display.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar Controls */}
            <div className="space-y-8">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl sticky top-28">
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={18} className="text-blue-500" />
                    <h3 className="text-lg font-bold text-white">Sensitive Data Protector</h3>
                  </div>
                  <p className="text-xs text-slate-500">Sensitive entities identified within the document structure.</p>
                </div>

                {!selectedFile ? (
                   <div className="p-10 border border-slate-800 border-dashed rounded-2xl flex flex-col items-center justify-center text-center">
                    <Info size={24} className="text-slate-800 mb-4" />
                    <p className="text-xs text-slate-600">Upload a document to begin security profiling</p>
                   </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center mb-2">
                       <div className="flex items-center gap-2">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detections ({detections.length})</span>
                         {detections.length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[8px] font-black uppercase">Exposed</span>
                         )}
                       </div>
                       <div className="flex gap-2">
                        <button 
                          onClick={selectAll} 
                          className="text-[10px] text-blue-400 hover:underline"
                        >
                          Select All
                        </button>
                        <button 
                          onClick={deselectAll} 
                          className="text-[10px] text-slate-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {detections.map((det, idx) => {
                        const isSelected = selectedIndices.includes(idx);

                        return (
                          <button 
                            key={idx}
                            onClick={() => toggleDetectionIndex(idx)}
                            className={`w-full flex justify-between items-center p-3 rounded-xl border transition-all text-left ${
                              isSelected ? 'bg-blue-600/10 border-blue-500/50' : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 overflow-hidden">
                               <div className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-blue-500' : 'bg-slate-800'}`}></div>
                               <div className="overflow-hidden">
                                 <p className={`text-[10px] font-bold uppercase tracking-tight ${isSelected ? 'text-blue-400' : 'text-slate-500'}`}>{det.label}</p>
                                 <p className={`text-xs font-mono truncate ${isSelected ? 'text-white' : 'text-slate-400'}`}>{det.value}</p>
                               </div>
                            </div>
                            <CheckCircle size={14} className={isSelected ? 'text-blue-500' : 'text-slate-800'} />
                          </button>
                        );
                      })}
                    </div>

                    {detections.length === 0 && !isProcessing && (
                      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl flex items-center gap-3">
                        <CheckCircle className="text-green-500" size={16} />
                        <span className="text-[10px] font-bold text-green-500">No sensitive data found</span>
                      </div>
                    )}

                    <div className="pt-6 border-t border-slate-800 space-y-4">
                      <button 
                        id="generate-mask-btn"
                        onClick={handleApplyMask}
                        disabled={selectedIndices.length === 0 || isProcessing || !!downloadUrl}
                        className="w-full py-4 bg-blue-600 rounded-xl text-sm font-bold text-white hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? "Processing..." : downloadUrl ? "Masking Complete" : "Generate Masked Document"}
                      </button>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => handleDetect(selectedFile)}
                          disabled={isProcessing}
                          className="py-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-bold text-slate-500 hover:text-white transition-all shadow-sm"
                        >
                          Re-scan
                        </button>
                        <button 
                          onClick={() => { setSelectedFile(null); setFileId(null); setDetections([]); setMaskedPreviewUrl(null); setDownloadUrl(null); setTextDownloadUrl(null); setMaskedContent(""); setAiAnalysis(null); }}
                          className="py-3 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-bold text-red-500/50 hover:text-red-500 transition-all shadow-sm"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
