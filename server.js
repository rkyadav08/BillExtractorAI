import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// FIX: Remove Schema and Type imports which cause named export errors in Node.js
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// Debug Middleware: Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 1. Serve the Frontend Build (UI)
app.use(express.static(path.join(__dirname, 'dist')));

// --- API Configuration ---

// FIX: Use string literals ("OBJECT", "STRING") instead of Type.OBJECT to avoid import errors
const extractionSchema = {
  type: "OBJECT",
  properties: {
    is_success: { type: "BOOLEAN", description: "Set to true if extraction is successful" },
    token_usage: {
      type: "OBJECT",
      properties: {
        total_tokens: { type: "INTEGER" },
        input_tokens: { type: "INTEGER" },
        output_tokens: { type: "INTEGER" },
      },
      required: ["total_tokens", "input_tokens", "output_tokens"],
    },
    data: {
      type: "OBJECT",
      properties: {
        pagewise_line_items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              page_no: { type: "STRING" },
              page_type: { 
                type: "STRING", 
                enum: ["Bill Detail", "Final Bill", "Pharmacy"] 
              },
              bill_items: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    item_name: { type: "STRING", description: "Exactly as mentioned in the bill" },
                    item_amount: { type: "NUMBER", description: "Net Amount of the item post discounts" },
                    item_rate: { type: "NUMBER", description: "Exactly as mentioned, 0.0 if not present" },
                    item_quantity: { type: "NUMBER", description: "Exactly as mentioned, 0.0 if not present" },
                  },
                  required: ["item_name", "item_amount", "item_rate", "item_quantity"]
                }
              }
            },
            required: ["page_no", "page_type", "bill_items"]
          }
        },
        total_item_count: { type: "INTEGER", description: "Count of items across all pages" }
      },
      propertyOrdering: ["pagewise_line_items", "total_item_count"],
      required: ["pagewise_line_items", "total_item_count"]
    }
  },
  required: ["is_success", "token_usage", "data"]
};

// Helper to fetch URL and convert to Base64 (Node.js version)
const urlToGenerativePart = async (url) => {
    try {
        console.log(`Fetching URL: ${url}`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = buffer.toString('base64');
        
        let mimeType = response.headers.get('content-type');
        
        // Fallback for generic types
        if (!mimeType || mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream') {
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.endsWith('.png')) mimeType = 'image/png';
            else if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (lowerUrl.endsWith('.webp')) mimeType = 'image/webp';
            else mimeType = 'application/pdf';
        }
        
        return {
            inlineData: {
                data: base64Data,
                mimeType: mimeType
            }
        };
    } catch (error) {
        console.error("Error processing URL on server:", error);
        throw new Error(`Could not download document: ${error.message}`);
    }
};

// API Health Check
app.get('/health', (req, res) => {
    res.json({ status: "ok", type: "Web Service" });
});

// 2. THE API ENDPOINT (POST)
app.post('/extract-bill-data', async (req, res) => {
    try {
        console.log("Processing /extract-bill-data");
        const { document } = req.body;
        
        if (!document) {
            return res.status(400).json({ error: "No document URL provided" });
        }

        if (!process.env.API_KEY) {
            return res.status(500).json({ error: "Server misconfiguration: API_KEY missing" });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const filePart = await urlToGenerativePart(document);

        // Optimized CoT prompt for high accuracy
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

        console.log("Sending request to Gemini...");
        const modelResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                role: "user",
                parts: [filePart, { text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: extractionSchema,
                temperature: 0.0, // Strict determinism
                thinkingConfig: {
                    thinkingBudget: 512 // Higher budget for complex table auditing
                } 
            }
        });

        const resultText = modelResponse.text;
        const parsedData = JSON.parse(resultText);

        // Explicitly overwrite token_usage with actual metadata from the API
        if (modelResponse.usageMetadata) {
            parsedData.token_usage = {
                input_tokens: modelResponse.usageMetadata.promptTokenCount || 0,
                output_tokens: modelResponse.usageMetadata.candidatesTokenCount || 0,
                total_tokens: modelResponse.usageMetadata.totalTokenCount || 0
            };
        } else {
             // Fallback if metadata is missing (rare)
             parsedData.token_usage = {
                total_tokens: 0,
                input_tokens: 0,
                output_tokens: 0
             };
        }

        console.log("Extraction complete.");
        res.json(parsedData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ 
            is_success: false, 
            error: error.message 
        });
    }
});

// 3. Handle React Routing (catch-all)
// This must be the LAST route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
