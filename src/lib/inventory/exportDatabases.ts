import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { trackClientAuditEvent } from "@/lib/audit/client";
import { InventoryItem } from "@/types/inventory";

const UX_LOGO_PATH = "/logo-dark.png";
const UX_WEBSITE = "https://ux.technology/";

const DB_COLUMNS = ["Provider", "Cuenta", "Base de datos", "Motor", "Versión", "Estado", "Endpoint", "Último Patch", "Estado Act.", "Observación"] as const;

const EXCEL_COLORS = {
  navy: "FF14182D",
  navySoft: "FF202640",
  purple: "FF7439BE",
  magenta: "FFCF39A5",
  cyan: "FF11A8CD",
  ink: "FF202437",
  muted: "FF697386",
  line: "FFDCE2EB",
  soft: "FFF5F7FB",
  white: "FFFFFFFF",
  green: "FF2CBE7A",
  amber: "FFF2B84B",
  red: "FFE35D6A",
};

const PDF_COLORS = {
  ink: [20, 24, 45] as [number, number, number],
  purple: [116, 57, 190] as [number, number, number],
  magenta: [207, 57, 165] as [number, number, number],
  cyan: [17, 168, 205] as [number, number, number],
  muted: [100, 108, 125] as [number, number, number],
  line: [222, 226, 235] as [number, number, number],
  soft: [246, 247, 251] as [number, number, number],
};

function engineOf(item: InventoryItem): string {
  return item.operatingSystem || item.engine || "N/A";
}

function versionOf(item: InventoryItem): string {
  return item.engineVersion || "N/A";
}

function buildDbRows(rows: InventoryItem[]) {
  return rows.map((row) => ({
    Provider: row.provider ?? "N/A",
    Cuenta: row.accountName || "N/A",
    "Base de datos": row.name || "N/A",
    Motor: engineOf(row),
    "Versión": versionOf(row),
    Estado: row.status || "N/A",
    Endpoint: row.host || "N/A",
    "Último Patch": row.latestPatch || "—",
    "Estado Act.": row.updateStatus || "—",
    "Observación": row.updateObservation || "",
  }));
}

function isRunning(status: string) {
  return ["running", "available", "active", "ok", "in-use", "associated"].includes(status.toLowerCase());
}

// ── Excel ──

