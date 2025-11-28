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
// Increase payload limit to handle large Base64 images
app.use(express.json({ limit: '50mb' }));

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

// Helper: Process input (URL or Base64) to get clean Base64 for Gemini
async function processDocumentInput(input) {
  // Case 1: Input is already a Data URI (Base64) - likely from File Upload
  if (input.startsWith('data:')) {
    const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return {
        mimeType: matches[1],
        base64: matches[2]
      };
    }
    // Fallback if regex fails but starts with data:
    return {
        mimeType: 'image/png',
        base64: input.split(',')[1]
    };
  }

  // Case 2: Input is a URL - Fetch it server-side to bypass CORS
  try {
    const response = await fetch(input);
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
    throw new Error("Could not access the provided document URL. Please ensure the link is publicly accessible.");
  }
}

// API Endpoint
app.post('/extract-bill-data', async (req, res) => {
  try {
    const { document: documentInput } = req.body;

    if (!documentInput) {
      return res.status(400).json({
        is_success: false,
        error: "Missing 'document' URL or data in request body.",
        token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
        data: null
      });
    }

    const { base64, mimeType } = await processDocumentInput(documentInput);

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
});
