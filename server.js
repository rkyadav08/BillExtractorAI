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

        // Optimized CoT prompt for high accuracy and speed
        const prompt = `
        Role: Senior Financial Auditor.
        Task: Extract line items from the medical bill document into strict JSON format.
        Goal: Achieve 100% accuracy in extracted amounts so the sum matches the document total.

        ### STRICT EXCLUSION RULES (CRITICAL):
        1. **NO SUBTOTALS/TOTALS**: Ignore any row containing "Total", "Grand Total", "Sub Total", "Net Amount", "Amount Payable", "Balance", "Due", "Brought Forward", "Carried Forward".
        2. **NO GROUP HEADERS**: Ignore category headers (e.g., "Pharmacy Charges", "Room Rent") unless they have a specific amount on the same line that isn't a sum of items below.
        3. **NO DOUBLE COUNTING**: If a section has individual items and a subtotal, EXTRACT THE INDIVIDUAL ITEMS, IGNORE THE SUBTOTAL.

        ### PAGE CLASSIFICATION:
        - **Pharmacy**: Page lists medicine names, batches, exp dates.
        - **Final Bill**: Page lists high-level categories (e.g., "Pharmacy.... 5000", "Consultation... 2000") and acts as a cover summary.
        - **Bill Detail**: Page lists specific dates, specific test names (CBC, X-Ray), or daily room charges.

        ### DATA EXTRACTION RULES:
        - **item_name**: Extract full description.
        - **item_rate**: Extract Unit Price. **IF MISSING/EMPTY, RETURN 0.0**. DO NOT CALCULATE.
        - **item_quantity**: Extract Count. **IF MISSING/EMPTY, RETURN 0.0**. DO NOT ASSUME 1.
        - **item_amount**: Extract Net Amount.

        Analyze the table structure carefully. Ensure no row is skipped unless it is an exclusion.
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
                    thinkingBudget: 2048 // Budget for reasoning to ensure table structure is understood
                } 
            }
        });

        const resultText = modelResponse.text;
        const parsedData = JSON.parse(resultText);

        if (modelResponse.usageMetadata) {
            parsedData.token_usage = {
                input_tokens: modelResponse.usageMetadata.promptTokenCount || 0,
                output_tokens: modelResponse.usageMetadata.candidatesTokenCount || 0,
                total_tokens: modelResponse.usageMetadata.totalTokenCount || 0
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
