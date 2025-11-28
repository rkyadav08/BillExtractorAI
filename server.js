import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'node:buffer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve Static Frontend Files (The result of 'npm run build')
app.use(express.static(path.join(__dirname, 'dist')));

// Initialize Gemini
const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.warn("WARNING: API_KEY is not set in environment variables.");
}
const ai = new GoogleGenAI({ apiKey: apiKey });

// Schema Definition
const billSchema = {
  type: Type.OBJECT,
  properties: {
    pagewise_line_items: {
      type: Type.ARRAY,
      description: "List of pages and their extracted line items",
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
                item_name: { type: Type.STRING },
                item_amount: { type: Type.NUMBER },
                item_rate: { type: Type.NUMBER },
                item_quantity: { type: Type.NUMBER },
              },
              required: ["item_name", "item_amount", "item_rate", "item_quantity"],
            },
          },
        },
        required: ["page_no", "page_type", "bill_items"],
      },
    },
    total_item_count: { type: Type.INTEGER },
  },
  required: ["pagewise_line_items", "total_item_count"],
};

// Helper: Fetch image from URL and convert to Base64
async function fetchImageToBase64(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get('content-type') || 'image/png';
    return {
      base64: buffer.toString('base64'),
      mimeType
    };
  } catch (error) {
    console.error("Image fetch error:", error);
    throw new Error("Could not access the provided document URL.");
  }
}

// API Endpoint
app.post('/extract-bill-data', async (req, res) => {
  try {
    const { document: documentUrl } = req.body;

    if (!documentUrl) {
      return res.status(400).json({
        is_success: false,
        error: "Missing 'document' URL in request body.",
        token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
        data: null
      });
    }

    console.log(`Processing document: ${documentUrl}`);

    const { base64, mimeType } = await fetchImageToBase64(documentUrl);

    const prompt = `
      You are an expert automated invoice data extraction system. 
      Analyze the provided medical bill or invoice image.
      Extract all line items visible in the document.
      
      RULES:
      1. IGNORE headers, footers, and summary lines like "Total", "Subtotal", "Balance Due" unless it is a specific line item.
      2. Do not double count entries.
      3. Ensure 'item_amount' is the final amount, 'item_rate' is unit price.
      4. If quantity is not stated, use 1.
      5. Return raw numbers (no currency symbols).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64 } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: billSchema,
        temperature: 0,
      },
    });

    if (!response.text) {
      throw new Error("No response from AI model.");
    }

    const data = JSON.parse(response.text);
    const usage = response.usageMetadata;

    res.json({
      is_success: true,
      token_usage: {
        total_tokens: usage?.totalTokenCount || 0,
        input_tokens: usage?.promptTokenCount || 0,
        output_tokens: usage?.candidatesTokenCount || 0,
      },
      data: data,
    });

  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      is_success: false,
      token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      data: null,
      error: error.message || "Internal Server Error"
    });
  }
});

// Catch-all route to serve React App for non-API requests
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Endpoint available at http://localhost:${PORT}/extract-bill-data`);
});
