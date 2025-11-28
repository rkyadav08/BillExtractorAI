import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ApiResponse, ExtractionData } from "../types";

// Schema definition matching the strict requirements
const billSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    pagewise_line_items: {
      type: Type.ARRAY,
      description: "List of pages and their extracted line items",
      items: {
        type: Type.OBJECT,
        properties: {
          page_no: {
            type: Type.STRING,
            description: "The page number of the document",
          },
          page_type: {
            type: Type.STRING,
            enum: ["Bill Detail", "Final Bill", "Pharmacy"],
            description: "The classification of the page content",
          },
          bill_items: {
            type: Type.ARRAY,
            description: "The individual line items found on this page",
            items: {
              type: Type.OBJECT,
              properties: {
                item_name: {
                  type: Type.STRING,
                  description: "Exact name of the item/service as mentioned in the bill",
                },
                item_amount: {
                  type: Type.NUMBER,
                  description: "Net Amount of the item post discounts as mentioned in the bill. Do not include currency symbols.",
                },
                item_rate: {
                  type: Type.NUMBER,
                  description: "Unit rate or price per item. Do not include currency symbols.",
                },
                item_quantity: {
                  type: Type.NUMBER,
                  description: "Quantity of the item.",
                },
              },
              required: ["item_name", "item_amount", "item_rate", "item_quantity"],
            },
          },
        },
        required: ["page_no", "page_type", "bill_items"],
      },
    },
    total_item_count: {
      type: Type.INTEGER,
      description: "Total count of line items extracted across all pages",
    },
  },
  required: ["pagewise_line_items", "total_item_count"],
};

export const extractBillData = async (
  imageUrl: string,
  apiKey: string
): Promise<ApiResponse> => {
  try {
    if (!apiKey) {
      throw new Error("API Key is missing. Please check your environment configuration.");
    }

    // 1. Fetch the image and convert to Base64
    // Note: in a client-side app, fetching external URLs often triggers CORS.
    // We assume the user might provide a Data URL or a URL that allows CORS.
    // If it fails, we handle it gracefully.
    let base64Data = "";
    let mimeType = "image/png";

    if (imageUrl.startsWith("data:")) {
      const parts = imageUrl.split(",");
      mimeType = parts[0].match(/:(.*?);/)?.[1] || "image/png";
      base64Data = parts[1];
    } else {
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }
        const blob = await imageResponse.blob();
        mimeType = blob.type;
        base64Data = await blobToBase64(blob);
      } catch (e) {
        console.error("Image fetch error:", e);
        throw new Error(
          "Could not fetch the image from the URL due to browser CORS restrictions. Please try uploading the file directly or using a CORS-enabled URL."
        );
      }
    }

    // 2. Initialize Gemini
    const ai = new GoogleGenAI({ apiKey });

    // 3. Prepare the Prompt
    const prompt = `
      You are an expert automated invoice data extraction system. 
      Analyze the provided medical bill or invoice image(s).
      
      Extract all line items visible in the document.
      
      RULES:
      1. IGNORE headers, footers, and summary lines like "Total", "Subtotal", "Balance Due", "Net Amount" (unless it's a specific line item service).
      2. Do not double count entries.
      3. Ensure 'item_amount' is the final amount for that line item.
      4. Ensure 'item_rate' is the unit price.
      5. If quantity is not explicitly stated but implied as 1, use 1.
      6. Return raw numbers for amount/rate/quantity (no currency symbols).
    `;

    // 4. Call the API
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: billSchema,
        temperature: 0, // Low temperature for factual extraction
      },
    });

    // 5. Process Response
    const text = response.text;
    if (!text) {
      throw new Error("Empty response from AI model.");
    }

    const data = JSON.parse(text) as ExtractionData;
    const usage = response.usageMetadata;

    // 6. Return Structured API Response
    return {
      is_success: true,
      token_usage: {
        total_tokens: usage?.totalTokenCount || 0,
        input_tokens: usage?.promptTokenCount || 0,
        output_tokens: usage?.candidatesTokenCount || 0,
      },
      data: data,
    };
  } catch (error: any) {
    return {
      is_success: false,
      token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      data: null,
      error: error.message || "An unexpected error occurred",
    };
  }
};

// Helper to convert Blob to Base64 string (without metadata prefix)
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data:image/png;base64, part
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