export async function exportDatabasesToExcel(
  rows: InventoryItem[],
  filename = "databases-report.xlsx",
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  const logoData = await loadImageData(UX_LOGO_PATH);
  const logoId = logoData
    ? workbook.addImage({ base64: logoData, extension: "png" })
    : undefined;

  workbook.creator = "UX Technology";
  workbook.lastModifiedBy = "UX Technology";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  workbook.company = "UX Technology";
  workbook.title = "MC Inventory | Reporte de bases de datos";
  workbook.subject = "Inventario de bases de datos cloud";
  workbook.description = "Reporte generado desde MC Inventory.";

  // Summary sheet
  const summarySheet = workbook.addWorksheet("Resumen");
  setupSheet(summarySheet, 10, EXCEL_COLORS.cyan);
  [14, 24, 30, 20, 14, 16, 30, 16, 16, 30].forEach((w, i) => { summarySheet.getColumn(i + 1).width = w; });
  addBranding(summarySheet, logoId, "MC Inventory | Reporte de bases de datos", "Resumen ejecutivo", generatedAt, 10);

  const awsCount = rows.filter((r) => r.provider === "AWS").length;
  const hwCount = rows.filter((r) => r.provider === "HUAWEI CLOUD").length;
  const runningCount = rows.filter((r) => isRunning(r.status)).length;
  const metrics: [string, number, string, string][] = [
    ["TOTAL", rows.length, "Bases de datos", EXCEL_COLORS.cyan],
    ["AWS RDS", awsCount, "Amazon RDS / DocumentDB / ElastiCache", EXCEL_COLORS.amber],
    ["HUAWEI", hwCount, "Huawei Cloud RDS / DDS", EXCEL_COLORS.red],
    ["DISPONIBLES", runningCount, "Estado operativo", EXCEL_COLORS.green],
  ];
  metrics.forEach(([label, value, detail, color], index) => {
    const col = 1 + index * 2;
    styleRange(summarySheet, 6, col, 9, col + 1, { fill: EXCEL_COLORS.white, border: EXCEL_COLORS.line });
    summarySheet.mergeCells(6, col, 6, col + 1);
    summarySheet.mergeCells(7, col, 8, col + 1);
    summarySheet.mergeCells(9, col, 9, col + 1);
    const labelCell = summarySheet.getCell(6, col);
    labelCell.value = label;
    labelCell.fill = solidFill(color);
    labelCell.font = { name: "Aptos", size: 9, bold: true, color: colorObj(EXCEL_COLORS.white) };
    labelCell.alignment = { horizontal: "center", vertical: "middle" };
    const valueCell = summarySheet.getCell(7, col);
    valueCell.value = value;
    valueCell.font = { name: "Aptos Display", size: 24, bold: true, color: colorObj(EXCEL_COLORS.navy) };
    valueCell.alignment = { horizontal: "center", vertical: "middle" };
    valueCell.numFmt = "#,##0";
    const detailCell = summarySheet.getCell(9, col);
    detailCell.value = detail;
    detailCell.fill = solidFill(EXCEL_COLORS.soft);
    detailCell.font = { name: "Aptos", size: 9, color: colorObj(EXCEL_COLORS.muted) };
    detailCell.alignment = { horizontal: "center", vertical: "middle" };
  });
  [6, 7, 8, 9].forEach((r) => { summarySheet.getRow(r).height = r === 7 || r === 8 ? 27 : 22; });

  // Data sheet
  const dataSheet = workbook.addWorksheet("Bases de datos");
  const columns = [...DB_COLUMNS];
  setupSheet(dataSheet, columns.length, EXCEL_COLORS.purple);
  [14, 24, 30, 20, 14, 16, 30, 16, 16, 30].forEach((w, i) => { dataSheet.getColumn(i + 1).width = w; });
  addBranding(dataSheet, logoId, "UX Technology | Bases de datos", "Detalle de bases de datos cloud", generatedAt, columns.length);

  // Header row
  const headerRow = dataSheet.getRow(5);
  headerRow.values = columns;
  headerRow.height = 28;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.fill = solidFill(EXCEL_COLORS.navySoft);
    cell.font = { name: "Aptos", size: 9, bold: true, color: colorObj(EXCEL_COLORS.white) };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = borderObj(EXCEL_COLORS.navySoft);
  });

  // Data rows
  const dbRows = buildDbRows(rows);
  dbRows.forEach((record, index) => {
    const row = dataSheet.getRow(6 + index);
    row.values = columns.map((c) => record[c] ?? "");
    row.height = 22;
    columns.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      cell.fill = solidFill(index % 2 === 0 ? EXCEL_COLORS.white : EXCEL_COLORS.soft);
      cell.font = { name: "Aptos", size: 10, color: colorObj(EXCEL_COLORS.ink) };
      cell.border = borderObj(EXCEL_COLORS.line);
      cell.alignment = { vertical: "middle" };
      if (col === "Estado") styleStatus(cell);
    });
  });

  const lastRow = Math.max(dbRows.length + 5, 5);
  dataSheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastRow, column: columns.length } };
  dataSheet.views = [{ state: "frozen", ySplit: 5, topLeftCell: "A6", showGridLines: false }];

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBuffer(buffer, filename);
  trackClientAuditEvent("export.triggered", {
    category: "export",
    metadata: { module: "databases", format: "xlsx", rowCount: rows.length },
  });
}

// ── PDF ──

