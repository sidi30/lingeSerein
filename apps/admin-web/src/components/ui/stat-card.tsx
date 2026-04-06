interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({ label, value, icon, trend, className = "" }: StatCardProps) {
  const showTrend = trend && (trend.value !== 0 || trend.label);

  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">{value}</p>
          {showTrend && (
            <p
              className={`mt-1 text-xs font-medium ${
                trend.value > 0
                  ? "text-success-600"
                  : trend.value < 0
                    ? "text-danger-600"
                    : "text-gray-400"
              }`}
            >
              {trend.value > 0 && "+"}
              {trend.value !== 0 && `${trend.value}% `}
              {trend.label}
            </p>
          )}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          {icon}
        </div>
      </div>
    </div>
  );
}
