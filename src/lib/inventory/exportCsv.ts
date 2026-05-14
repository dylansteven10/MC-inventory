import { InventoryItem } from "@/types/inventory";

export function exportCSV(
  rows: InventoryItem[],
  filename: string
): void {

  const headers = [

    "Provider",
    "Account",
    "Service",
    "Name",
    "ID",
    "Host",
    "Private IP",
    "Public IP",
    "Status",
    "OS",
    "VPC",
    "Subnet",
    "Security Groups",
    "Listeners",
    "Target Groups"

  ];

  const csv = [

    headers.join(","),

    ...rows.map((r) => [

      r.provider ?? "AWS",

      r.accountName,

      r.service,

      r.name,

      r.id,

      r.host,

      r.privateIp || "N/A",

      r.publicIp || "N/A",

      r.status,

      r.operatingSystem ?? "N/A",

      r.vpcId || "N/A",

      r.subnetId || "N/A",

      (r.securityGroups || [])
        .map((s) => s.name)
        .join(" | "),

      (r.listeners || [])
        .map((l) =>
          `${l.protocol}:${l.port}`
        )
        .join(" | "),

      (r.targetGroups || [])
        .map((t) => t.name)
        .join(" | ")

    ]

      .map((v) => `"${v}"`)
      .join(",")

    )

  ].join("\n");

  const blob =
    new Blob(

      [csv],

      {
        type: "text/csv"
      }

    );

  const url =
    URL.createObjectURL(blob);

  const a =
    document.createElement("a");

  a.href = url;

  a.download = filename;

  a.click();

  URL.revokeObjectURL(url);

}