export async function exportDatabasesToPDF(
  rows: InventoryItem[],
  filename = "databases-report.pdf",
): Promise<void> {
  const logoData = await loadImageData(UX_LOGO_PATH);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const generatedAt = new Date().toLocaleString("es-CO");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cover
  doc.setFillColor(250, 250, 253);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  drawBrandBand(doc, 132);
  drawLogo(doc, logoData, 44, 28, 126, 67, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("REPORTE CORPORATIVO", pageWidth - 44, 51, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text("UX Technology", pageWidth - 44, 67, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFontSize(28);
  doc.text("Reporte de bases de datos", 44, 188);
  doc.setFontSize(15);
  doc.setTextColor(...PDF_COLORS.purple);
  doc.text("MC Inventory", 44, 216);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("Inventario de bases de datos cloud — AWS y Huawei Cloud.", 44, 246);

  const awsCount = rows.filter((r) => r.provider === "AWS").length;
  const hwCount = rows.filter((r) => r.provider === "HUAWEI CLOUD").length;
  const runningCount = rows.filter((r) => isRunning(r.status)).length;
  const metrics: [string, string, [number, number, number]][] = [
    ["TOTAL", rows.length.toLocaleString("es-CO"), PDF_COLORS.purple],
    ["AWS", awsCount.toLocaleString("es-CO"), PDF_COLORS.cyan],
    ["HUAWEI", hwCount.toLocaleString("es-CO"), PDF_COLORS.magenta],
    ["DISPONIBLES", runningCount.toLocaleString("es-CO"), [36, 166, 126] as [number, number, number]],
  ];
  const gap = 12;
  const cardW = (pageWidth - 88 - gap * 3) / 4;
  metrics.forEach(([label, value, color], index) => {
    const x = 44 + index * (cardW + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.roundedRect(x, 300, cardW, 76, 9, 9, "FD");
    doc.setFillColor(...color);
    doc.roundedRect(x, 300, 5, 76, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label, x + 18, 327);
    doc.setFontSize(24);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.text(value, x + 18, 358);
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(`Generado: ${generatedAt}`, 44, 420);
  doc.text("UX Technology | MC Inventory", 44, pageHeight - 42);

  // Data page
  doc.addPage();
  drawReportHeader(doc, logoData, "Bases de datos");

  const dbRows = buildDbRows(rows);
  const head = [["Provider", "Cuenta", "Base de datos", "Motor", "Versión", "Estado", "Endpoint", "Último Patch", "Estado Act.", "Observación"]];
  const body = dbRows.map((r) => [
    r.Provider,
    r.Cuenta,
    r["Base de datos"],
    r.Motor,
    r["Versión"],
    r.Estado,
    r.Endpoint,
    r["Último Patch"],
    r["Estado Act."],
    r["Observación"],
  ]);

  autoTable(doc, {
    startY: 78,
    head,
    body,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 4, textColor: PDF_COLORS.ink, lineColor: PDF_COLORS.line, lineWidth: 0.4 },
    headStyles: { fillColor: PDF_COLORS.ink, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: PDF_COLORS.soft },
    margin: { top: 72, right: 36, bottom: 38, left: 36 },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 80 },
      2: { cellWidth: 110 },
      3: { cellWidth: 70 },
      4: { cellWidth: 50 },
      5: { cellWidth: 50 },
      6: { cellWidth: 140 },
      7: { cellWidth: 50 },
      8: { cellWidth: 50 },
      9: { cellWidth: 80 },
    },
    didDrawPage: ({ doc: d }) => drawReportHeader(d, logoData, "Bases de datos"),
  });

  // Footers
  const pages = doc.getNumberOfPages();
  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(36, pageHeight - 28, pageWidth - 36, pageHeight - 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("UX Technology | MC Inventory", 36, pageHeight - 14);
    doc.text(`Pagina ${p - 1} de ${pages - 1}`, pageWidth - 36, pageHeight - 14, { align: "right" });
  }

  doc.save(filename);
  trackClientAuditEvent("export.triggered", {
    category: "export",
    metadata: { module: "databases", format: "pdf", rowCount: rows.length },
  });
}

// ── Helpers ──

function setupSheet(sheet: ExcelJS.Worksheet, lastCol: number, tabColor: string) {
  sheet.properties.defaultRowHeight = 20;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  sheet.headerFooter = { oddFooter: `&LUX Technology | MC Inventory&C&"Aptos,Regular"Pagina &P de &N` };
  sheet.properties.tabColor = { argb: tabColor };
  for (let c = 1; c <= lastCol; c++) sheet.getColumn(c).alignment = { vertical: "middle" };
}

function addBranding(sheet: ExcelJS.Worksheet, logoId: number | undefined, title: string, subtitle: string, date: Date, lastCol: number) {
  const titleCol = logoId ? 3 : 1;
  styleRange(sheet, 1, 1, 3, lastCol, { fill: EXCEL_COLORS.navy, border: EXCEL_COLORS.navy });
  if (logoId) sheet.addImage(logoId, { tl: { col: 0.18, row: 0.18 }, ext: { width: 136, height: 73 } });
  sheet.mergeCells(1, titleCol, 2, lastCol);
  sheet.mergeCells(3, titleCol, 3, lastCol);
  const tc = sheet.getCell(1, titleCol);
  tc.value = title;
  tc.font = { name: "Aptos Display", size: 17, bold: true, color: colorObj(EXCEL_COLORS.white) };
  tc.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  const sc = sheet.getCell(3, titleCol);
  sc.value = subtitle;
  sc.font = { name: "Aptos", size: 10, color: colorObj("FFE2E8F0") };
  sc.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).height = 28;
  sheet.getRow(3).height = 22;
  const gc = sheet.getCell(4, titleCol);
  gc.value = `Generado: ${date.toLocaleString("es-CO")}`;
  gc.font = { name: "Aptos", size: 9, italic: true, color: colorObj(EXCEL_COLORS.muted) };
  gc.alignment = { vertical: "middle" };
  const wc = sheet.getCell(4, lastCol);
  wc.value = { text: "ux.technology", hyperlink: UX_WEBSITE };
  wc.font = { name: "Aptos", size: 9, color: colorObj(EXCEL_COLORS.purple), underline: "single" };
  wc.alignment = { horizontal: "right", vertical: "middle" };
  sheet.getRow(4).height = 20;
}

function styleRange(sheet: ExcelJS.Worksheet, sr: number, sc: number, er: number, ec: number, style: { fill: string; border: string }) {
  for (let r = sr; r <= er; r++) for (let c = sc; c <= ec; c++) {
    const cell = sheet.getCell(r, c);
    cell.fill = solidFill(style.fill);
    cell.border = borderObj(style.border);
  }
}

function styleStatus(cell: ExcelJS.Cell) {
  const s = String(cell.value || "").toLowerCase();
  if (["running", "available", "active", "ok"].includes(s)) {
    cell.font = { name: "Aptos", size: 10, bold: true, color: colorObj(EXCEL_COLORS.green) };
  } else if (s && s !== "n/a") {
    cell.font = { name: "Aptos", size: 10, bold: true, color: colorObj(EXCEL_COLORS.amber) };
  }
}

function solidFill(argb: string) { return { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } }; }
function colorObj(argb: string) { return { argb }; }
function borderObj(argb: string) {
  return {
    top: { style: "thin" as const, color: { argb } },
    left: { style: "thin" as const, color: { argb } },
    bottom: { style: "thin" as const, color: { argb } },
    right: { style: "thin" as const, color: { argb } },
  };
}

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function drawBrandBand(doc: jsPDF, height: number) {
  const pw = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_COLORS.ink);
  doc.rect(0, 0, pw, height, "F");
  doc.setFillColor(...PDF_COLORS.purple);
  doc.rect(0, 0, pw * 0.63, 6, "F");
  doc.setFillColor(...PDF_COLORS.magenta);
  doc.rect(pw * 0.63, 0, pw * 0.37, 6, "F");
}

