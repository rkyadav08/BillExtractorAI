import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";
import { Buffer } from 'node:buffer';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// Maximum limit for large PDFs
app.use(express.json({ limit: '50mb' }));

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

// STRICT SCHEMA - Matches Hackathon Requirements exactly
const billSchema = {
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
            // STRICTLY ENFORCED 3 TYPES
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

async function processDocumentInput(input) {
  if (input.startsWith('data:')) {
    const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      return { mimeType: matches[1], base64: matches[2] };
    }
    return { mimeType: 'application/pdf', base64: input.split(',')[1] };
  }

  try {
    const response = await fetch(input);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Explicit PDF detection for multi-page support
    let mimeType = response.headers.get('content-type');
    const urlLower = input.toLowerCase().split('?')[0];
    
    if (urlLower.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (urlLower.endsWith('.png')) mimeType = 'image/png';
    else if (urlLower.endsWith('.jpg')) mimeType = 'image/jpeg';
    
    if (!mimeType || mimeType === 'application/octet-stream') {
        mimeType = urlLower.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg';
    }

    return { base64: buffer.toString('base64'), mimeType };
  } catch (error) {
    throw new Error("Could not fetch document.");
  }
}

app.post('/extract-bill-data', async (req, res) => {
  try {
    const { document: documentInput } = req.body;
    if (!documentInput) return res.status(400).json({ is_success: false, error: "No document provided" });

    const { base64, mimeType } = await processDocumentInput(documentInput);

    // HYPER-OPTIMIZED PROMPT
    // Direct instructions, no fluff, fast execution.
    const prompt = `
    EXTRACT MEDICAL BILL DATA.
    
    RULES:
    1. CLASSIFY PAGES STRICTLY:
       - "Final Bill": Summary categories (Room, Lab, etc).
       - "Pharmacy": Medicines/drugs receipt.
       - "Bill Detail": Detailed tests/services list.
    2. DATA:
       - Extract line items from ALL pages.
       - EXCLUDE totals/subtotals.
       - If Rate/Qty missing, use 0.0.
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
        temperature: 0, // Max speed, zero creativity
      },
    });

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
    console.error("Error:", error);
    res.status(500).json({
      is_success: false,
      token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      data: null,
      error: error.message
    });
  }
});

// Root route for status check
app.get('/', (req, res) => {
  res.status(200).send('BillExtractor AI API is running. Send POST requests to /extract-bill-data');
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
