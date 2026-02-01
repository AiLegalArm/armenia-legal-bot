import jsPDF from "jspdf";

// This will be populated with the base64 font data
let armenianFontBase64: string | null = null;
let fontLoadPromise: Promise<void> | null = null;

// Function to load the Armenian font
async function loadArmenianFont(): Promise<string> {
  if (armenianFontBase64) {
    return armenianFontBase64;
  }

  // Load the font file
  const response = await fetch('/fonts/NotoSansArmenian-Regular.ttf');
  if (!response.ok) {
    throw new Error('Failed to load Armenian font');
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  
  // Convert to base64
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  
  armenianFontBase64 = btoa(binary);
  return armenianFontBase64;
}

// Initialize font loading
export async function initializePDFFont(): Promise<void> {
  if (!fontLoadPromise) {
    fontLoadPromise = loadArmenianFont().then(() => {});
  }
  return fontLoadPromise;
}

// Register the Armenian font with jsPDF
export async function registerArmenianFont(doc: jsPDF): Promise<void> {
  const fontData = await loadArmenianFont();
  
  // Add the font to jsPDF's virtual file system
  doc.addFileToVFS("NotoSansArmenian-Regular.ttf", fontData);
  
  // Register the font
  doc.addFont("NotoSansArmenian-Regular.ttf", "NotoSansArmenian", "normal");
}

// Set Armenian font on document
export function setArmenianFont(doc: jsPDF): void {
  doc.setFont("NotoSansArmenian", "normal");
}

// Check if text contains Armenian characters
export function containsArmenian(text: string): boolean {
  // Armenian Unicode range: U+0530–U+058F
  return /[\u0530-\u058F]/.test(text);
}

// Check if text contains Cyrillic (Russian) characters
export function containsCyrillic(text: string): boolean {
  // Cyrillic Unicode range: U+0400–U+04FF
  return /[\u0400-\u04FF]/.test(text);
}
