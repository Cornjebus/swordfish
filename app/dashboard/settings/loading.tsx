import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="p-8 max-w-4xl space-y-6">
      {/* Header */}
      <Skeleton className="h-8 w-28" />

      {/* Tabs */}
      <div className="border-b border-gray-200 pb-2">
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28" />
          ))}
        </div>
      </div>

      {/* Settings Panel */}
      <div className="bg-white rounded-lg border p-6 space-y-6">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-4 w-72" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      </div>

      <Skeleton className="h-10 w-32" />
    </div>
  );
}
