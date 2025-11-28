import React, { useCallback, useState } from 'react';
import { UploadCloud, FileText, AlertCircle, Loader2, Link as LinkIcon, ArrowRight } from 'lucide-react';

interface FileUploadProps {
  onProcess: (input: File | string) => void;
  isProcessing: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onProcess, isProcessing }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndProcessFile(file);
    }
  }, [onProcess]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      validateAndProcessFile(file);
    }
  };

  const validateAndProcessFile = (file: File) => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    if (validTypes.includes(file.type)) {
      setFileName(file.name);
      setUrlInput(""); // Clear URL input if file is selected
      onProcess(file);
    } else {
      alert("Invalid file type. Please upload PDF, PNG, or JPEG.");
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      setFileName(null); // Clear file selection if URL is submitted
      onProcess(urlInput.trim());
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto mb-8 space-y-6">
      {/* File Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 ease-in-out text-center ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
        } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={isProcessing ? undefined : handleDrop}
      >
        <input
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={handleFileChange}
          accept="application/pdf,image/png,image/jpeg"
          disabled={isProcessing}
        />

        <div className="flex flex-col items-center justify-center space-y-4">
          {isProcessing && fileName ? (
            <div className="animate-spin text-blue-600">
              <Loader2 size={48} />
            </div>
          ) : fileName ? (
            <div className="text-blue-600">
              <FileText size={48} />
            </div>
          ) : (
            <div className="text-slate-400">
              <UploadCloud size={48} />
            </div>
          )}

          <div className="text-slate-700">
            {isProcessing && fileName ? (
              <p className="text-lg font-medium animate-pulse">Extracting Data...</p>
            ) : fileName ? (
              <div>
                <p className="text-lg font-medium text-slate-900">{fileName}</p>
                <p className="text-sm text-slate-500 mt-1">Click or drag to replace</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-medium text-slate-900">
                  Drop your bill here, or <span className="text-blue-600">browse</span>
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Supports PDF, PNG, JPG (Max 10MB)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative bg-slate-50 px-4 text-sm text-slate-500 uppercase tracking-wider font-medium">
          OR
        </div>
      </div>

      {/* URL Input */}
      <form onSubmit={handleUrlSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <LinkIcon size={18} />
          </div>
          <input
            type="url"
            placeholder="Paste document URL here (e.g., https://hackrx...)"
            className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm disabled:opacity-60 disabled:bg-slate-100"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={isProcessing}
            required
          />
        </div>
        <button
          type="submit"
          disabled={isProcessing || !urlInput.trim()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isProcessing && !fileName ? <Loader2 size={18} className="animate-spin mr-2" /> : <ArrowRight size={18} className="mr-2" />}
          Process Link
        </button>
      </form>
      
      {/* Disclaimer/Info */}
      <div className="flex items-start gap-2 mt-4 text-xs text-slate-500 px-2">
        <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
        <p>
          Uploaded documents are processed by Google Gemini 2.5 Flash strictly for data extraction. 
          Ensure no sensitive personal PII is in the demo documents if possible. 
          Note: URL extraction relies on the server supporting cross-origin requests.
        </p>
      </div>
    </div>
  );
};

export default FileUpload;
