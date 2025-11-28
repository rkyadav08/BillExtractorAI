export interface BillItem {
  item_name: string;
  item_amount: number;
  item_rate: number;
  item_quantity: number;
}

export interface PageLineItems {
  page_no: string;
  page_type: "Bill Detail" | "Final Bill" | "Pharmacy" | "Unknown";
  bill_items: BillItem[];
}

export interface TokenUsage {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
}

export interface ExtractionData {
  pagewise_line_items: PageLineItems[];
  total_item_count: number;
}

export interface ApiResponse {
  is_success: boolean;
  token_usage: TokenUsage;
  data: ExtractionData | null;
  error?: string;
}

export interface ProcessingStatus {
  loading: boolean;
  step: 'idle' | 'fetching_image' | 'analyzing' | 'complete' | 'error';
  message: string;
}