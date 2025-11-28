import { ApiResponse } from "../types";

export const extractBillData = async (
  documentSource: string, 
  _apiKey?: string 
): Promise<ApiResponse> => {
  try {
    // We send the document (URL or Base64) to our own backend.
    // The backend handles the image fetching (bypassing CORS) and the Gemini API call.
    const response = await fetch('/extract-bill-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ document: documentSource }),
    });

    const result = await response.json();
    return result;
  } catch (error: any) {
    console.error("Service Error:", error);
    return {
      is_success: false,
      token_usage: { total_tokens: 0, input_tokens: 0, output_tokens: 0 },
      data: null,
      error: error.message || "Failed to communicate with the backend server. Ensure the server is running.",
    };
  }
};