function drawLogo(doc: jsPDF, logoData: string | null, x: number, y: number, w: number, h: number, onDark = false) {
  if (logoData) { doc.addImage(logoData, "PNG", x, y, w, h, undefined, "MEDIUM"); return; }
  doc.setFillColor(...PDF_COLORS.purple);
  doc.roundedRect(x, y, Math.min(h, 42), Math.min(h, 42), 8, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.min(h * 0.42, 18));
  doc.setTextColor(255, 255, 255);
  doc.text("UX", x + 8, y + Math.min(h, 42) * 0.66);
  doc.setFontSize(9);
  doc.setTextColor(...(onDark ? [255, 255, 255] as [number, number, number] : PDF_COLORS.ink));
  doc.text("UX Technology", x + Math.min(h, 42) + 10, y + 25);
}

function drawReportHeader(doc: jsPDF, logoData: string | null, section: string) {
  const pw = doc.internal.pageSize.getWidth();
  drawBrandBand(doc, 64);
  drawLogo(doc, logoData, 36, 10, 84, 45, true);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("MC Inventory", 136, 27);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text("UX Technology", 136, 41);
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(section, pw - 36, 35, { align: "right" });
}

async function loadImageData(path: string): Promise<string | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid"));
      reader.onerror = () => reject(reader.error || new Error("Read error"));
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Data builder for email ──

export type DatabaseReportRow = {
  provider: string;
  accountName: string;
  dbName: string;
  engine: string;
  version: string;
  status: string;
  endpoint: string;
  latestPatch: string;
  updateStatus: string;
  updateObservation: string;
};

export function buildDatabaseReportRows(rows: InventoryItem[]): DatabaseReportRow[] {
  return rows.map((r) => ({
    provider: r.provider || "N/A",
    accountName: r.accountName || "N/A",
    dbName: r.name || "N/A",
    engine: engineOf(r),
    version: versionOf(r),
    status: r.status || "N/A",
    endpoint: r.host || "N/A",
    latestPatch: r.latestPatch || "—",
    updateStatus: r.updateStatus || "—",
    updateObservation: r.updateObservation || "",
  }));
}
