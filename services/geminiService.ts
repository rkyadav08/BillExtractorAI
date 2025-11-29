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
  You are a high-precision financial auditor AI. Your ONLY job is to extract line item data from medical bills with 100% accuracy.

  ### CORE OBJECTIVE
  Reconstruct the bill's line items such that the Sum(extracted item_amounts) equals the Actual Bill Total. 
  
  ### CRITICAL EXCLUSION RULES (To prevent Double Counting)
  - **NEVER** extract rows that are subtotals or totals. (e.g., "Total", "Grand Total", "Sub Total", "Net Amount", "Amount Payable").
  - **NEVER** extract "Balance Due", "Paid Amount", "Brought Forward", or "Carried Forward".
  - **NEVER** extract category headers as items if they don't have a specific amount attached (or if they are just grouping headers).
  - **ONLY** extract the atomic line items (medicines, specific tests, room charges for specific dates).

  ### PAGE TYPE CLASSIFICATION RULES
  - **"Final Bill"**: Look for high-level summaries (e.g., "Room Rent: 5000", "Pharmacy: 2000"). If the page lists these consolidated charges, it is a Final Bill. Extract these consolidated rows as items.
  - **"Bill Detail"**: Look for granular lists (e.g., "10/10/2023 Room Rent", "CBC Test", "X-Ray"). 
  - **"Pharmacy"**: Look for drug names, batch numbers, and expiry dates.

  ### FIELD EXTRACTION RULES
  1. **item_name**: The full description of the service/product.
  2. **item_rate**: The unit price. **IMPORTANT**: If the rate column is missing or empty, YOU MUST RETURN 0.0. Do not infer it.
  3. **item_quantity**: The count. **IMPORTANT**: If the quantity column is missing or empty, YOU MUST RETURN 0.0.
  4. **item_amount**: The NET amount for that line (Rate * Qty - Discount). 

  ### EXECUTION STEPS
  1. Analyze the layout of each page.
  2. Determine the "Page Type" based on content.
  3. Iterate through every table row.
  4. CHECK: Is this row a Total/Subtotal? If YES -> SKIP IT.
  5. CHECK: Is this row a header? If YES -> SKIP IT.
  6. EXTRACT: Name, Rate (default 0.0), Qty (default 0.0), Amount.
  7. Verify: Does the sum of your extracted items roughly match the page total? If not, check if you missed items or included a subtotal.

  Generate the JSON response now.
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
        temperature: 0.0, // Zero temperature for maximum determinism
        thinkingConfig: {
          thinkingBudget: 2048 // Enable thinking for better reasoning
        }
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
            input_tokens: response.usageMetadata.promptTokenCount || 0,
            output_tokens: response.usageMetadata.candidatesTokenCount || 0,
            total_tokens: response.usageMetadata.totalTokenCount || 0
        };
    }

    return parsedData;

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
};
