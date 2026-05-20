export default function MetricsGrid() {

  const metrics = [
    {
      name: "CPU Usage",
      value: "43%"
    },
    {
      name: "RAM Usage",
      value: "71%"
    },
    {
      name: "Disk Usage",
      value: "52%"
    },
    {
      name: "Network",
      value: "1.2Gbps"
    }
  ];

  return (

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

      {metrics.map((metric) => (

        <div
          key={metric.name}
          className="
            rounded-3xl
            border
            border-white/10
            bg-white/5
            p-6
          "
        >

          <p className="text-gray-400 text-sm">
            {metric.name}
          </p>

          <h2 className="text-3xl font-bold mt-3">
            {metric.value}
          </h2>

        </div>

      ))}

    </div>

  );

}