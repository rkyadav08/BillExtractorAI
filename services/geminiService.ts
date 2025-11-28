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
    You are an expert autonomous data extractor for medical and pharmacy bills.
    Analyze the provided document (PDF or Image) and extract line item details strictly following these rules:

    1. **Structure**: Return a JSON object matching the provided schema exactly.
    2. **Line Items**: Extract every single line item. Do not miss any. Do not double count.
    3. **Missing Values** (Strict Rule): 
       - If 'item rate' is not present in the doc, you MUST set 'item_rate' = 0.0.
       - If 'item quantity' is not present in the doc, you MUST set 'item_quantity' = 0.0.
    4. **Amounts**: 'item_amount' must be exactly as extracted (Net Amount). No rounding off allowed unless it's rounded in the doc.
    5. **Page Type**: Categorize each page strictly as one of: "Bill Detail", "Final Bill", "Pharmacy".
       - "Bill Detail": Detailed line-item breakdown including medicines, tests, procedures and services.
       - "Final Bill": A consolidated bill with category-level totals (e.g., Room Charges, Lab Charges, Professional Fees).
       - "Pharmacy": Receipt from pharmacy showing medicines and consumables.
    6. **Data Accuracy**: 
       - 'data.total_item_count' must equal the sum of counts of items across all pages.
    7. **Token Usage**: Populate 0 for tokens in the response JSON; we will populate the actual usage from API metadata.
    8. **Success Flag**: Set 'is_success' to true if data was extracted.
    
    Extract now.
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
        temperature: 0.1, // Low temperature for deterministic extraction
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
