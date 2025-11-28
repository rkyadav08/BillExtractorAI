import React, { useState } from 'react';
import { Bot, Sparkles, ChevronRight } from 'lucide-react';
import FileUpload from './components/FileUpload';
import ResultsDisplay from './components/ResultsDisplay';
import { BillExtractionResponse } from './types';
import { extractBillData } from './services/geminiService';

const App: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BillExtractionResponse | null>(null);

  const handleProcess = async (input: File | string) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const data = await extractBillData(input);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <Bot size={24} />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-600">
              BillExtract AI
            </h1>
          </div>
          <div className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-600">
             <span>Powered by Gemini 2.5 Flash</span>
             <span className="w-px h-4 bg-slate-300"></span>
             <span className="flex items-center gap-1 text-blue-600"><Sparkles size={14}/> Accurate</span>
             <span className="flex items-center gap-1 text-blue-600"><Sparkles size={14}/> Fast</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full">
        
        {/* Intro Section (Only show if no results yet) */}
        {!result && !isProcessing && (
          <div className="text-center mb-12 animate-fade-in-up">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Automate your Invoice Data Extraction
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
              Upload complex medical bills, pharmacy receipts, or detailed invoices. 
              Our AI extracts line items, rates, and totals with structured JSON output.
            </p>
          </div>
        )}

        {/* Upload Section */}
        <div className={result ? "mb-8 border-b border-slate-200 pb-8" : ""}>
          <FileUpload onProcess={handleProcess} isProcessing={isProcessing} />
        </div>

        {/* Error State */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3">
             <div className="mt-0.5 font-bold">Error:</div>
             <div>{error}</div>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-4">
              <span className="hover:text-slate-900 cursor-pointer" onClick={() => setResult(null)}>Home</span>
              <ChevronRight size={14} />
              <span className="font-medium text-slate-900">Extraction Results</span>
            </div>
            <ResultsDisplay result={result} />
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          <p>&copy; {new Date().getFullYear()} BillExtract AI. Built for the HackRx Datathon.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
