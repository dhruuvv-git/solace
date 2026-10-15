import { jsPDF } from 'jspdf';
import { istStamp } from './vault';

/**
 * Generate a formal PDF complaint/report document from Solace Report data and trigger download.
 * @param {object} r - Structured report from buildReport()
 */
export function generatePdfReport(r) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const checkPage = (needed = 24) => {
    if (y + needed > pageHeight - margin - 20) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
  };

  const drawHeader = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 150);
    doc.text('SOLACE RESPONSE DESK · FORMAL INCIDENT REPORT', margin, 24);
    doc.setDrawColor(220, 220, 230);
    doc.line(margin, 28, pageWidth - margin, 28);
  };

  drawHeader();

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 16, 40);
  doc.text((r.title || 'COMPLAINT / FIRST INFORMATION').toUpperCase(), margin, y);

  // Date top-right
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 100);
  const dateStr = `Date: ${r.date}`;
  doc.text(dateStr, pageWidth - margin - doc.getTextWidth(dateStr), y);
  y += 24;

  // Addressee
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 60);
  doc.text('To,', margin, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  for (const line of r.to || []) {
    checkPage(14);
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  // Subject
  checkPage(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 20, 50);
  const subjLines = doc.splitTextToSize(`Subject: ${r.subject || 'Incident Complaint'}`, contentWidth);
  for (const line of subjLines) {
    checkPage(14);
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  // Salutation
  checkPage(18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 50);
  doc.text('Respected Sir / Madam,', margin, y);
  y += 16;

  // Statement paragraphs
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 30, 40);
  for (const p of r.statement || []) {
    const pLines = doc.splitTextToSize(p, contentWidth);
    for (const l of pLines) {
      checkPage(14);
      doc.text(l, margin, y);
      y += 14;
    }
    y += 6;
  }
  y += 8;

  // Helper for section headings
  const sectionHeader = (title) => {
    checkPage(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(109, 40, 217); // Purple 700
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(216, 180, 254);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  // Helper for key-value tables
  const renderTable = (rows) => {
    if (!rows || rows.length === 0) return;
    const col1W = 160;
    const col2W = contentWidth - col1W - 8;
    for (const [k, v] of rows) {
      if (!v || v === '—') continue;
      const vLines = doc.splitTextToSize(String(v), col2W);
      const rowHeight = Math.max(16, vLines.length * 13 + 4);
      checkPage(rowHeight);

      // Light background row
      doc.setFillColor(250, 248, 255);
      doc.rect(margin, y - 10, contentWidth, rowHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(60, 50, 70);
      doc.text(String(k), margin + 6, y);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 40);
      let valY = y;
      for (const vl of vLines) {
        doc.text(vl, margin + col1W, valY);
        valY += 13;
      }
      y += rowHeight;
    }
    y += 10;
  };

  // 1. Incident Summary
  sectionHeader('1. Incident Summary');
  renderTable(r.summary);

  // 2. Accused / Suspect Details
  sectionHeader('2. Details of Person(s) Responsible');
  renderTable(r.accused);

  // 3. Links
  if (r.links && r.links.length > 0) {
    sectionHeader('3. Links to Content / Accounts');
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 80);
    r.links.forEach((link, idx) => {
      const linkLines = doc.splitTextToSize(`${idx + 1}. ${link}`, contentWidth);
      for (const ll of linkLines) {
        checkPage(13);
        doc.text(ll, margin + 4, y);
        y += 13;
      }
    });
    y += 10;
  }

  // 4. Provisions
  if (r.provisions && r.provisions.length > 0) {
    sectionHeader('4. Legal Provisions That May Apply');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 120);
    doc.text('Note: For the investigating officer to determine final sections.', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 50);
    r.provisions.forEach((prov) => {
      const provLines = doc.splitTextToSize(`• ${prov}`, contentWidth);
      for (const pl of provLines) {
        checkPage(13);
        doc.text(pl, margin + 4, y);
        y += 13;
      }
    });
    y += 10;
  }

  // 5. Requests
  if (r.requests && r.requests.length > 0) {
    sectionHeader('5. Relief / Actions Requested');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 40);
    r.requests.forEach((req, idx) => {
      const reqLines = doc.splitTextToSize(`${idx + 1}. ${req}`, contentWidth);
      for (const rl of reqLines) {
        checkPage(13);
        doc.text(rl, margin + 4, y);
        y += 13;
      }
    });
    y += 10;
  }

  // 6. Complainant
  sectionHeader('6. Complainant Details');
  renderTable(r.complainant);

  // 7. Annexures (Evidence Photos & Vault)
  if ((r.photos && r.photos.length > 0) || (r.vault && r.vault.length > 0)) {
    sectionHeader('7. Annexures & Cryptographic Proof');

    if (r.photos && r.photos.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(50, 40, 70);
      doc.text('Annexure A — Attached Evidence & Digital Photographs:', margin, y);
      y += 14;

      r.photos.forEach((p) => {
        checkPage(32);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(40, 30, 60);
        doc.text(`[${p.label}] ${p.caption || p.name}`, margin + 6, y);
        y += 12;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 100);
        doc.text(`${p.meta || ''}`, margin + 12, y);
        y += 11;

        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(109, 40, 217);
        doc.text(`SHA-256 Fingerprint: ${p.hash}`, margin + 12, y);
        y += 14;
      });
      y += 6;
    }

    if (r.vault && r.vault.length > 0) {
      checkPage(24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(50, 40, 70);
      doc.text('Annexure B — Additional Sealed Items in Solace Evidence Vault:', margin, y);
      y += 14;

      r.vault.forEach((v, i) => {
        checkPage(28);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(40, 30, 60);
        doc.text(`B-${i + 1}. ${v.name} (Sealed: ${istStamp(v.sealedAt)})`, margin + 6, y);
        y += 11;

        doc.setFont('courier', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(109, 40, 217);
        doc.text(`SHA-256 Fingerprint: ${v.hash}`, margin + 12, y);
        y += 14;
      });
    }
    y += 10;
  }

  // Declaration & Signatures
  checkPage(70);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 90);
  doc.text('I declare that the information given above is true and correct to the best of my knowledge and belief.', margin, y);
  y += 24;

  const leftSign = `Place: ${r.place || '—'}\nDate: ${r.date}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 50);
  doc.text(leftSign, margin, y);

  const rightSign = `______________________________\nSignature\n${r.signName || 'Complainant'}`;
  const rightSignLines = rightSign.split('\n');
  let signY = y;
  for (const sl of rightSignLines) {
    const slW = doc.getTextWidth(sl);
    doc.text(sl, pageWidth - margin - slW, signY);
    signY += 13;
  }

  // Add page numbers at footer on all pages
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 160);
    const footerText = `Page ${i} of ${totalPages} · Solace Privacy-First Incident Desk`;
    doc.text(footerText, pageWidth / 2 - doc.getTextWidth(footerText) / 2, pageHeight - 16);
  }

  const filename = `solace-complaint-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}
