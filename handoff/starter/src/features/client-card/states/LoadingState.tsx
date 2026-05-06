import Skeleton from '../../../components/primitives/Skeleton';

/**
 * Skeleton под layout карточки: PageHeader + RiskScoreCard горизонтальный +
 * grid с tab content и 4 side panels справа.
 */
export default function LoadingState() {
  return (
    <div className="flex flex-col">
      {/* PageHeader stub */}
      <div className="px-6 py-4 border-b border-border">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-80 mt-2" />
        <Skeleton className="h-3 w-60 mt-2" />
      </div>

      {/* RiskScoreCard stub */}
      <div className="px-4 pt-3">
        <Skeleton className="h-[88px]" />
      </div>

      <div className="px-4 py-3 grid gap-4 grid-cols-1 lg:grid-cols-[1fr_360px]">
        {/* Tabs + content */}
        <div className="space-y-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-64" />
        </div>
        {/* Side panels */}
        <aside className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </aside>
      </div>
    </div>
  );
}
