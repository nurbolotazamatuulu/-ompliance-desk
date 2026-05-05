import { Link } from 'react-router-dom';
import type { RiskLevel } from '../../types';
import { riskLabel } from '../../lib/risk';
import { cn } from '../../lib/cn';

type Counts = Record<RiskLevel, number>;

type Props = {
  counts: Counts;
  /** Если задан — сегменты donut'а кликабельны, ссылка получает risk param. */
  basePath?: string;
};

const RADIUS = 56;
const STROKE = 14;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SEGMENTS: { level: RiskLevel; color: string }[] = [
  { level: 'low', color: 'var(--cd-green)' },
  { level: 'medium', color: 'var(--cd-yellow)' },
  { level: 'high', color: 'var(--cd-orange)' },
  { level: 'critical', color: 'var(--cd-red)' },
];

/**
 * Donut-диаграмма распределения клиентов по уровню риска.
 * SVG, без recharts (per package.json — recharts не подключён).
 */
export default function RiskDistribution({ counts, basePath }: Props) {
  const total = SEGMENTS.reduce((sum, s) => sum + counts[s.level], 0);
  let offset = 0;

  return (
    <div className="bg-surface border border-border rounded-sm p-4 flex items-center gap-6">
      <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0">
        <circle cx={70} cy={70} r={RADIUS} fill="none" stroke="var(--cd-elev-2)" strokeWidth={STROKE} />
        {total > 0 &&
          SEGMENTS.map((s) => {
            const fraction = counts[s.level] / total;
            const dash = fraction * CIRCUMFERENCE;
            const gap = CIRCUMFERENCE - dash;
            const segment = (
              <circle
                key={s.level}
                cx={70}
                cy={70}
                r={RADIUS}
                fill="none"
                stroke={s.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${gap}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += dash;
            return segment;
          })}
        <text
          x={70}
          y={66}
          textAnchor="middle"
          className="text-2xs"
          fill="var(--cd-text-mute)"
          style={{ fontFamily: 'var(--cd-font-mono)' }}
        >
          ВСЕГО
        </text>
        <text
          x={70}
          y={84}
          textAnchor="middle"
          className="text-lg"
          fill="var(--cd-text)"
          style={{ fontFamily: 'var(--cd-font-mono)' }}
        >
          {total}
        </text>
      </svg>
      <ul className="flex-1 flex flex-col gap-2 min-w-0">
        {SEGMENTS.map((s) => {
          const v = counts[s.level];
          const pct = total === 0 ? 0 : Math.round((v / total) * 100);
          const inner = (
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="text-sm text-text">{riskLabel[s.level]}</span>
              <span className="cd-mono text-sm text-text-dim ml-auto">{v}</span>
              <span className="cd-mono text-2xs text-text-mute w-9 text-right">{pct}%</span>
            </div>
          );
          if (basePath) {
            return (
              <li key={s.level}>
                <Link
                  to={`${basePath}?risk=${s.level}`}
                  className={cn(
                    'block py-1 px-1 rounded-xs hover:bg-row-hover focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                  )}
                >
                  {inner}
                </Link>
              </li>
            );
          }
          return <li key={s.level}>{inner}</li>;
        })}
      </ul>
    </div>
  );
}
