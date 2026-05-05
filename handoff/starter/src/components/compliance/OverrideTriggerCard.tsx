import { OctagonAlert } from 'lucide-react';
import type { OverrideTrigger } from '../../types';
import { formatDateTime } from '../../lib/format';

type Props = {
  trigger: OverrideTrigger;
};

/**
 * Карточка-предупреждение в правой панели ClientCard когда есть
 * `client.risk.overrideTrigger`. Красная рамка + заголовок cd-caps red.
 */
export default function OverrideTriggerCard({ trigger }: Props) {
  return (
    <div role="alert" className="border border-red/35 rounded-sm bg-red-soft p-3">
      <div className="flex items-center gap-2 text-red">
        <span className="inline-block w-1.5 h-1.5 rounded-pill bg-red" aria-hidden="true" />
        <span className="cd-caps">Override-триггер</span>
        <OctagonAlert size={14} className="ml-auto" aria-hidden="true" />
      </div>
      <div className="mt-2 cd-mono text-2xs text-red">{trigger.code}</div>
      <div className="mt-1 text-sm text-text">{trigger.reason}</div>
      <div className="mt-2 cd-caps text-text-mute">
        Авто-поднятие до {trigger.forcedLevel.toUpperCase()} ·{' '}
        <span className="cd-mono">{formatDateTime(trigger.triggeredAt)}</span>
      </div>
    </div>
  );
}
