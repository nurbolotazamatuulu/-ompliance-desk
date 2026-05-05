import Skeleton from '../../../components/primitives/Skeleton';

/**
 * 12 skeleton-rows под header DataTable. Высота строки 28px (compact density).
 */
export default function LoadingState() {
  return (
    <div className="border border-border rounded-sm bg-surface">
      <div className="bg-elev border-b border-border-hi h-8 px-3 flex items-center">
        <Skeleton variant="text" width="60%" className="opacity-50" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-7 border-b border-border/50 flex items-center px-2 gap-2">
            <Skeleton variant="text" width={100} />
            <Skeleton variant="text" width="35%" />
            <Skeleton variant="text" width={80} />
            <Skeleton variant="text" width={140} />
            <Skeleton variant="text" width={70} />
            <Skeleton variant="text" width={120} />
          </div>
        ))}
      </div>
    </div>
  );
}
