/**
 * Side-panel: назначенный комплаенс-офицер + кнопка [Изменить].
 *
 * Кнопка permission-gated через CLIENT_WRITE (Q-frontend-K). Disabled
 * вариант обёрнут в Tooltip с user-facing формулировкой (без кодов).
 *
 * Real change-officer flow — Phase E3 (через Drawer + useAssignOfficer
 * mutation). В E1 кнопка только показывает заглушку через console.log,
 * чтобы protect actual mock state.
 */

import { UserCog } from 'lucide-react';
import type { Client, User } from '../../../types';
import { formatDate } from '../../../lib/format';
import { mapLegacyRole } from '../../../types/rbac';
import { ROLE_PERMISSIONS_MOCK } from '../../../types/rbac';
import Button from '../../../components/primitives/Button';
import Tooltip from '../../../components/primitives/Tooltip';

type Props = {
  client: Client;
  officer: User | undefined;
  currentUser: User | undefined;
};

export default function AssignmentCard({ client, officer, currentUser }: Props) {
  const canWrite = currentUser
    ? ROLE_PERMISSIONS_MOCK[mapLegacyRole(currentUser.role)].has('CLIENT_WRITE')
    : false;

  const button = (
    <Button
      variant="ghost"
      size="sm"
      icon={UserCog}
      disabled={!canWrite}
      onClick={() => {
        // E3 заменит на реальный openOfficerDrawer()
        console.log('[E1] Изменить офицера — placeholder');
      }}
    >
      Изменить
    </Button>
  );

  return (
    <div className="bg-surface border border-border rounded-sm p-3">
      <div className="cd-caps">Офицер</div>
      <div className="mt-2 text-sm text-text">
        {officer ? officer.fullName : <span className="text-text-ghost">Не назначен</span>}
      </div>
      {officer?.role && <div className="mt-1 cd-caps text-text-dim">{officer.role}</div>}
      <div className="mt-2 cd-mono text-2xs text-text-dim">
        Обновлён {formatDate(client.updatedAt)}
      </div>
      <div className="mt-3">
        {canWrite ? (
          button
        ) : (
          <Tooltip content="Нужна роль с правом редактирования карточки клиента">{button}</Tooltip>
        )}
      </div>
    </div>
  );
}
