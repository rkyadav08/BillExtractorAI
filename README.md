# 🧾 Medical Bill Extractor AI

> **HackRx Datathon Solution**  
> An intelligent, high-precision document extraction system designed to parse complex medical invoices into structured JSON data using Google Gemini 2.5 Flash.

![Project Banner](https://img.shields.io/badge/Status-Production%20Ready-success)
![Tech](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-blue)
![Stack](https://img.shields.io/badge/Stack-React%20%2B%20Node.js-orange)

**🚀 Live Demo / API Base URL:** `https://billextractorai.onrender.com/`

## 📖 Project Overview

This project addresses the challenge of extracting granular line-item details from multi-page medical bills. Unlike standard OCR tools that merely return text, **BillExtractor AI** understands the semantic structure of invoices.

It is engineered to:
1.  **Categorize Pages**: Distinguish between "Bill Details", "Final Bill" summaries, and "Pharmacy" lists.
2.  **Ensure Mathematical Consistency**: Intelligently ignores "Subtotal", "Total", and "Balance Due" lines to prevent double-counting—a critical requirement for accurate financial reconciliation.
3.  **Standardize Output**: Returns data in a strict, pre-defined JSON schema ready for downstream ERP or insurance processing.

## 🚀 Key Features

*   **Multimodal Analysis**: Uses **Google Gemini 2.5 Flash** to process visual document layouts directly (no intermediate OCR text conversion), resulting in higher accuracy for table alignments.
*   **Smart Filtering**: explicitly trained via system prompting to exclude summary rows to ensure the `total_item_count` and summation of line items match the actual bill total.
*   **Dual Interface**:
    *   **REST API**: A production-ready `POST /extract-bill-data` endpoint for integration.
    *   **Visualizer UI**: A React-based frontend to upload bills, preview extraction results, and debug JSON output in real-time.
*   **Deployment Ready**: Configured for immediate deployment on cloud platforms like Render or Railway.

## 🛠️ Tech Stack

*   **Core AI Model**: Google Gemini 2.5 Flash (`@google/genai` SDK)
*   **Backend**: Node.js, Express (REST API)
*   **Frontend**: React, TypeScript, Tailwind CSS, Lucide Icons
*   **Build Tool**: Vite

---

## 🔌 API Documentation

The solution exposes a single, stateless endpoint designed for bulk processing.

### `POST /extract-bill-data`

**Endpoint URL**: `https://[YOUR-RENDER-APP-NAME].onrender.com/extract-bill-data`

**Headers**:
`Content-Type: application/json`

**Request Body**:
```json
{
  "document": "https://hackrx.blob.core.windows.net/assets/datathon-IIT/sample_2.png?..."
}
```

**Success Response (200 OK)**:
```json
{
  "is_success": true,
  "token_usage": {
    "total_tokens": 850,
    "input_tokens": 400,
    "output_tokens": 450
  },
  "data": {
    "pagewise_line_items": [
      {
        "page_no": "1",
        "page_type": "Bill Detail",
        "bill_items": [
          {
            "item_name": "Consultation Charge",
            "item_amount": 500.00,
            "item_rate": 500.00,
            "item_quantity": 1.00
          }
        ]
      }
    ],
    "total_item_count": 1
  }
}
```

---

## 💻 Local Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/your-username/bill-extractor-ai.git
    cd bill-extractor-ai
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env` file in the root directory:
    ```env
    API_KEY=your_google_gemini_api_key_here
    PORT=3000
    ```

4.  **Run the Application**
    This command builds the frontend and starts the backend server:
    ```bash
    npm run build
    npm start
    ```

5.  **Access the App**
    *   **Frontend UI**: `http://localhost:3000`
    *   **API Endpoint**: `http://localhost:3000/extract-bill-data`

---

## ☁️ Deployment Guide (Render)

This project is configured for one-click deployment on Render.com.

1.  Push your code to a GitHub repository.
2.  Create a new **Web Service** on Render connected to your repo.
3.  Use the following settings:
    *   **Runtime**: Node
    *   **Build Command**: `npm install && npm run build` (optional if serving UI) or just `npm install`
    *   **Start Command**: `npm start`
4.  Add your `API_KEY` in the **Environment Variables** tab.
5.  **Important**: Once deployed, copy your Render URL (e.g., `https://bill-extractor-xyz.onrender.com`) and update your submission details.

## 🧪 Evaluation & Accuracy Strategy

To meet the hackathon's "Evaluation Criteria":
1.  **Prompt Engineering**: The system prompt specifically instructs the model to ignore rows containing keywords like "Total" or "Subtotal" unless they are line items, preventing the common AI pitfall of double-counting.
2.  **Schema Enforcement**: We use Gemini's `responseSchema` feature to strictly enforce integer/float types, ensuring no currency symbols (e.g., "$") pollute the data fields.

## 📝 License

This project is submitted for the HackRx Datathon.
