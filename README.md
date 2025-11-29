# 🧾 Medical Bill Extractor AI

> **HackRx Datathon Solution**  
> An intelligent, high-precision document extraction system designed to parse complex medical invoices into structured JSON data using Google Gemini 2.5 Flash.

**🚀 Live Demo / API Base URL:** [https://rohitkumaryadav-manitbhopa.onrender.com](https://rohitkumaryadav-manitbhopa.onrender.com).
*Endpoint URL*: https://rohitkumaryadav-manitbhopa.onrender.com/extract-bill-data

## 📖 Overview

This project addresses the challenge of extracting granular line-item details from multi-page medical bills. Unlike standard OCR tools that merely return text, **BillExtractor AI** utilizes multimodal Large Language Models to understand the semantic structure of invoices. It ensures mathematical consistency, accurately differentiates between patient and insurance liabilities, and strictly adheres to data schemas for seamless downstream financial processing.

## 🚀 Key Features

*   **Multimodal Analysis**: Powered by **Google Gemini 2.5 Flash**, it processes visual document layouts directly (skipping error-prone OCR), resulting in superior accuracy for complex table alignments.
*   **High-Precision Auditing**: Implements rigorous "Auditor" logic to prevent double-counting by intelligently filtering out "Subtotal", "Total", "Balance", and "Brought Forward" rows.
*   **Smart Column Logic**: Automatically detects and prioritizes the correct price column (e.g., selecting "Company Amount" over zero-valued "Patient Amount" in insurance claims).
*   **Structured JSON Output**: Delivers data in a strict, standardized schema with page-wise categorization ("Bill Detail", "Final Bill", "Pharmacy") and consolidated item counts.
*   **Dual Interface**: Offers both a developer-friendly REST API (`POST /extract-bill-data`) for bulk processing and a React-based UI for real-time visual testing.
