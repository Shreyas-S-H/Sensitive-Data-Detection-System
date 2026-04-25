import React, { useState } from 'react';
import { Shield, Zap, Lock, Download, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';

const Landing: React.FC = () => {
  const [downloading, setDownloading] = useState(false);
  const [showDownloadAlert, setShowDownloadAlert] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      setShowDownloadAlert(true);
      
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

      setTimeout(() => {
        setShowDownloadAlert(false);
        setDownloading(false);
      }, 5000);
    } catch (error) {
      console.error("Download failed:", error);
      setDownloading(false);
    }
  };

  const features = [
    { icon: <Zap className="text-blue-400" />, title: "Real-time Interception", desc: "Detects file uploads on any website before they reach the server." },
    { icon: <Shield className="text-green-400" />, title: "AI Detection Engine", desc: "Identifies Aadhaar, PAN, DL, and Phone numbers using high-precision AI." },
    { icon: <Lock className="text-purple-400" />, title: "Intelligent Masking", desc: "Automatically applies selective redaction to keep your identity safe." },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans">
      <nav className="border-b border-slate-800 p-6 flex justify-between items-center bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="bg-blue-500 p-2 rounded-lg shadow-lg shadow-blue-500/20">
            <Shield className="text-white" size={24} />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">Smart Privacy Guard</span>
        </div>
        <div className="flex gap-4">
          <Link to="/login" className="px-4 py-2 text-sm font-medium hover:text-blue-400 transition-colors">Log In</Link>
          <Link to="/register" className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition-all">Get Started</Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-24">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-6xl font-extrabold text-white mb-8 tracking-tight leading-tight"
          >
            Your Private Data, <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">Under Your Control.</span>
          </motion.h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed mb-12">
            Securely mask sensitive documents locally before they are uploaded. 
            Powered by next-gen privacy AI for the modern web.
          </p>
          <div className="flex justify-center gap-6">
            <Link to="/register" className="px-8 py-4 bg-blue-600 rounded-xl font-bold text-white shadow-xl shadow-blue-600/20 hover:scale-105 transition-all flex items-center gap-2">
                Start Scanning <ArrowRight size={20} />
            </Link>
            <button onClick={handleDownload} className="px-8 py-4 bg-slate-800 rounded-xl font-bold text-white border border-slate-700 hover:bg-slate-700 transition-all">
                Download Extension
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-32">
          {features.map((f, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="p-8 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-all group"
            >
              <div className="mb-6 p-3 bg-slate-900 rounded-xl w-fit group-hover:scale-110 transition-transform">{f.icon}</div>
              <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="border-t border-slate-800 p-12 bg-slate-950/50 text-center text-slate-500 text-xs">
         © 2026 Smart Privacy Guard. Secure. Local. Private.
      </footer>
    </div>
  );
};

export default Landing;
