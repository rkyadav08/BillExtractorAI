import React, { useState } from 'react';
import { BillExtractionResponse, PageType } from '../types';
import { CheckCircle2, Code, FileSpreadsheet, Copy, Coins } from 'lucide-react';

interface ResultsDisplayProps {
  result: BillExtractionResponse;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result }) => {
  // Default to 'json' as per user requirement to "provide only json" structure initially
  const [activeTab, setActiveTab] = useState<'json' | 'formatted'>('json');

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    alert("JSON copied to clipboard!");
  };

  const getPageTypeColor = (type: PageType) => {
    switch (type) {
      case PageType.Pharmacy: return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case PageType.FinalBill: return 'bg-blue-100 text-blue-800 border-blue-200';
      case PageType.BillDetail: return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto animate-fade-in-up">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500 font-medium">Status</p>
            <p className={`text-xl font-bold flex items-center gap-2 ${result.is_success ? 'text-green-600' : 'text-red-600'}`}>
              {result.is_success ? 'Success' : 'Failed'}
              {result.is_success && <CheckCircle2 size={20} />}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-sm text-slate-500 font-medium">Total Items</p>
           <p className="text-2xl font-bold text-slate-900">{result.data.total_item_count}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
           <p className="text-sm text-slate-500 font-medium flex items-center gap-1"><Coins size={14}/> Token Usage</p>
           <div className="text-xs text-slate-600 mt-1 space-y-1">
             <div className="flex justify-between"><span>Input:</span> <span className="font-mono">{result.token_usage?.input_tokens || 0}</span></div>
             <div className="flex justify-between"><span>Output:</span> <span className="font-mono">{result.token_usage?.output_tokens || 0}</span></div>
             <div className="flex justify-between font-bold pt-1 border-t border-slate-100"><span>Total:</span> <span className="font-mono">{result.token_usage?.total_tokens || 0}</span></div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 flex items-center bg-slate-50">
          <button
            onClick={() => setActiveTab('json')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'json' 
                ? 'bg-white border-x border-slate-200 text-blue-600' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Code size={16} /> JSON Response
          </button>
          <button
            onClick={() => setActiveTab('formatted')}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'formatted' 
                ? 'bg-white border-r border-slate-200 text-blue-600' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet size={16} /> Formatted View
          </button>
          <div className="flex-1"></div>
          <button 
            onClick={copyToClipboard}
            className="mr-4 text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors"
          >
            <Copy size={14} /> Copy JSON
          </button>
        </div>

        {/* Content */}
        <div className="p-6 bg-slate-50/50 min-h-[400px]">
          {activeTab === 'formatted' ? (
            <div className="space-y-8">
              {result.data.pagewise_line_items.map((page, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">Page {page.page_no}</h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPageTypeColor(page.page_type)}`}>
                      {page.page_type}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-3 w-1/2">Item Name</th>
                          <th className="px-6 py-3 text-right">Rate</th>
                          <th className="px-6 py-3 text-right">Qty</th>
                          <th className="px-6 py-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {page.bill_items.map((item, itemIdx) => (
                          <tr key={itemIdx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-700">{item.item_name}</td>
                            <td className="px-6 py-3 text-right text-slate-600">{item.item_rate.toFixed(2)}</td>
                            <td className="px-6 py-3 text-right text-slate-600">{item.item_quantity}</td>
                            <td className="px-6 py-3 text-right font-semibold text-slate-900">{item.item_amount.toFixed(2)}</td>
                          </tr>
                        ))}
                        {page.bill_items.length === 0 && (
                           <tr>
                             <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No line items extracted for this page.</td>
                           </tr>
                        )}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200">
                        <tr>
                          <td className="px-6 py-3 font-bold text-slate-700">Subtotal (Page)</td>
                          <td></td>
                          <td></td>
                          <td className="px-6 py-3 text-right font-bold text-slate-900">
                            {page.bill_items.reduce((acc, curr) => acc + curr.item_amount, 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 rounded-lg p-6 overflow-x-auto">
              <pre className="text-sm font-mono text-blue-300">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
