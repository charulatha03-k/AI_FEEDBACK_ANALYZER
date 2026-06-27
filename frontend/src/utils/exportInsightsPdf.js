import { jsPDF } from 'jspdf';

const PROJECT_TITLE = 'AI Customer Feedback Analyzer';
const MARGIN = 20;
const LINE_HEIGHT = 6;

export function exportInsightsPdf({ overallSummary, recommendations }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(PROJECT_TITLE, MARGIN, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, MARGIN, y);
  y += 12;

  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, y, pageWidth - MARGIN, y);
  y += 10;

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  ensureSpace(20);
  doc.text('Overall Summary', MARGIN, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const summaryText = overallSummary || 'No summary generated yet.';
  const summaryLines = doc.splitTextToSize(summaryText, contentWidth);
  for (const line of summaryLines) {
    ensureSpace(LINE_HEIGHT + 2);
    doc.text(line, MARGIN, y);
    y += LINE_HEIGHT;
  }
  y += 8;

  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('AI Recommendations', MARGIN, y);
  y += 10;

  if (!recommendations || recommendations.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(11);
    doc.setTextColor(120, 120, 120);
    ensureSpace(LINE_HEIGHT);
    doc.text('No recommendations generated yet.', MARGIN, y);
  } else {
    recommendations.forEach((rec, idx) => {
      const priority = rec.priority || 'Medium';
      const title = rec.title || 'Recommendation';
      const description = rec.description || rec.problem || rec.action || '';
      const impact = rec.impact || 'Medium';

      ensureSpace(40);

      if (idx > 0) {
        doc.setDrawColor(220, 220, 220);
        doc.line(MARGIN, y, pageWidth - MARGIN, y);
        y += 8;
        ensureSpace(32);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(99, 102, 241);
      doc.text(`${priority} Priority`, MARGIN, y);
      y += 7;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);
      const titleLines = doc.splitTextToSize(title, contentWidth);
      for (const line of titleLines) {
        ensureSpace(LINE_HEIGHT + 1);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT + 1;
      }
      y += 2;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(60, 60, 60);
      const descLines = doc.splitTextToSize(description, contentWidth);
      for (const line of descLines) {
        ensureSpace(LINE_HEIGHT);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT;
      }
      y += 4;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 30, 30);
      ensureSpace(LINE_HEIGHT + 2);
      doc.text(`Expected Impact: ${impact}`, MARGIN, y);
      y += 10;
    });
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  doc.save(`ai_insights_report_${dateStamp}.pdf`);
}
