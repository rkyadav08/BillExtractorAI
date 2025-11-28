# BillExtractor AI - Hackathon Solution

This repository contains the full solution for the Medical Bill Data Extraction challenge.

## Project Structure

- **Frontend (`/src`)**: A React application to visualize the extraction process, upload files, and view the structured JSON output.
- **Backend (`server.js`)**: A Node.js Express server that exposes the required `POST /extract-bill-data` API endpoint.

## 🚀 Deployment Guide (Backend API)

To satisfy the hackathon requirement of submitting an API endpoint, you must deploy the **Backend**.

### Option A: Deploy to Render (Recommended & Free)

1.  **Push to GitHub**:
    - Create a new repository on GitHub.
    - Push all files in this folder to the repository.

2.  **Create Service on Render**:
    - Go to [dashboard.render.com](https://dashboard.render.com).
    - Click **New +** -> **Web Service**.
    - Connect your GitHub repository.

3.  **Configure Settings**:
    - **Name**: `bill-extractor-api`
    - **Runtime**: `Node`
    - **Build Command**: `npm install`
    - **Start Command**: `node server.js`

4.  **Set Environment Variables**:
    - Scroll down to "Environment Variables".
    - Key: `API_KEY`
    - Value: `your_actual_google_gemini_api_key`

5.  **Deploy**:
    - Click **Create Web Service**.
    - Wait for the build to finish. Render will provide you with a URL (e.g., `https://bill-extractor-api.onrender.com`).

6.  **Verify**:
    - Your API endpoint is now live at: `https://[your-url].onrender.com/extract-bill-data`

### Option B: Run Locally

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Set your API Key in a `.env` file:
    ```
    API_KEY=your_key_here
    ```
3.  Start the server:
    ```bash
    npm start
    ```
4.  Test with cURL:
    ```bash
    curl -X POST http://localhost:3000/extract-bill-data \
    -H "Content-Type: application/json" \
    -d '{"document": "https://hackrx.blob.core.windows.net/assets/datathon-IIT/sample_2.png"}'
    ```

## 🖥️ Frontend Application

The frontend is a visualization tool. To run it locally:

1.  Run `npm run dev`.
2.  Open the localhost link provided by Vite.

## API Specification

**Endpoint:** `POST /extract-bill-data`

**Request Body:**
```json
{
  "document": "https://public-url-to-image.png"
}
```

**Response:**
Returns a JSON object containing `is_success`, `token_usage`, and the structured `data`.