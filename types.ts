// Enum for Page Types as per requirements
export enum PageType {
  BillDetail = "Bill Detail",
  FinalBill = "Final Bill",
  Pharmacy = "Pharmacy"
}

// Item structure
export interface BillItem {
  item_name: string;
  item_amount: number;
  item_rate: number;
  item_quantity: number;
}

// Page structure
export interface PageLineItems {
  page_no: string;
  page_type: PageType;
  bill_items: BillItem[];
}

// Token usage structure
export interface TokenUsage {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

// Main Data structure
export interface ExtractionData {
  pagewise_line_items: PageLineItems[];
  total_item_count: number;
}

// API Response structure
export interface BillExtractionResponse {
  is_success: boolean;
  token_usage: TokenUsage;
  data: ExtractionData;
}

export interface ProcessingState {
  status: 'idle' | 'processing' | 'success' | 'error';
  message?: string;
}
