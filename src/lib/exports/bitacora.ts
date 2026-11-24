import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { trackClientAuditEvent } from "@/lib/audit/client";
import type { BitacoraRecord } from "@/lib/backups/bitacora";

// ── Helpers ──

function formatBackupDate(d: string): string {
  if (!d || d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function statusLabel(s: string): string {
  switch (s) {
    case "COMPLETED": return "Completado";
    case "NO_BACKUP": return "Sin backup";
    case "EMPTY": return "Vacío";
    case "PARTIAL": return "Parcial";
    case "EXPIRED": return "Expirado";
    default: return s;
  }
}

function typeLabel(t: string): string {
  switch (t) {
    case "server": return "Servidor";
    case "rds": return "Base de datos";
    case "log": return "Log transaccional";
    default: return t;
  }
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(1)} ${units[i]}`;
}

function providerLabel(p: string): string {
  return p === "AWS" ? "AWS" : p === "HUAWEI CLOUD" ? "Huawei Cloud" : p;
}

// ── Row builder ──

type BitacoraRow = {
  nube: string;
  cuenta: string;
  servicio: string;
  instancia: string;
  motor: string;
  fecha: string;
  tipo: string;
  estado: string;
  tamaño: string;
};

export function buildBitacoraRows(records: BitacoraRecord[]): BitacoraRow[] {
  // Sort by provider A-Z, account A-Z, instance name A-Z
  const sorted = [...records].sort((a, b) => {
    const pc = (a.provider || "").localeCompare(b.provider || "");
    if (pc !== 0) return pc;
    const ac = (a.accountName || "").localeCompare(b.accountName || "");
    if (ac !== 0) return ac;
    return (a.instanceName || "").localeCompare(b.instanceName || "");
  });
  return sorted.map((r) => ({
    nube: providerLabel(r.provider),
    cuenta: r.accountName,
    servicio: r.service,
    instancia: r.instanceName,
    motor: r.engine || "",
    fecha: formatBackupDate(r.backupDate),
    tipo: typeLabel(r.backupType),
    estado: statusLabel(r.status),
    tamaño: formatSize(r.sizeBytes),
  }));
}

// ── Excel ──

const NAVY = "FF14182D";
const NAVY_SOFT = "FF202640";
const WHITE = "FFFFFFFF";
const SOFT = "FFF5F7FB";
const LINE = "FFDCE2EB";
const INK = "FF202437";

const COLUMNS: { key: keyof BitacoraRow; header: string; width: number }[] = [
  { key: "nube", header: "Nube", width: 16 },
  { key: "cuenta", header: "Cuenta", width: 24 },
  { key: "servicio", header: "Servicio", width: 14 },
  { key: "instancia", header: "Instancia", width: 36 },
  { key: "motor", header: "Motor", width: 18 },
  { key: "fecha", header: "Fecha", width: 14 },
  { key: "tipo", header: "Tipo backup", width: 20 },
  { key: "estado", header: "Estado", width: 14 },
  { key: "tamaño", header: "Tamaño", width: 14 },
];

export async function exportBitacoraToExcel(
  records: BitacoraRecord[],
  filename: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  const rows = buildBitacoraRows(records);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UX Technology";
  workbook.company = "UX Technology";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Bitácora");
  const lastCol = COLUMNS.length;
  sheet.views = [{ showGridLines: false }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };

  // Brand band
  sheet.mergeCells(1, 1, 2, lastCol);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `UX Technology | ${title}`;
  titleCell.font = { name: "Aptos", size: 14, bold: true, color: { argb: WHITE } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  titleCell.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 26;
  sheet.getRow(2).height = 20;
  const subCell = sheet.getCell(2, 1);
  subCell.value = subtitle || `Generado: ${new Date().toLocaleString("es-CO")}`;
  subCell.font = { name: "Aptos", size: 9, italic: true, color: { argb: "FFE2E8F0" } };
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };

  // Summary row
  const completed = records.filter((r) => r.status === "COMPLETED").length;
  const noBackup = records.filter((r) => r.status === "NO_BACKUP").length;
  sheet.mergeCells(3, 1, 3, lastCol);
  const sumCell = sheet.getCell(3, 1);
  sumCell.value = `Total: ${records.length} registros | Completados: ${completed} | Sin backup: ${noBackup}`;
  sumCell.font = { name: "Aptos", size: 9, color: { argb: INK } };
  sumCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
  sheet.getRow(3).height = 20;

  // Header
  const headerRow = sheet.getRow(5);
  headerRow.values = COLUMNS.map((c) => c.header);
  headerRow.height = 24;
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY_SOFT } };
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    sheet.getColumn(i + 1).width = col.width;
  });

  // Data
  rows.forEach((record, index) => {
    const row = sheet.getRow(6 + index);
    row.values = COLUMNS.map((col) => record[col.key] || "");
    row.height = 20;
    COLUMNS.forEach((_, i) => {
      const cell = row.getCell(i + 1);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? WHITE : SOFT } };
      cell.font = { name: "Aptos", size: 10, color: { argb: INK } };
      cell.alignment = { horizontal: "left", vertical: "middle" };
      cell.border = {
        top: { style: "thin", color: { argb: LINE } },
        left: { style: "thin", color: { argb: LINE } },
        bottom: { style: "thin", color: { argb: LINE } },
        right: { style: "thin", color: { argb: LINE } },
      };
    });
    // Color status cell
    const statusCell = row.getCell(8);
    if (record.estado === "Sin backup") {
      statusCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFDC2626" } };
    } else if (record.estado === "Completado") {
      statusCell.font = { name: "Aptos", size: 10, color: { argb: "FF16A34A" } };
    }
  });

  const lastRow = Math.max(rows.length + 5, 5);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastRow, column: lastCol } };
  sheet.views = [{ state: "frozen", ySplit: 5, topLeftCell: "A6", showGridLines: false }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  trackClientAuditEvent("export.triggered", {
    category: "export",
    metadata: { module: "bitacora", format: "xlsx", rowCount: records.length },
  });
}

// ── PDF ──

export async function exportBitacoraToPDF(
  records: BitacoraRecord[],
  filename: string,
  title: string,
  subtitle?: string,
): Promise<void> {
  const rows = buildBitacoraRows(records);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Cover
  doc.setFillColor(20, 24, 45);
  doc.rect(0, 0, 297, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(`UX Technology | ${title}`, 14, 14);
  doc.setFontSize(9);
  doc.setTextColor(226, 232, 240);
  doc.text(subtitle || `Generado: ${new Date().toLocaleString("es-CO")}`, 14, 22);

  // Summary
  const completed = records.filter((r) => r.status === "COMPLETED").length;
  const noBackup = records.filter((r) => r.status === "NO_BACKUP").length;
  doc.setTextColor(32, 36, 55);
  doc.setFontSize(9);
  doc.text(`Total: ${records.length} | Completados: ${completed} | Sin backup: ${noBackup}`, 14, 34);

  const head = [COLUMNS.map((c) => c.header)];
  const body = rows.map((r) => COLUMNS.map((c) => r[c.key] || ""));

  autoTable(doc, {
    head,
    body,
    startY: 38,
    styles: { fontSize: 7, cellPadding: 2, font: "helvetica" },
    headStyles: { fillColor: [32, 38, 64], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
    alternateRowStyles: { fillColor: [245, 247, 251] },
    columnStyles: {
      5: { cellWidth: 22 }, // fecha
      7: { cellWidth: 20 }, // estado
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const val = String(data.cell.raw);
        if (val === "Sin backup") data.cell.styles.textColor = [220, 38, 38];
        else if (val === "Completado") data.cell.styles.textColor = [22, 163, 74];
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);

  trackClientAuditEvent("export.triggered", {
    category: "export",
    metadata: { module: "bitacora", format: "pdf", rowCount: records.length },
  });
}
