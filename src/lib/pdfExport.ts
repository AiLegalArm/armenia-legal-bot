import jsPDF from "jspdf";

interface AnalysisExportData {
  caseNumber: string;
  caseTitle: string;
  role: string;
  analysisText: string;
  sources?: Array<{ title: string; category: string; source_name: string }>;
  createdAt: Date;
  language?: "hy" | "en";
}

const DISCLAIMER_HY = "\u26A0\uFE0F \u0546\u0531\u053D\u0531\u0536\u0533\u0548\u0552\u0548\u0552\u054A\u054F\u0545\u0548\u0552\u0546: \u054D\u0578\u0582\u0575\u0576 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576\u0568 \u0576\u0561\u056D\u0561\u057F\u0565\u057D\u057E\u0561\u056E \u0567 \u0574\u056B\u0561\u0575\u0576 \u057F\u0565\u0572\u0565\u056F\u0561\u057F\u057E\u0561\u056F\u0561\u0576 \u0576\u057A\u0561\u057F\u0561\u056F\u0576\u0565\u0580\u0578\u057E \u0587 \u0579\u056B \u0570\u0561\u0576\u0564\u056B\u057D\u0561\u0576\u0578\u0582\u0574 \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0578\u0582\u0569\u0575\u0578\u0582\u0576. \u0544\u056B\u0577\u057F \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u056F\u0581\u0565\u0584 \u056C\u056B\u0581\u0565\u0576\u0566\u0561\u057E\u0578\u0580\u057E\u0561\u056E \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u056B \u0570\u0565\u057F. \u0531\u0580\u0564\u0575\u0578\u0582\u0576\u0584\u0576\u0565\u0580\u0568 \u056D\u0578\u0580\u0570\u0580\u0564\u0561\u057F\u057E\u0561\u056F\u0561\u0576 \u0565\u0576 \u0587 \u0578\u0579 \u0574\u0565\u056F \u056B\u0580\u0561\u057E\u0561\u0562\u0561\u0576\u0561\u056F\u0561\u0576 \u0578\u0582\u056A \u0579\u0578\u0582\u0576\u0565\u0576.";

const DISCLAIMER_EN = "\u26A0\uFE0F DISCLAIMER: This analysis is for informational purposes only and does not constitute legal advice. Always consult with a licensed attorney for legal matters. The results are advisory and have no legal force. Processing is compliant with the RA Personal Data Protection Law.";


// Helper function to add header with case number and export date
function addHeader(doc: jsPDF, caseNumber: string, exportDate: Date, language: "hy" | "en" = "hy") {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  
  doc.saveGraphicsState();
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text("Ai Legal Armenia", margin, 12);
  
  const locale = language === 'hy' ? 'hy-AM' : 'en-US';
  const dateStr = exportDate.toLocaleDateString(locale);
  const caseLabel = language === 'hy' ? 'Գործ' : 'Case';
  
  doc.text(`${caseLabel}: ${caseNumber}`, pageWidth / 2, 12, { align: "center" });
  doc.text(dateStr, pageWidth - margin, 12, { align: "right" });
  doc.restoreGraphicsState();
}

