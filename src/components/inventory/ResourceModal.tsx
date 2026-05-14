"use client";

import {
  Copy,
  ShieldAlert,
  ShieldCheck,
  Network,
  Server,
  Globe,
  ArrowDown,
  Boxes,
  Activity
} from "lucide-react";

import {
  useMemo,
  useState
} from "react";

import { InventoryItem } from "@/types/inventory";

import TagsList from "./TagsList";
import SecurityGroupList from "./SecurityGroupList";

type Props = {
  item: InventoryItem | null;
  onClose: () => void;
};

type Tab =
  | "overview"
  | "network"
  | "security"
  | "loadbalancer";

export default function ResourceModal({
  item,
  onClose
}: Props) {

  const [tab, setTab] =
    useState<Tab>("overview");

  if (!item) return null;

  const securityAnalysis =
    useMemo(() => {

      const findings: string[] = [];

      (item.securityGroups || []).forEach((sg) => {

        (sg.inboundRules || []).forEach((rule) => {

          const openToWorld =
            rule.cidr === "0.0.0.0/0";

          const from =
            rule.fromPort;

          if (
            openToWorld &&
            from === 22
          ) {

            findings.push(
              "SSH expuesto públicamente"
            );

          }

          if (
            openToWorld &&
            from === 3389
          ) {

            findings.push(
              "RDP expuesto públicamente"
            );

          }

          if (
            openToWorld &&
            rule.protocol === "-1"
          ) {

            findings.push(
              "ALL traffic permitido"
            );

          }

        });

      });

      return findings;

    }, [item]);

  const riskLevel =

    securityAnalysis.length >= 3

      ? "CRITICAL"

      : securityAnalysis.length > 0

        ? "WARNING"

        : "SAFE";

  return (

    <div
      className="
        fixed
        inset-0
        z-50
        bg-black/70
        backdrop-blur-sm
        flex
        items-center
        justify-center
        p-4
      "
    >

      <div
        className="
          bg-[var(--bg-card)]
          border
          border-[var(--border)]
          rounded-3xl
          w-full
          max-w-7xl
          max-h-[92vh]
          overflow-hidden
          shadow-2xl
        "
      >

        {/* HEADER */}

        <div
          className="
            sticky
            top-0
            z-20
            bg-[var(--bg-card)]/95
            backdrop-blur-xl
            border-b
            border-[var(--border)]
            px-6
            py-5
          "
        >

          <div className="flex justify-between items-start">

            <div>

              <div className="flex flex-wrap gap-3 mb-4">

                <Badge value={item.service} />

                <Badge value={item.provider} />

                <Badge value={item.status} />

                <RiskBadge risk={riskLevel} />

                {item.publicIp && (

                  <Badge
                    value="PUBLIC"
                    color="orange"
                  />

                )}

                {item.ssmManaged && (

                  <Badge
                    value="SSM"
                    color="green"
                  />

                )}

              </div>

              <div className="flex items-center gap-4">

                <div>

                  <h2 className="text-3xl font-bold">
                    {item.name}
                  </h2>

                  <p
                    className="
                      text-sm
                      text-[var(--text-secondary)]
                      mt-2
                      font-mono
                    "
                  >
                    {item.id}
                  </p>

                </div>

                <CopyButton
                  value={item.id}
                />

              </div>

            </div>

            <button
              onClick={onClose}
              className="
                px-4
                py-2
                rounded-xl
                bg-red-500/10
                text-red-400
              "
            >
              Cerrar
            </button>

          </div>

          {/* TABS */}

          <div className="flex gap-3 mt-6 flex-wrap">

            <TabButton
              active={tab === "overview"}
              onClick={() =>
                setTab("overview")
              }
              icon={<Server size={16} />}
              label="Overview"
            />

            <TabButton
              active={tab === "network"}
              onClick={() =>
                setTab("network")
              }
              icon={<Network size={16} />}
              label="Network"
            />

            <TabButton
              active={tab === "security"}
              onClick={() =>
                setTab("security")
              }
              icon={<ShieldAlert size={16} />}
              label="Security"
            />

            <TabButton
              active={tab === "loadbalancer"}
              onClick={() =>
                setTab("loadbalancer")
              }
              icon={<Activity size={16} />}
              label="Load Balancing"
            />

          </div>

        </div>

        {/* BODY */}

        <div className="p-6 overflow-auto max-h-[75vh]">

          {/* EXPOSURE */}

          {item.publiclyExposed ? (

            <div
              className="
                mb-6
                rounded-2xl
                border
                border-red-500/20
                bg-red-500/10
                p-5
                flex
                items-start
                gap-4
              "
            >

              <ShieldAlert
                size={24}
                className="text-red-400 mt-1"
              />

              <div>

                <p
                  className="
                    font-semibold
                    text-red-400
                    mb-1
                  "
                >
                  Public Exposure Detected
                </p>

                <p
                  className="
                    text-sm
                    text-red-200/80
                  "
                >
                  Este recurso posee exposición pública
                  o reglas abiertas hacia Internet.
                </p>

              </div>

            </div>

          ) : (

            <div
              className="
                mb-6
                rounded-2xl
                border
                border-green-500/20
                bg-green-500/10
                p-5
                flex
                items-start
                gap-4
              "
            >

              <ShieldCheck
                size={24}
                className="text-green-400 mt-1"
              />

              <div>

                <p
                  className="
                    font-semibold
                    text-green-400
                    mb-1
                  "
                >
                  No Public Exposure
                </p>

                <p
                  className="
                    text-sm
                    text-green-200/80
                  "
                >
                  No se detectó exposición pública.
                </p>

              </div>

            </div>

          )}

          {/* OVERVIEW */}

          {tab === "overview" && (

            <div className="space-y-8">

              <SectionCard title="Información General">

                <div className="mb-5">

                  <div
                    className={`
                      inline-flex
                      items-center
                      gap-3
                      px-4
                      py-2
                      rounded-2xl
                      border
                      ${getRiskStyles(
                        item.riskLevel
                      )}
                    `}
                  >

                    <ShieldAlert size={18} />

                    <div>

                      <p className="text-xs opacity-70">
                        Risk Level
                      </p>

                      <p className="font-semibold">
                        {item.riskLevel || "SAFE"}
                      </p>

                    </div>

                  </div>

                </div>

                <div
                  className="
                    grid
                    grid-cols-1
                    md:grid-cols-2
                    xl:grid-cols-3
                    gap-4
                  "
                >

                  <InfoCard label="Provider" value={item.provider} />
                  <InfoCard label="Cuenta" value={item.accountName} />
                  <InfoCard label="Servicio" value={item.service} />
                  <InfoCard label="Estado" value={item.status} />
                  <InfoCard label="Host" value={item.host} />
                  <InfoCard label="Sistema Operativo" value={item.operatingSystem} />
                  <InfoCard label="Instance Type" value={item.instanceType} />
                  <InfoCard label="AZ" value={item.availabilityZone} />
                  <InfoCard label="Launch Time" value={item.launchTime} />

                </div>

              </SectionCard>

              <SectionCard title="Tags">

                <TagsList tags={item.tags} />

              </SectionCard>

            </div>

          )}

          {/* NETWORK */}

          {tab === "network" && (

            <div className="space-y-8">

              <SectionCard title="Topology">

                <div className="space-y-4">

                  {item.publiclyExposed && (

                    <TopologyNode
                      icon={<Globe size={18} />}
                      label="Internet"
                      type="external"
                    />

                  )}

                  <TopologyNode
                    icon={<Boxes size={18} />}
                    label={`${item.service} · ${item.name}`}
                    type={item.topologyType}
                  />

                  {(item.relationships || []).map((rel, index) => (

                    <div
                      key={index}
                      className="ml-6"
                    >

                      <div className="flex items-center gap-3 mb-2">

                        <ArrowDown
                          size={16}
                          className="text-[var(--text-secondary)]"
                        />

                        <span
                          className="
                            text-xs
                            uppercase
                            tracking-wide
                            text-[var(--text-secondary)]
                          "
                        >
                          {rel.type.replaceAll("_", " ")}
                        </span>

                      </div>

                      <TopologyNode
                        icon={

                          rel.targetService === "VPC"

                            ? <Network size={18} />

                            : <Server size={18} />

                        }
                        label={`${rel.targetService} · ${rel.targetName}`}
                        type="related"
                      />

                    </div>

                  ))}

                </div>

              </SectionCard>

              <SectionCard title="Networking">

                <div className="grid md:grid-cols-2 gap-4">

                  <InfoCard
                    label="Private IP"
                    value={item.privateIp}
                  />

                  <InfoCard
                    label="Public IP"
                    value={item.publicIp}
                  />

                  <InfoCard
                    label="VPC"
                    value={item.vpcId}
                  />

                  <InfoCard
                    label="Subnet"
                    value={item.subnetId}
                  />

                </div>

              </SectionCard>

            </div>

          )}

          {/* SECURITY */}

          {tab === "security" && (

            <div className="space-y-8">

              <SectionCard title="Risk Analysis">

                <div
                  className={`
                    p-5
                    rounded-2xl
                    border

                    ${
                      riskLevel === "CRITICAL"
                        ? "bg-red-500/10 border-red-500/20"
                        : riskLevel === "WARNING"
                          ? "bg-yellow-500/10 border-yellow-500/20"
                          : "bg-green-500/10 border-green-500/20"
                    }
                  `}
                >

                  <p className="font-bold text-lg mb-4">
                    {riskLevel}
                  </p>

                  {securityAnalysis.length === 0 ? (

                    <p className="text-green-400">
                      No se encontraron riesgos críticos.
                    </p>

                  ) : (

                    <div className="space-y-2">

                      {securityAnalysis.map((f, idx) => (

                        <p
                          key={idx}
                          className="text-sm"
                        >
                          • {f}
                        </p>

                      ))}

                    </div>

                  )}

                </div>

              </SectionCard>

              <SectionCard title="Security Groups">

                <SecurityGroupList
                  groups={item.securityGroups}
                />

              </SectionCard>

            </div>

          )}

          {/* LOAD BALANCER */}

          {tab === "loadbalancer" && (

            <div className="space-y-8">

              {(item.listeners || []).length > 0 && (

                <SectionCard title="Listeners">

                  <div className="space-y-4">

                    {item.listeners?.map((listener, idx) => (

                      <div
                        key={idx}
                        className="
                          p-5
                          rounded-2xl
                          border
                          border-[var(--border)]
                          bg-[var(--bg-hover)]/30
                        "
                      >

                        <div className="flex items-center justify-between">

                          <div>

                            <p className="font-semibold">
                              {listener.name}
                            </p>

                            <p className="text-sm text-[var(--text-secondary)] mt-1">
                              {listener.protocol} : {listener.port}
                            </p>

                          </div>

                          <CopyButton
                            value={listener.arn || ""}
                          />

                        </div>

                      </div>

                    ))}

                  </div>

                </SectionCard>

              )}

              {(item.targetGroups || []).length > 0 && (

                <SectionCard title="Target Relationships">

                  <div className="space-y-6">

                    {item.targetGroups?.map((tg, idx) => (

                      <div
                        key={idx}
                        className="
                          rounded-2xl
                          border
                          border-[var(--border)]
                          overflow-hidden
                        "
                      >

                        <div
                          className="
                            p-5
                            bg-[var(--bg-hover)]/30
                          "
                        >

                          <p className="font-bold text-lg">
                            {tg.name}
                          </p>

                          <p className="text-sm text-[var(--text-secondary)] mt-1">
                            {tg.protocol} : {tg.port}
                          </p>

                        </div>

                        <div className="p-5 space-y-3">

                          {(tg.targets || []).map((target, i) => (

                            <div
                              key={i}
                              className="
                                flex
                                items-center
                                justify-between
                                p-4
                                rounded-xl
                                bg-black/20
                              "
                            >

                              <div>

                                <p className="font-mono">
                                  {target.id}
                                </p>

                                <p className="text-xs text-gray-400 mt-1">
                                  Port {target.port}
                                </p>

                              </div>

                              <HealthBadge
                                status={target.health}
                              />

                            </div>

                          ))}

                        </div>

                      </div>

                    ))}

                  </div>

                </SectionCard>

              )}

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

function TabButton({
  active,
  onClick,
  icon,
  label
}: any) {

  return (

    <button
      onClick={onClick}
      className={`
        px-4
        py-3
        rounded-2xl
        flex
        items-center
        gap-2
        text-sm
        border
        transition-all

        ${
          active

            ? "bg-[var(--primary)] text-white border-[var(--primary)]"

            : "bg-[var(--bg-hover)] border-[var(--border)]"
        }
      `}
    >
      {icon}
      {label}
    </button>

  );

}

function Badge({
  value,
  color
}: any) {

  return (

    <span
      className={`
        px-3
        py-1
        rounded-full
        text-xs
        border

        ${
          color === "orange"

            ? "bg-orange-500/10 text-orange-400 border-orange-500/20"

            : color === "green"

              ? "bg-green-500/10 text-green-400 border-green-500/20"

              : "bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/20"
        }
      `}
    >
      {value}
    </span>

  );

}

function RiskBadge({
  risk
}: {
  risk: string;
}) {

  return (

    <span
      className={`
        px-3
        py-1
        rounded-full
        text-xs
        border

        ${
          risk === "CRITICAL"

            ? "bg-red-500/10 text-red-400 border-red-500/20"

            : risk === "WARNING"

              ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"

              : "bg-green-500/10 text-green-400 border-green-500/20"
        }
      `}
    >
      {risk}
    </span>

  );

}

function HealthBadge({
  status
}: any) {

  return (

    <span
      className={`
        px-3
        py-1
        rounded-full
        text-xs
        border

        ${
          status === "healthy"

            ? "bg-green-500/10 text-green-400 border-green-500/20"

            : "bg-red-500/10 text-red-400 border-red-500/20"
        }
      `}
    >
      {status}
    </span>

  );

}

function CopyButton({
  value
}: {
  value: string;
}) {

  return (

    <button
      onClick={() =>
        navigator.clipboard.writeText(value)
      }
      className="
        p-2
        rounded-xl
        border
        border-[var(--border)]
        hover:bg-[var(--bg-hover)]
      "
    >

      <Copy size={16} />

    </button>

  );

}

function SectionCard({
  title,
  children
}: any) {

  return (

    <div
      className="
        bg-[var(--bg-hover)]/20
        border
        border-[var(--border)]
        rounded-3xl
        p-6
      "
    >

      <h3 className="text-xl font-bold mb-6">
        {title}
      </h3>

      {children}

    </div>

  );

}

function InfoCard({
  label,
  value
}: any) {

  return (

    <div
      className="
        p-5
        rounded-2xl
        bg-black/20
        border
        border-[var(--border)]
      "
    >

      <p className="text-xs text-[var(--text-secondary)] uppercase mb-2">
        {label}
      </p>

      <p className="text-sm break-all">
        {value || "N/A"}
      </p>

    </div>

  );

}

function TopologyNode({

  icon,
  label,
  type

}: {

  icon: React.ReactNode;

  label: string;

  type?: string;

}) {

  return (

    <div
      className={`
        flex
        items-center
        gap-4
        p-4
        rounded-2xl
        border

        ${getTopologyStyles(type)}
      `}
    >

      <div>

        {icon}

      </div>

      <div>

        <p className="font-medium">
          {label}
        </p>

      </div>

    </div>

  );

}

function getTopologyStyles(
  type?: string
) {

  switch (type) {

    case "entrypoint":

      return `
        bg-cyan-500/10
        border-cyan-500/20
        text-cyan-300
      `;

    case "compute":

      return `
        bg-violet-500/10
        border-violet-500/20
        text-violet-300
      `;

    case "network":

      return `
        bg-orange-500/10
        border-orange-500/20
        text-orange-300
      `;

    case "external":

      return `
        bg-red-500/10
        border-red-500/20
        text-red-300
      `;

    default:

      return `
        bg-[var(--bg-hover)]/40
        border-[var(--border)]
      `;

  }

}

function getRiskStyles(
  level?: string
) {

  switch (level) {

    case "CRITICAL":

      return `
        bg-red-500/10
        border-red-500/20
        text-red-400
      `;

    case "HIGH":

      return `
        bg-orange-500/10
        border-orange-500/20
        text-orange-400
      `;

    case "MEDIUM":

      return `
        bg-yellow-500/10
        border-yellow-500/20
        text-yellow-400
      `;

    case "LOW":

      return `
        bg-cyan-500/10
        border-cyan-500/20
        text-cyan-400
      `;

    default:

      return `
        bg-green-500/10
        border-green-500/20
        text-green-400
      `;

  }

}