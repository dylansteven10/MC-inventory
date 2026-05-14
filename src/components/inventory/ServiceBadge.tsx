type Props = {
  service: string;
};

const SERVICE_COLORS: Record<string, string> = {

  EC2:
    "bg-blue-500/10 text-blue-400 border-blue-500/30",

  ECS:
    "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",

  RDS:
    "bg-purple-500/10 text-purple-400 border-purple-500/30",

  S3:
    "bg-orange-500/10 text-orange-400 border-orange-500/30",

  OBS:
    "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",

  VPC:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",

  Subnet:
    "bg-pink-500/10 text-pink-400 border-pink-500/30",

  ELB:
    "bg-red-500/10 text-red-400 border-red-500/30"

};

export default function ServiceBadge({
  service
}: Props) {

  return (

    <span
      className={`
        inline-flex
        items-center
        px-3
        py-1
        rounded-full
        text-xs
        font-semibold
        border
        whitespace-nowrap
        ${SERVICE_COLORS[service] || "bg-gray-500/10 text-gray-300 border-gray-500/20"}
      `}
    >
      {service}
    </span>

  );

}