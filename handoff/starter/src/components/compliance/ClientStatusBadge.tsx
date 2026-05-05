import type { ClientStatus } from '../../types';
import { clientStatusLabel, clientStatusTone } from '../../lib/risk';
import Badge from '../primitives/Badge';

type Props = {
  status: ClientStatus;
};

export default function ClientStatusBadge({ status }: Props) {
  return (
    <Badge tone={clientStatusTone[status]} dot role="status">
      {clientStatusLabel[status]}
    </Badge>
  );
}
