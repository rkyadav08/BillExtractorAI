import React, { useState, useRef } from 'react';
import { extractBillData } from './services/geminiService';
import { ApiResponse, ProcessingStatus } from './types';
import JsonViewer from './components/JsonViewer';
import BillTable from './components/BillTable';
import { ScanLine, Upload, AlertCircle, CheckCircle2, Loader2, List, Hash, Code2, Terminal } from 'lucide-react';

const App: React.FC = () => {
  const [docUrl, setDocUrl] = useState<string>('');
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'api'>('preview');
  const [status, setStatus] = useState<ProcessingStatus>({
    loading: false,
    step: 'idle',
    message: ''
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docUrl) return;
    await processDocument(docUrl);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;
        setDocUrl("(Uploaded File)"); // Just for display
        await processDocument(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const processDocument = async (urlOrBase64: string) => {
    // Status Logic
    setStatus({ loading: true, step: 'fetching_image', message: 'Sending document to server...' });
    setResult(null);
    setActiveTab('preview');

    try {
      // Small artificial delay to show state change if it's too fast
      await new Promise(r => setTimeout(r, 500));
      setStatus({ loading: true, step: 'analyzing', message: 'Extracting line items with Gemini 2.5...' });

      const response = await extractBillData(urlOrBase64);
      
      setResult(response);
      
      if (response.is_success) {
        setStatus({ loading: false, step: 'complete', message: 'Extraction Successful' });
      } else {
        setStatus({ loading: false, step: 'error', message: response.error || 'Extraction Failed' });
      }
    } catch (error) {
      setResult({
        is_success: false,
        token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
        data: null,
        error: "Application error occurred"
      });
      setStatus({ loading: false, step: 'error', message: 'An unexpected error occurred' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <ScanLine className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">BillExtractor <span className="text-indigo-600">AI</span></h1>
          </div>
          <div className="flex items-center space-x-4">
             <button 
               onClick={() => setActiveTab('preview')}
               className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'preview' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
             >
               Preview Tool
             </button>
             <button 
               onClick={() => setActiveTab('api')}
               className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'api' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-900'}`}
             >
               API Docs
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {activeTab === 'api' ? (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
             <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-8 border-b border-gray-100">
                   <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <Terminal className="w-6 h-6 text-indigo-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900">API Deployment Guide</h2>
                   </div>
                   <p className="text-gray-600 leading-relaxed">
                     To fulfill the hackathon requirements, this solution includes a production-ready Node.js Express server (`server.js`). 
                     This server exposes the required <code>POST /extract-bill-data</code> endpoint.
                   </p>
                </div>
                
                <div className="bg-gray-900 p-6 overflow-x-auto">
                   <div className="flex items-center justify-between mb-4">
                      <span className="text-gray-400 text-sm font-mono">cURL Request Example</span>
                      <span className="text-green-400 text-xs font-mono bg-green-900/30 px-2 py-1 rounded">POST</span>
                   </div>
                   <pre className="text-sm font-mono text-gray-300 leading-loose">
{`curl -X POST https://your-deployed-url.com/extract-bill-data \\
  -H "Content-Type: application/json" \\
  -d '{
    "document": "https://hackrx.blob.core.windows.net/sample_2.png"
  }'`}
                   </pre>
                </div>

                <div className="p-8 grid md:grid-cols-2 gap-8">
                   <div>
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                         <Code2 className="w-4 h-4 text-indigo-600" />
                         Included Files
                      </h3>
                      <ul className="space-y-2 text-sm text-gray-600">
                         <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">server.js</code> - Complete Express Backend
                         </li>
                         <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">README.md</code> - Deployment Instructions
                         </li>
                         <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">App.tsx</code> - This Frontend Visualizer
                         </li>
                      </ul>
                   </div>
                   <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Deployment Steps</h3>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                         <li>Push the code to GitHub</li>
                         <li>Connect repo to Render/Railway</li>
                         <li>Set Build Command: <code>npm install</code></li>
                         <li>Set Start Command: <code>node server.js</code></li>
                         <li>Add <code>API_KEY</code> environment variable</li>
                      </ol>
                   </div>
                </div>
             </div>
          </div>
        ) : (
          <>
            {/* Input Section */}
            <div className="max-w-3xl mx-auto mb-12">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-3">Extract Data from Medical Bills</h2>
                <p className="text-gray-600">Upload an invoice or paste a URL to instantly parse line items, rates, and quantities into structured JSON.</p>
              </div>

              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-2">
                <div className="flex flex-col md:flex-row gap-2">
                  <form onSubmit={handleUrlSubmit} className="flex-1 flex gap-2">
                    <input
                      type="text"
                      placeholder="https://example.com/bill.png"
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                      value={docUrl === "(Uploaded File)" ? "" : docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      disabled={status.loading}
                    />
                    <button 
                      type="submit"
                      disabled={status.loading || !docUrl}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                    >
                      {status.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Extract Data'}
                    </button>
                  </form>
                  
                  <div className="flex items-center justify-center px-2 text-gray-400 font-medium text-sm uppercase">or</div>

                  <div className="relative">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileUpload} 
                      accept="image/*,.pdf" 
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={status.loading}
                      className="w-full md:w-auto border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-600 px-6 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload File</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Section */}
            {status.loading && (
              <div className="max-w-3xl mx-auto text-center py-12">
                <div className="inline-flex items-center justify-center p-4 bg-white rounded-full shadow-lg mb-4">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900">{status.message}</h3>
                <p className="text-gray-500 mt-2">This usually takes about 5-10 seconds.</p>
              </div>
            )}

            {result && !status.loading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                {/* Left Column: Visual Data */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <List className="w-5 h-5 text-gray-500" />
                      Parsed Line Items
                    </h3>
                    {result.is_success ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        <AlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    )}
                  </div>

                  {result.is_success && result.data ? (
                    <BillTable data={result.data} />
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
                      <p className="font-medium">Error processing document</p>
                      <p className="text-sm mt-1">{result.error}</p>
                    </div>
                  )}
                </div>

                {/* Right Column: JSON Output */}
                <div className="flex flex-col h-[600px] lg:h-auto lg:min-h-[600px]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <Hash className="w-5 h-5 text-gray-500" />
                      API Response
                    </h3>
                    <div className="flex gap-4 text-xs font-mono text-gray-500">
                      <div title="Input Tokens">IN: {result.token_usage.input_tokens}</div>
                      <div title="Output Tokens">OUT: {result.token_usage.output_tokens}</div>
                      <div title="Total Tokens" className="font-bold text-indigo-600">TOTAL: {result.token_usage.total_tokens}</div>
                    </div>
                  </div>
                  <JsonViewer data={result} />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;
