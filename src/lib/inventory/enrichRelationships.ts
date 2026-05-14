import {
  InventoryItem,
  Relationship,
  RiskLevel
} from "@/types/inventory";

export function enrichRelationships(
  inventory: InventoryItem[]
): InventoryItem[] {

  const itemMap =
    new Map<string, InventoryItem>();

  inventory.forEach((item) => {

    itemMap.set(
      item.id,
      item
    );

  });

  return inventory.map((item) => {

    const relationships: Relationship[] = [];

    let publiclyExposed =
      false;

    let riskLevel: RiskLevel =
      "SAFE";

    /* ───────────────────────────── */
    /* EC2 -> SUBNET */
    /* ───────────────────────────── */

    if (item.subnetId) {

      const subnet =
        itemMap.get(item.subnetId);

      if (subnet) {

        relationships.push({

          type:
            "CONNECTED_TO_SUBNET",

          targetId:
            subnet.id,

          targetName:
            subnet.name,

          targetService:
            subnet.service

        });

      }

    }

    /* ───────────────────────────── */
    /* SUBNET -> VPC */
    /* ───────────────────────────── */

    if (item.vpcId) {

      const vpc =
        itemMap.get(item.vpcId);

      if (vpc) {

        relationships.push({

          type:
            "CONNECTED_TO_VPC",

          targetId:
            vpc.id,

          targetName:
            vpc.name,

          targetService:
            vpc.service

        });

      }

    }

    /* ───────────────────────────── */
    /* ELB -> TARGETS */
    /* ───────────────────────────── */

    if (
      item.targetGroups &&
      item.targetGroups.length > 0
    ) {

      for (const tg of item.targetGroups) {

        if (
          tg.targets &&
          tg.targets.length > 0
        ) {

          for (const target of tg.targets) {

            const targetItem =
              itemMap.get(
                target.id || ""
              );

            relationships.push({

              type:
                "TARGETS",

              targetId:
                target.id || "N/A",

              targetName:
                targetItem?.name ||
                target.id,

              targetService:
                targetItem?.service ||
                "UNKNOWN"

            });

          }

        }

      }

    }

    /* ───────────────────────────── */
    /* PUBLIC EXPOSURE */
    /* ───────────────────────────── */

    for (const sg of (item.securityGroups || [])) {

      for (const rule of (sg.inboundRules || [])) {

        const isPublic =

          rule.cidr === "0.0.0.0/0";

        const dangerousPorts = [

          22,
          3389,
          5432,
          3306,
          6379,
          27017

        ];

        const dangerous =

          dangerousPorts.includes(
            rule.fromPort || 0
          );

        if (isPublic) {

          publiclyExposed =
            true;

          riskLevel =
            dangerous
              ? "CRITICAL"
              : "HIGH";

        }

      }

    }

    /* ───────────────────────────── */
    /* PUBLIC IP */
    /* ───────────────────────────── */

    if (
      item.publicIp &&
      item.publicIp !== "N/A"
    ) {

      publiclyExposed =
        true;

      if (
        riskLevel === "SAFE"
      ) {

        riskLevel =
          "MEDIUM";

      }

    }

    /* ───────────────────────────── */
    /* ELB INTERNET FACING */
    /* ───────────────────────────── */

    if (
      item.service === "ELB" &&
      item.host !== "N/A"
    ) {

      publiclyExposed =
        true;

      if (
        riskLevel === "SAFE"
      ) {

        riskLevel =
          "LOW";

      }

    }

    /* ───────────────────────────── */
    /* TOPOLOGY TYPE */
    /* ───────────────────────────── */

    let topologyType =
      "resource";

    if (
      item.service === "ELB"
    ) {

      topologyType =
        "entrypoint";

    }

    if (
      item.service === "EC2" ||
      item.service === "ECS"
    ) {

      topologyType =
        "compute";

    }

    if (
      item.service === "VPC"
    ) {

      topologyType =
        "network";

    }

    return {

      ...item,

      relationships,

      publiclyExposed,

      riskLevel,

      topologyType

    };

  });

}