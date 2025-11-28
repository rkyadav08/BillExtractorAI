
import React from 'react';
import { ExtractionData, BillItem, PageLineItems } from '../types';
import { FileText } from 'lucide-react';

interface BillTableProps {
  data: ExtractionData;
}

const getPageTypeColor = (type: string) => {
  switch (type) {
    case 'Final Bill': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'Pharmacy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'Bill Detail': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-gray-100 text-gray-700';
  }
};

const BillTable: React.FC<BillTableProps> = ({ data }) => {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
           <div className="text-gray-500 text-xs uppercase font-semibold tracking-wider mb-1">Total Items</div>
           <div className="text-2xl font-bold text-gray-800">{data.total_item_count}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
           <div className="text-gray-500 text-xs uppercase font-semibold tracking-wider mb-1">Pages Processed</div>
           <div className="text-2xl font-bold text-gray-800">{data.pagewise_line_items.length}</div>
        </div>
      </div>

      {data.pagewise_line_items.map((page: PageLineItems, index: number) => (
        <div key={index} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <FileText className="w-5 h-5 text-gray-500" />
              <h3 className="font-semibold text-gray-800">Page {page.page_no}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getPageTypeColor(page.page_type)}`}>
                {page.page_type}
              </span>
            </div>
            <span className="text-xs text-gray-500 font-medium">{page.bill_items.length} items</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/2">Item Name</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Rate</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Qty</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {page.bill_items.map((item: BillItem, itemIdx: number) => (
                  <tr key={itemIdx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-sm text-gray-800 font-medium">
                      {item.item_name}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right font-mono">
                      {item.item_rate.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right font-mono">
                      {item.item_quantity}
                    </td>
                    <td className="px-6 py-3 text-sm text-indigo-600 font-bold text-right font-mono">
                      {item.item_amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50/50">
                 <tr>
                    <td colSpan={3} className="px-6 py-2 text-xs font-semibold text-gray-500 text-right uppercase tracking-wider">Page Total</td>
                    <td className="px-6 py-2 text-sm font-bold text-gray-900 text-right font-mono">
                      {page.bill_items.reduce((sum, i) => sum + i.item_amount, 0).toFixed(2)}
                    </td>
                 </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default BillTable;
