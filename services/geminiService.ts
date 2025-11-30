import { GoogleGenAI, Schema, Type } from "@google/genai";
import { BillExtractionResponse } from "../types";

// Helper to determine mime type from URL if blob type is generic
const getMimeType = (url: string, blobType: string): string => {
  if (blobType && blobType !== 'application/octet-stream' && blobType !== 'application/x-www-form-urlencoded') {
    return blobType;
  }
  // Fallback to extension check
  const cleanUrl = url.split('?')[0].toLowerCase();
  if (cleanUrl.endsWith('.png')) return 'image/png';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.pdf')) return 'application/pdf';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  return 'application/pdf'; // Default fallback
};

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Helper to fetch URL and convert to Base64 (GenerativePart)
const urlToGenerativePart = async (url: string): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  // Internal helper to process blob to base64
  const blobToBase64 = (blob: Blob): Promise<{ inlineData: { data: string; mimeType: string } }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const base64Data = base64String.split(',')[1];
        const mimeType = getMimeType(url, blob.type);
        resolve({
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const isImage = /\.(jpeg|jpg|png|webp|gif)($|\?)/i.test(url);

  // Define strategies with priority based on content type
  const strategies = [
    // 1. Direct Fetch (Best if CORS is enabled)
    {
      name: "Direct",
      fn: () => fetch(url)
    },
    // 2. WeServer (High priority for images - bypasses CORS reliably)
    {
      name: "WeServer",
      skip: !isImage, // Only use for images
      fn: () => fetch(`https://images.weserv.nl/?url=${encodeURIComponent(url)}&output=jpg&we&il`)
    },
    // 3. CorsProxy.io (Reliable general purpose)
    {
      name: "CorsProxy.io",
      fn: () => fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`)
    },
    // 4. AllOrigins (Raw bytes)
    {
      name: "AllOrigins",
      fn: () => fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`)
    },
    // 5. ThingProxy (Fallback)
    {
      name: "ThingProxy",
      fn: () => fetch(`https://thingproxy.freeboard.io/fetch/${url}`)
    }
  ];

  const errors: string[] = [];

  for (const strategy of strategies) {
    if (strategy.skip) continue;

    try {
      console.log(`Attempting fetch via ${strategy.name}...`);
      const res = await strategy.fn();
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const blob = await res.blob();

      // Validation: Proxy error pages often return HTML with 200 OK
      if (blob.type.includes('text/html')) {
        throw new Error("Received HTML instead of binary data (likely an error page)");
      }
      
      if (blob.size < 100) {
        throw new Error(`Blob size too small (${blob.size} bytes)`);
      }

      console.log(`Success fetching via ${strategy.name}`);
      return await blobToBase64(blob);

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Strategy '${strategy.name}' failed: ${msg}`);
      errors.push(`${strategy.name}: ${msg}`);
    }
  }

  throw new Error(`Failed to fetch document. Tried ${strategies.length} methods.\nDetails:\n${errors.join('\n')}`);
};

// Define the strictly typed output schema for Gemini
const extractionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    is_success: { type: Type.BOOLEAN, description: "Set to true if extraction is successful" },
    token_usage: {
      type: Type.OBJECT,
      properties: {
        total_tokens: { type: Type.INTEGER },
        input_tokens: { type: Type.INTEGER },
        output_tokens: { type: Type.INTEGER },
      },
      required: ["total_tokens", "input_tokens", "output_tokens"],
    },
    data: {
      type: Type.OBJECT,
      properties: {
        pagewise_line_items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              page_no: { type: Type.STRING },
              page_type: { 
                type: Type.STRING, 
                enum: ["Bill Detail", "Final Bill", "Pharmacy"] 
              },
              bill_items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    item_name: { type: Type.STRING, description: "Exactly as mentioned in the bill" },
                    item_amount: { type: Type.NUMBER, description: "Net Amount of the item post discounts" },
                    item_rate: { type: Type.NUMBER, description: "Exactly as mentioned, 0.0 if not present" },
                    item_quantity: { type: Type.NUMBER, description: "Exactly as mentioned, 0.0 if not present" },
                  },
                  required: ["item_name", "item_amount", "item_rate", "item_quantity"]
                }
              }
            },
            required: ["page_no", "page_type", "bill_items"]
          }
        },
        total_item_count: { type: Type.INTEGER, description: "Count of items across all pages" }
      },
      propertyOrdering: ["pagewise_line_items", "total_item_count"],
      required: ["pagewise_line_items", "total_item_count"]
    }
  },
  required: ["is_success", "token_usage", "data"]
};

export const extractBillData = async (input: File | string): Promise<BillExtractionResponse> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing in environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  let filePart;
  try {
    if (typeof input === 'string') {
      filePart = await urlToGenerativePart(input);
    } else {
      filePart = await fileToGenerativePart(input);
    }
  } catch (e) {
    console.error("File processing error:", e);
    throw e;
  }

  const prompt = `
  Role: Senior Financial Auditor.
  Task: Extract line items from the medical bill document into strict JSON format as per the schema.
  
  ### DATA ACCURACY RULES (HIGHEST PRIORITY):
  1. **Rate & Quantity**: 
     - IF a specific "Rate" or "Quantity" column exists and has a value, use it.
     - IF the column is empty, missing, or contains "-", **YOU MUST RETURN 0.0**. 
     - **NEVER** calculate Rate = Amount / Quantity. 
     - **NEVER** assume Quantity = 1 if not explicitly written.
  
  2. **Item Name**: 
     - Extract the full description. 
     - **CLEANING**: Remove dates (e.g., "12/11/2025") from the start of the description unless the description is ONLY a date.
  
  3. **Item Amount (Crucial)**:
     - This must be the **Net Payable Amount** for that specific line item.
     - **Handling Multiple Amount Columns**:
       - If "Amount" = 0 but "Company Amount" > 0, use "Company Amount" (Insurance Bill).
       - If "Gross" and "Net" exist, use "Net".
       - If "Billed" and "Allowed" exist, use "Allowed".
  
  ### EXCLUSION RULES (PREVENT DOUBLE COUNTING):
  - **IGNORE** any row that is a summation: "Total", "Sub Total", "Net Amount", "Grand Total", "Total Bill", "Balance", "Due", "Carry Forward".
  - **IGNORE** category headers that don't have a distinct price on the same line (e.g. "Pharmacy Charges" header followed by list of drugs -> Ignore the header).
  
  ### PAGE TYPES:
  - "Pharmacy": Lists of drugs, batches, expiry.
  - "Final Bill": Summary of charges by category (e.g. "Room Rent", "Consultation", "Lab").
  - "Bill Detail": Chronological or detailed list of services/tests.

  Analyze the table structure deeply before extracting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        role: "user",
        parts: [
          filePart,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: extractionSchema,
        temperature: 0.0, // Strict determinism
        thinkingConfig: {
          thinkingBudget: 1024 // Higher budget for complex table auditing
        } as any
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("No data returned from Gemini.");
    }

    const parsedData = JSON.parse(resultText) as BillExtractionResponse;

    // Enhance response with actual usage metadata from the API response object
    if (response.usageMetadata) {
        parsedData.token_usage = {
            total_tokens: response.usageMetadata.totalTokenCount || 0,
            input_tokens: response.usageMetadata.promptTokenCount || 0,
            output_tokens: response.usageMetadata.candidatesTokenCount || 0
            
        };
    } else {
       // Fallback if metadata is missing (rare)
       parsedData.token_usage = {
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0
       };
    }

    return parsedData;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
