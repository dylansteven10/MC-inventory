import * as XLSX from "xlsx";

import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

import {
  BillingItem
} from "@/types/billing";

export function exportBillingToExcel(
  items: BillingItem[]
) {

  const rows =
    items.map((item) => ({

      Provider:
        item.provider,

      Cuenta:
        item.accountName,

      Servicio:
        item.service,

      Region:
        item.region,

      Costo:
        item.cost,

      Currency:
        item.currency,

      Mes:
        item.month,

      Tags:
        JSON.stringify(
          item.tags || {}
        )

    }));

  const worksheet =
    XLSX.utils.json_to_sheet(
      rows
    );

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(

    workbook,

    worksheet,

    "Billing"

  );

  XLSX.writeFile(

    workbook,

    "billing-report.xlsx"

  );

}

export function exportBillingToPDF(
  items: BillingItem[]
) {

  const doc =
    new jsPDF();

  autoTable(doc, {

    head: [[

      "Provider",
      "Cuenta",
      "Servicio",
      "Costo",
      "Mes"

    ]],

    body:

      items.map((item) => ([

        item.provider,

        item.accountName,

        item.service,

        `$${item.cost.toFixed(2)}`,

        item.month

      ]))

  });

  doc.save(
    "billing-report.pdf"
  );

}