import MetricsGrid from "@/components/monitoring/MetricsGrid";
import MonitoringCharts from "@/components/monitoring/MonitoringCharts";

export default function MonitoringPage() {

  return (

    <div className="space-y-6">

      <div>

        <h1 className="text-3xl font-bold">
          Monitoreo
        </h1>

        <p className="text-gray-400 mt-1">
          Métricas en tiempo real de AWS y Huawei Cloud.
        </p>

      </div>

      <MetricsGrid />

      <MonitoringCharts />

    </div>

  );

}