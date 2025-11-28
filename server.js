import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Schema, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS and JSON body parsing
app.use(cors());
app.use(express.json());

// 1. Serve the Frontend Build (UI)
// This makes the root URL (/) load your React App
app.use(express.static(path.join(__dirname, 'dist')));

// --- API Configuration ---

const extractionSchema = {
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

// 2. THE API ENDPOINT (POST)
app.post('/extract-bill-data', async (req, res) => {
    try {
        const { document } = req.body;
        
        if (!document) {
            return res.status(400).json({ error: "No document URL provided" });
        }

        if (!process.env.API_KEY) {
            return res.status(500).json({ error: "Server misconfiguration: API_KEY missing" });
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const filePart = await urlToGenerativePart(document);

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
        6. **Data Accuracy**: 
           - 'data.total_item_count' must equal the sum of counts of items across all pages.
        7. **Token Usage**: Populate 0 for tokens in the response JSON; we will populate the actual usage from API metadata.
        8. **Success Flag**: Set 'is_success' to true if data was extracted.
        
        Extract now.
        `;

        const modelResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                role: "user",
                parts: [filePart, { text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: extractionSchema,
                temperature: 0.1,
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

        res.json(parsedData);

    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ 
            is_success: false, 
            error: error.message 
        });
    }
});

// 3. Handle React Routing (return index.html for all non-API routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
