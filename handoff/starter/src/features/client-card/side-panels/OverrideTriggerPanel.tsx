/**
 * Conditional side-panel: показывается если client.risk.overrideTrigger
 * присутствует. Стек-positioned самым верхом — самый critical alert.
 *
 * Wrapper над Phase B `OverrideTriggerCard`, добавляет cd-caps лейбл
 * "Внимание" над компонентом для контекста в side-panel layout.
 */

import type { OverrideTrigger } from '../../../types';
import OverrideTriggerCard from '../../../components/compliance/OverrideTriggerCard';

type Props = { trigger: OverrideTrigger };

export default function OverrideTriggerPanel({ trigger }: Props) {
  return <OverrideTriggerCard trigger={trigger} />;
}