// Helper function to add footer with disclaimer
function addFooter(doc: jsPDF, disclaimer: string, pageNumber: number, totalPages: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 25;
  
  doc.saveGraphicsState();
  
  // Separator line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 3, pageWidth - margin, footerY - 3);
  
  // Disclaimer text
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  const disclaimerLines = doc.splitTextToSize(disclaimer, maxWidth);
  doc.text(disclaimerLines, margin, footerY);
  
  // Page number
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`${pageNumber} / ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: "center" });
  
  doc.restoreGraphicsState();
}

interface CaseDetailExportData {
  caseNumber: string;
  caseTitle: string;
  description?: string;
  facts?: string;
  legalQuestion?: string;
  status: string;
  priority: string;
  courtName?: string;
  courtDate?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  files?: Array<{ original_filename: string; file_size: number; created_at: string }>;
  timeline?: Array<{ type: string; title: string; description?: string; timestamp: string }>;
  userName?: string;
  language?: "hy" | "en";
}

export function exportAnalysisToPDF(data: AnalysisExportData): void {
  const doc = new jsPDF();
  const isArmenian = data.language === "hy";
  const disclaimer = isArmenian ? DISCLAIMER_HY : DISCLAIMER_EN;
  const exportDate = new Date();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 18;
  const contentBottomMargin = 35;
  
  // Add header to first page
  addHeader(doc, data.caseNumber, exportDate, data.language);
  
  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u053B\u054A\u0531\u054E\u0531\u0532\u0531\u0546\u0531\u053F\u0531\u0546 \u054E\u0535\u054C\u053C\u0548\u0552\u0538\u054F\u0545\u0548\u0552\u0546" : "LEGAL ANALYSIS REPORT", pageWidth / 2, 25, { align: "center" });
  
  // Case info
  doc.setFontSize(12);
  let yPosition = 35;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u0533\u0578\u0580\u056E\u056B \u0570\u0561\u0574\u0561\u0580:" : "Case Number:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.caseNumber, margin + 45, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u0533\u0578\u0580\u056E\u056B \u057E\u0565\u0580\u0576\u0561\u0563\u056B\u0580:" : "Case Title:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  const titleLines = doc.splitTextToSize(data.caseTitle, maxWidth - 40);
  doc.text(titleLines, margin + 35, yPosition);
  yPosition += titleLines.length * 6 + 4;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0561\u0576 \u0564\u0565\u0580:" : "Analysis Role:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  const roleLabels: Record<string, Record<string, string>> = {
    advocate: { hy: "\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576 (\u054A\u0561\u0577\u057F\u057A\u0561\u0576)", en: "Advocate (Defense)" },
    prosecutor: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572", en: "Prosecutor" },
    judge: { hy: "\u0534\u0561\u057F\u0561\u057E\u0578\u0580", en: "Judge" },
    aggregator: { hy: "\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Complete Analysis" }
  };
  doc.text(roleLabels[data.role]?.[data.language || "hy"] || data.role, margin + 40, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u0531\u0574\u057D\u0561\u0569\u056B\u057E:" : "Date:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.createdAt.toLocaleString(data.language === 'hy' ? "hy-AM" : "en-US"), margin + 25, yPosition);
  yPosition += 15;
  
  // Separator line
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // Analysis content
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "\u054E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576" : "Analysis", margin, yPosition);
  yPosition += 10;
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  // Split analysis text into lines
  const analysisLines = doc.splitTextToSize(data.analysisText, maxWidth);
  
  for (const line of analysisLines) {
    if (yPosition > pageHeight - contentBottomMargin) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, data.language);
      yPosition = contentTopMargin;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0);
    }
    doc.text(line, margin, yPosition);
    yPosition += 5;
  }
  
  // Sources
  if (data.sources && data.sources.length > 0) {
    yPosition += 10;
    
    if (yPosition > pageHeight - contentBottomMargin - 20) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, data.language);
      yPosition = contentTopMargin;
    }
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "\u0555\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0561\u056E \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580" : "Sources Used", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    data.sources.forEach((source, index) => {
      if (yPosition > pageHeight - contentBottomMargin) {
        doc.addPage();
        addHeader(doc, data.caseNumber, exportDate, data.language);
        yPosition = contentTopMargin;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
      }
      doc.text(`${index + 1}. ${source.title} (${source.category}) - ${source.source_name}`, margin, yPosition);
      yPosition += 5;
    });
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, disclaimer, i, totalPages);
  }
  
  // Save
  const filename = `AI_Legal_${data.caseNumber}_${data.role}_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

export function exportMultipleAnalysesToPDF(
  caseNumber: string,
  caseTitle: string,
  analyses: Array<{ role: string; text: string; sources?: Array<{ title: string; category: string; source_name: string }> }>,
  language: "hy" | "en" = "hy"
): void {
  const doc = new jsPDF();
  const isArmenian = language === "hy";
  const disclaimer = isArmenian ? DISCLAIMER_HY : DISCLAIMER_EN;
  const exportDate = new Date();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 18;
  const contentBottomMargin = 35;
  
  // Title page
  addHeader(doc, caseNumber, exportDate, language);
  
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("Ai Legal Armenia", pageWidth / 2, 50, { align: "center" });
  
  doc.setFontSize(18);
  doc.text(isArmenian ? "\u053C\u053B\u0531\u053F\u0531\u054F\u0531\u054C \u0533\u0548\u054C\u053E\u053B \u054E\u0535\u054C\u053C\u0548\u0552\u0538\u054F\u0545\u0548\u0552\u0546" : "COMPLETE CASE ANALYSIS", pageWidth / 2, 75, { align: "center" });
  
  doc.setFontSize(14);
  doc.text(`${isArmenian ? "\u0533\u0578\u0580\u056E:" : "Case:"} ${caseNumber}`, pageWidth / 2, 100, { align: "center" });
  
  const titleLines = doc.splitTextToSize(caseTitle, maxWidth);
  doc.text(titleLines, pageWidth / 2, 115, { align: "center" });
  
  doc.setFontSize(12);
  const locale = language === 'hy' ? 'hy-AM' : 'en-US';
  doc.text(exportDate.toLocaleDateString(locale), pageWidth / 2, 140, { align: "center" });
  
  // Role labels
  const roleLabels: Record<string, Record<string, string>> = {
    advocate: { hy: "\u0553\u0561\u057D\u057F\u0561\u0562\u0561\u0576 (\u054A\u0561\u0577\u057F\u057A\u0561\u0576)", en: "Advocate (Defense)" },
    prosecutor: { hy: "\u0544\u0565\u0572\u0561\u0564\u0580\u0578\u0572", en: "Prosecutor" },
    judge: { hy: "\u0534\u0561\u057F\u0561\u057E\u0578\u0580", en: "Judge" },
    aggregator: { hy: "\u053C\u056B\u0561\u056F\u0561\u057F\u0561\u0580 \u057E\u0565\u0580\u056C\u0578\u0582\u056E\u0578\u0582\u0569\u0575\u0578\u0582\u0576", en: "Complete Analysis" }
  };
  
  // Each analysis on new page
  for (const analysis of analyses) {
    doc.addPage();
    
    // Header
    addHeader(doc, caseNumber, exportDate, language);
    
    // Analysis Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0);
    doc.text(roleLabels[analysis.role]?.[language] || analysis.role, margin, 25);
    doc.setFont("helvetica", "normal");
    
    let yPosition = 35;
    
    // Analysis content
    doc.setFontSize(10);
    const analysisLines = doc.splitTextToSize(analysis.text, maxWidth);
    
    for (const line of analysisLines) {
      if (yPosition > pageHeight - contentBottomMargin) {
        doc.addPage();
        addHeader(doc, caseNumber, exportDate, language);
        yPosition = contentTopMargin;
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(0);
      }
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    
    // Sources
    if (analysis.sources && analysis.sources.length > 0) {
      yPosition += 10;
      
      if (yPosition > pageHeight - contentBottomMargin - 20) {
        doc.addPage();
        addHeader(doc, caseNumber, exportDate, language);
        yPosition = contentTopMargin;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(isArmenian ? "\u0555\u0563\u057F\u0561\u0563\u0578\u0580\u056E\u057E\u0561\u056E \u0561\u0572\u0562\u0575\u0578\u0582\u0580\u0576\u0565\u0580" : "Sources Used", margin, yPosition);
      yPosition += 8;
      
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      
      analysis.sources.forEach((source, index) => {
        if (yPosition > pageHeight - contentBottomMargin) {
          doc.addPage();
          addHeader(doc, caseNumber, exportDate, language);
          yPosition = contentTopMargin;
          doc.setFontSize(9);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0);
        }
        doc.text(`${index + 1}. ${source.title} (${source.category}) - ${source.source_name}`, margin, yPosition);
        yPosition += 5;
      });
    }
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, disclaimer, i, totalPages);
  }
  
  const filename = `AI_Legal_${caseNumber}_Full_Analysis_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}

export function exportCaseDetailToPDF(data: CaseDetailExportData): void {
  const doc = new jsPDF();
  const isArmenian = data.language === "hy";
  const disclaimer = isArmenian ? DISCLAIMER_HY : DISCLAIMER_EN;
  const exportDate = new Date();
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const contentTopMargin = 18;
  const contentBottomMargin = 35;
  
  // Add header
  addHeader(doc, data.caseNumber, exportDate, data.language);
  
  let yPosition = 20;
  
  // Check page overflow helper
  const checkPageOverflow = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - contentBottomMargin) {
      doc.addPage();
      addHeader(doc, data.caseNumber, exportDate, data.language);
      yPosition = contentTopMargin;
      doc.setFontSize(10);
      doc.setTextColor(0);
      return true;
    }
    return false;
  };
  
  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "ԳՈՐԾԻ ՄԱՆՐԱՄԱՍՆԵՐ" : "CASE DETAILS", pageWidth / 2, yPosition, { align: "center" });
  doc.setFont("helvetica", "normal");
  yPosition += 15;
  
  // Case Number and Title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Գործի համար:" : "Case Number:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.caseNumber, margin + 40, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Վերնագիր:" : "Title:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  const titleLines = doc.splitTextToSize(data.caseTitle, maxWidth - 30);
  doc.text(titleLines, margin + 30, yPosition);
  yPosition += titleLines.length * 6 + 8;
  
  // Status and Priority
  checkPageOverflow(16);
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Կարգավիճակ:" : "Status:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.status, margin + 35, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Առաջնահերթություն:" : "Priority:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.priority, margin + 55, yPosition);
  yPosition += 8;
  
  // Court information
  if (data.courtName) {
    checkPageOverflow(8);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Դատարան:" : "Court:", margin, yPosition);
    doc.setFont("helvetica", "normal");
    const courtLines = doc.splitTextToSize(data.courtName, maxWidth - 30);
    doc.text(courtLines, margin + 30, yPosition);
    yPosition += courtLines.length * 6 + 4;
  }
  
  if (data.courtDate) {
    checkPageOverflow(8);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Դատական նիստ:" : "Court Date:", margin, yPosition);
    doc.setFont("helvetica", "normal");
    doc.text(data.courtDate, margin + 40, yPosition);
    yPosition += 8;
  }
  
  // Dates
  checkPageOverflow(16);
  const locale = data.language === 'hy' ? 'hy-AM' : 'en-US';
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Ստեղծվել է:" : "Created:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.createdAt.toLocaleString(locale), margin + 35, yPosition);
  yPosition += 8;
  
  doc.setFont("helvetica", "bold");
  doc.text(isArmenian ? "Թարմացվել է:" : "Updated:", margin, yPosition);
  doc.setFont("helvetica", "normal");
  doc.text(data.updatedAt.toLocaleString(locale), margin + 35, yPosition);
  yPosition += 15;
  
  // Separator
  doc.setDrawColor(200);
  doc.setLineWidth(0.5);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 10;
  
  // Description
  if (data.description) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Նկարագրություն" : "Description", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const descLines = doc.splitTextToSize(data.description, maxWidth);
    
    for (const line of descLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Facts
  if (data.facts) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Փաստական հանգամանքներ" : "Facts", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const factsLines = doc.splitTextToSize(data.facts, maxWidth);
    
    for (const line of factsLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Legal Question
  if (data.legalQuestion) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Իրավական հարց" : "Legal Question", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const legalLines = doc.splitTextToSize(data.legalQuestion, maxWidth);
    
    for (const line of legalLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Notes
  if (data.notes) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Նշումներ" : "Notes", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const notesLines = doc.splitTextToSize(data.notes, maxWidth);
    
    for (const line of notesLines) {
      checkPageOverflow(5);
      doc.text(line, margin, yPosition);
      yPosition += 5;
    }
    yPosition += 10;
  }
  
  // Attached Files
  if (data.files && data.files.length > 0) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Կցված ֆայլեր" : "Attached Files", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    data.files.forEach((file, index) => {
      checkPageOverflow(6);
      const sizeKB = (file.file_size / 1024).toFixed(2);
      doc.text(`${index + 1}. ${file.original_filename} (${sizeKB} KB) - ${new Date(file.created_at).toLocaleDateString(locale)}`, margin, yPosition);
      yPosition += 5;
    });
    yPosition += 10;
  }
  
  // Timeline
  if (data.timeline && data.timeline.length > 0) {
    checkPageOverflow(20);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(isArmenian ? "Ժամանակագրություն" : "Timeline", margin, yPosition);
    yPosition += 8;
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    
    data.timeline.forEach((event) => {
      checkPageOverflow(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${new Date(event.timestamp).toLocaleString(locale)} - ${event.title}`, margin, yPosition);
      yPosition += 5;
      
      if (event.description) {
        doc.setFont("helvetica", "normal");
        const descLines = doc.splitTextToSize(`  ${event.description}`, maxWidth);
        for (const line of descLines) {
          checkPageOverflow(4);
          doc.text(line, margin, yPosition);
          yPosition += 4;
        }
      }
      yPosition += 2;
    });
  }
  
  // Add footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addFooter(doc, disclaimer, i, totalPages);
  }
  
  // Save
  const filename = `AI_Legal_${data.caseNumber}_Details_${exportDate.toISOString().split("T")[0]}.pdf`;
  doc.save(filename);
}