// src/components/inventory/SecurityGroupList.tsx

"use client";

import {
  ChevronDown,
  ChevronUp,
  Shield
} from "lucide-react";

import {
  useState
} from "react";

import {
  SecurityGroup
} from "@/types/inventory";

export default function SecurityGroupList({
  groups
}: {
  groups?: SecurityGroup[];
}) {

  const [openGroup, setOpenGroup] =
    useState<string | null>(null);

  if (
    !groups ||
    groups.length === 0
  ) {

    return (

      <p className="text-sm text-[var(--text-secondary)]">
        Sin security groups
      </p>

    );

  }

  return (

    <div className="space-y-4">

      {groups.map((group) => {

        const opened =
          openGroup === group.id;

        return (

          <div
            key={group.id}
            className="
              rounded-2xl
              border
              border-[var(--border)]
              overflow-hidden
              bg-[var(--bg-hover)]/30
            "
          >

            <button
              onClick={() =>

                setOpenGroup(

                  opened
                    ? null
                    : group.id

                )

              }
              className="
                w-full
                p-4
                flex
                items-center
                justify-between
                hover:bg-[var(--bg-hover)]/50
                transition-all
              "
            >

              <div className="flex items-center gap-3">

                <Shield
                  size={18}
                  className="text-yellow-400"
                />

                <div className="text-left">

                  <p className="font-semibold">
                    {group.name}
                  </p>

                  <p
                    className="
                      text-xs
                      font-mono
                      text-[var(--text-secondary)]
                    "
                  >
                    {group.id}
                  </p>

                </div>

              </div>

              {opened
                ? <ChevronUp size={18} />
                : <ChevronDown size={18} />
              }

            </button>

            {opened && (

              <div
                className="
                  border-t
                  border-[var(--border)]
                  p-4
                  space-y-6
                "
              >

                {/* INBOUND */}

                <div>

                  <h4
                    className="
                      text-sm
                      font-semibold
                      text-green-400
                      mb-3
                    "
                  >
                    Inbound Rules
                  </h4>

                  <div className="space-y-2">

                    {(group.inboundRules || []).map((rule, idx) => (

                      <RuleCard
                        key={idx}
                        rule={rule}
                      />

                    ))}

                  </div>

                </div>

                {/* OUTBOUND */}

                <div>

                  <h4
                    className="
                      text-sm
                      font-semibold
                      text-orange-400
                      mb-3
                    "
                  >
                    Outbound Rules
                  </h4>

                  <div className="space-y-2">

                    {(group.outboundRules || []).map((rule, idx) => (

                      <RuleCard
                        key={idx}
                        rule={rule}
                      />

                    ))}

                  </div>

                </div>

              </div>

            )}

          </div>

        );

      })}

    </div>

  );

}

function RuleCard({
  rule
}: {
  rule: any;
}) {

  return (

    <div
      className="
        flex
        flex-wrap
        gap-4
        items-center
        text-sm
        p-3
        rounded-xl
        bg-black/20
        border
        border-[var(--border)]
      "
    >

      <span className="font-semibold">
        {rule.protocol || "ALL"}
      </span>

      <span>
        {rule.fromPort ?? "ALL"}
        {" → "}
        {rule.toPort ?? "ALL"}
      </span>

      <span
        className="
          font-mono
          text-cyan-400
        "
      >
        {rule.cidr || "0.0.0.0/0"}
      </span>

    </div>

  );

}