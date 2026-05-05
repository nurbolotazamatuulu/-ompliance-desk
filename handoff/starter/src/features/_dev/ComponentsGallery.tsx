/**
 * /_dev/components — Storybook-style smoke gallery всех Phase B компонентов.
 * DEV-only (route смонтирован через `import.meta.env.DEV` в routes.tsx).
 *
 * Цель: ревью Phase B = "открыл /_dev/components, увидел всё работает".
 * Не предназначено для production — это developer/reviewer tool.
 */

import { useState } from 'react';
import {
  Bell,
  CircleCheck,
  Download,
  Plus,
  Search,
  Settings,
  TriangleAlert,
} from 'lucide-react';
import Badge from '../../components/primitives/Badge';
import Button from '../../components/primitives/Button';
import Spinner from '../../components/primitives/Spinner';
import Skeleton from '../../components/primitives/Skeleton';
import Input from '../../components/primitives/Input';
import Select from '../../components/primitives/Select';
import Tabs from '../../components/primitives/Tabs';
import Dialog from '../../components/primitives/Dialog';
import Drawer from '../../components/primitives/Drawer';
import Tooltip from '../../components/primitives/Tooltip';
import Switch from '../../components/primitives/Switch';
import Checkbox from '../../components/primitives/Checkbox';
import RadioGroup from '../../components/primitives/Radio';
import Accordion from '../../components/primitives/Accordion';
import DataTable, { type Column } from '../../components/data/DataTable';
import Toolbar from '../../components/data/Toolbar';
import FilterBar from '../../components/data/FilterBar';
import BulkActionBar from '../../components/data/BulkActionBar';
import PaginationBar from '../../components/data/PaginationBar';
import KPICard from '../../components/compliance/KPICard';
import RiskScoreCard from '../../components/compliance/RiskScoreCard';
import RiskMeter from '../../components/compliance/RiskMeter';
import OverrideTriggerCard from '../../components/compliance/OverrideTriggerCard';
import SanctionMatchCard from '../../components/compliance/SanctionMatchCard';
import KYTFlag from '../../components/compliance/KYTFlag';
import RiskDistribution from '../../components/compliance/RiskDistribution';
import BvSummaryCard from '../../components/compliance/BvSummaryCard';
import PdlBadge from '../../components/compliance/PdlBadge';
import ApprovalDialog from '../../components/compliance/ApprovalDialog';
import ClientStatusBadge from '../../components/compliance/ClientStatusBadge';
import { useUIStore } from '../../stores/ui';
import { CLIENTS } from '../../mocks/clients';
import { SANCTIONS } from '../../mocks/sanctions';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-border py-6 px-6">
    <h2 className="text-lg font-semibold text-text mb-4">{title}</h2>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{children}</div>
  </section>
);

const Slot = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <div className="cd-caps text-text-mute mb-2">{label}</div>
    <div className="bg-elev rounded-sm p-3 border border-border">{children}</div>
  </div>
);

export default function ComponentsGallery() {
  const [tab, setTab] = useState('one');
  const [singleSel, setSingleSel] = useState<string | null>(null);
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [switchOn, setSwitchOn] = useState(false);
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(true);
  const [radio, setRadio] = useState<string | null>('a');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [bulkSel, setBulkSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(2);
  const pushToast = useUIStore((s) => s.pushToast);

  const selectOptions = [
    { value: 'pf', label: 'Физическое лицо' },
    { value: 'le', label: 'Юридическое лицо' },
    { value: 'le-state', label: 'Гос. ЮЛ' },
  ];

  const sampleClient = CLIENTS[0]!;
  const sampleClientCritical = CLIENTS.find((c) => c.risk.level === 'critical') ?? sampleClient;
  const sampleSanction = SANCTIONS[0];

  const columns: Column<typeof sampleClient>[] = [
    { id: 'fileNumber', header: '№ дела', cell: (r) => r.fileNumber, sortable: true, width: 130, className: 'cd-mono' },
    { id: 'name', header: 'Клиент', cell: (r) => (r.type === 'pf' ? `${r.lastName} ${r.firstName}` : r.shortName) },
    { id: 'risk', header: 'Риск', cell: (r) => r.risk.total.toFixed(1), sortable: true, width: 80, className: 'cd-mono' },
    { id: 'status', header: 'Статус', cell: (r) => <ClientStatusBadge status={r.status} />, width: 160 },
  ];
  const tableRows = CLIENTS.slice(0, 12);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="px-6 py-4 border-b border-border bg-surface sticky top-0 z-10">
        <div className="cd-caps">/_dev/components — DEV-only</div>
        <h1 className="text-xl font-semibold mt-1">Components Gallery</h1>
        <p className="text-sm text-text-mute mt-1">
          Smoke-grid всех Phase B компонентов. Используется как preview для review.
        </p>
      </header>

      {/* ───────── Primitives ───────── */}
      <Section title="Primitives">
        <Slot label="Button — variants">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" loading>Loading</Button>
            <Button variant="secondary" icon={Download}>С иконкой</Button>
          </div>
        </Slot>

        <Slot label="Badge — tones">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">NEUTRAL</Badge>
            <Badge tone="green" dot>GREEN</Badge>
            <Badge tone="yellow" dot>YELLOW</Badge>
            <Badge tone="orange" dot>ORANGE</Badge>
            <Badge tone="red" dot>RED</Badge>
            <Badge tone="blue" dot>BLUE</Badge>
          </div>
        </Slot>

        <Slot label="Spinner — sizes">
          <div className="flex items-center gap-3 text-text">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
          </div>
        </Slot>

        <Slot label="Skeleton — variants">
          <div className="flex flex-col gap-2">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="rect" height={28} width="40%" />
          </div>
        </Slot>

        <Slot label="Input — все states">
          <div className="flex flex-col gap-3">
            <Input label="ИНН" placeholder="14 цифр" prefix="ИНН:" monospace />
            <Input label="Поиск" placeholder="Найти клиента" leadingIcon={Search} />
            <Input label="Сумма" suffix="KGS" type="number" />
            <Input label="Email" hint="Корпоративный email компании" />
            <Input label="Email" error="Недопустимый формат email" />
          </div>
        </Slot>

        <Slot label="Select — single + multi">
          <div className="flex flex-col gap-3">
            <Select
              label="Тип (single)"
              options={selectOptions}
              value={singleSel}
              onChange={setSingleSel}
              placeholder="Выберите тип"
              fullWidth
            />
            <Select
              label="Типы (multi)"
              options={selectOptions}
              value={multiSel}
              onChange={setMultiSel}
              multiple
              placeholder="Выберите типы"
              fullWidth
            />
          </div>
        </Slot>

        <Slot label="Tabs — с alert">
          <Tabs
            tabs={[
              { id: 'one', label: 'Анкета' },
              { id: 'two', label: 'Скоринг' },
              { id: 'three', label: 'Санкции', alert: true },
              { id: 'four', label: 'История', badge: <Badge tone="neutral">12</Badge> },
            ]}
            active={tab}
            onChange={setTab}
          />
        </Slot>

        <Slot label="Switch / Checkbox / Radio">
          <div className="flex flex-col gap-3">
            <Switch checked={switchOn} onChange={setSwitchOn} label="Включить уведомления" />
            <Checkbox checked={check1} onChange={setCheck1} label="Согласие на обработку ПД" />
            <Checkbox checked={check2} onChange={setCheck2} indeterminate label="Indeterminate" />
            <RadioGroup
              value={radio}
              onChange={setRadio}
              options={[
                { value: 'a', label: 'Резидент' },
                { value: 'b', label: 'Нерезидент' },
              ]}
              orientation="horizontal"
            />
          </div>
        </Slot>

        <Slot label="Tooltip">
          <div className="flex items-center gap-3">
            <Tooltip content="Подсказка сверху">
              <Button variant="ghost" size="sm" icon={Bell}>Hover me</Button>
            </Tooltip>
            <Tooltip content="Справа" side="right">
              <Button variant="ghost" size="sm" icon={Settings}>Right</Button>
            </Tooltip>
          </div>
        </Slot>

        <Slot label="Dialog">
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Открыть Dialog
          </Button>
          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Изменить статус клиента"
            subtitle="ОсОО «Бишкек Крипто Брокер»"
            size="md"
            footer={
              <>
                <Button variant="ghost" onClick={() => setDialogOpen(false)}>Отмена</Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>Применить</Button>
              </>
            }
          >
            <p className="text-sm">Тестовое содержимое dialog'а. Esc и backdrop-click закрывают.</p>
          </Dialog>
        </Slot>

        <Slot label="Drawer">
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Открыть Drawer (520)
          </Button>
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title="Анкета БВ"
            subtitle="Новый бенефициарный владелец"
            width={520}
            footer={
              <>
                <Button variant="ghost" onClick={() => setDrawerOpen(false)}>Отмена</Button>
                <Button variant="primary" onClick={() => setDrawerOpen(false)}>Сохранить</Button>
              </>
            }
          >
            <p className="text-sm">Drawer для long-form форм (Анкета БВ, ПДЛ).</p>
          </Drawer>
        </Slot>

        <Slot label="Toast — push 4 tones">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" icon={CircleCheck} onClick={() => pushToast({ tone: 'success', title: 'Сохранено', description: 'Изменения применены.' })}>Success</Button>
            <Button variant="ghost" icon={Bell} onClick={() => pushToast({ tone: 'info', title: 'Уведомление', description: 'Новое событие в ленте.' })}>Info</Button>
            <Button variant="ghost" icon={TriangleAlert} onClick={() => pushToast({ tone: 'warning', title: 'Внимание', description: 'SLA подходит к концу.' })}>Warning</Button>
            <Button variant="ghost" onClick={() => pushToast({ tone: 'error', title: 'Ошибка', description: 'Не удалось сохранить.' })}>Error</Button>
          </div>
        </Slot>

        <Slot label="Accordion — 3 sections">
          <Accordion
            defaultOpen={['s1']}
            sections={[
              {
                id: 's1',
                title: 'Глава 1. Идентификация',
                subtitle: 'Заполнено 100%',
                indicator: <Badge tone="green" dot>OK</Badge>,
                content: <p className="text-sm">Содержимое первой главы.</p>,
              },
              { id: 's2', title: 'Глава 2. Адреса', subtitle: 'Заполнено 60%', content: <p className="text-sm">Содержимое второй главы.</p> },
              { id: 's3', title: 'Глава 3. Контакты', subtitle: 'Не заполнено', content: <p className="text-sm">Содержимое третьей главы.</p> },
            ]}
          />
        </Slot>
      </Section>

      {/* ───────── Data ───────── */}
      <Section title="Data components">
        <Slot label="Toolbar + FilterBar">
          <div className="bg-bg rounded-sm overflow-hidden">
            <Toolbar
              search={<Input placeholder="Поиск по ИНН, ФИО, № дела" leadingIcon={Search} fullWidth />}
              counter="НАЙДЕНО 12"
              actions={<Button variant="primary" size="sm" icon={Plus}>Создать</Button>}
            />
            <FilterBar
              chips={[
                { id: 'risk-high', label: 'Риск: ВЫСОКИЙ', onRemove: () => {} },
                { id: 'type-le', label: 'Тип: ЮЛ', onRemove: () => {} },
                { id: 'sla-now', label: 'SLA: <12ч', onRemove: () => {} },
              ]}
              onResetAll={() => {}}
            />
          </div>
        </Slot>

        <Slot label="DataTable — selectable + sortable">
          <DataTable
            columns={columns}
            rows={tableRows}
            rowKey={(r) => r.id}
            selectable
            selectedIds={bulkSel}
            onSelectionChange={setBulkSel}
            rowTone={(r) => (r.risk.level === 'critical' ? 'red' : r.risk.level === 'high' ? 'orange' : undefined)}
          />
          <BulkActionBar
            count={bulkSel.size}
            onClear={() => setBulkSel(new Set())}
            actions={
              <>
                <Button variant="secondary" size="sm">Назначить офицера</Button>
                <Button variant="secondary" size="sm">Изменить статус</Button>
                <Button variant="secondary" size="sm">Экспорт CSV</Button>
              </>
            }
          />
        </Slot>

        <Slot label="PaginationBar">
          <PaginationBar page={page} perPage={50} total={1248} onChange={setPage} />
        </Slot>

        <Slot label="DataTable — loading + empty">
          <div className="grid grid-cols-1 gap-3">
            <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading />
            <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={<span className="text-sm text-text-mute">Ничего не найдено по фильтрам</span>} />
          </div>
        </Slot>
      </Section>

      {/* ───────── Compliance ───────── */}
      <Section title="Compliance">
        <Slot label="KPICard — 4 tones">
          <div className="grid grid-cols-2 gap-3">
            <KPICard label="В работе" value={42} delta="+6 за 7д ↑" tone="neutral" />
            <KPICard label="Новые сегодня" value={8} delta="+1 ↑" tone="blue" />
            <KPICard label="SLA-риск" value={5} delta="≤4ч у 2" tone="orange" />
            <KPICard label="Critical" value={2} delta="2 override" tone="red" />
          </div>
        </Slot>

        <Slot label="RiskScoreCard — compact + expanded">
          <div className="flex flex-col gap-3">
            <RiskScoreCard score={sampleClient.risk} canRecalculate />
            <RiskScoreCard score={sampleClientCritical.risk} canRecalculate expanded />
          </div>
        </Slot>

        <Slot label="RiskMeter — 4 tones">
          <div className="flex flex-col gap-3">
            <div><div className="cd-caps">Low (15)</div><RiskMeter value={15} tone="green" className="mt-1" /></div>
            <div><div className="cd-caps">Medium (45)</div><RiskMeter value={45} tone="yellow" className="mt-1" /></div>
            <div><div className="cd-caps">High (68)</div><RiskMeter value={68} tone="orange" className="mt-1" /></div>
            <div><div className="cd-caps">Critical (92)</div><RiskMeter value={92} tone="red" className="mt-1" /></div>
          </div>
        </Slot>

        {sampleClientCritical.risk.overrideTrigger && (
          <Slot label="OverrideTriggerCard">
            <OverrideTriggerCard trigger={sampleClientCritical.risk.overrideTrigger} />
          </Slot>
        )}

        {sampleSanction && (
          <Slot label="SanctionMatchCard — open + resolved">
            <div className="flex flex-col gap-3">
              <SanctionMatchCard match={sampleSanction} onTrueMatch={() => {}} onFalsePositive={() => {}} />
            </div>
          </Slot>
        )}

        <Slot label="KYTFlag — 4 codes">
          <div className="flex flex-wrap gap-2">
            <KYTFlag code="sanctioned_address" />
            <KYTFlag code="mixer" />
            <KYTFlag code="darknet_market" />
            <KYTFlag code="high_risk_jurisdiction" />
            <KYTFlag code="velocity" />
            <KYTFlag code="amount_threshold" />
          </div>
        </Slot>

        <Slot label="RiskDistribution — donut">
          <RiskDistribution counts={{ low: 38, medium: 32, high: 22, critical: 8 }} basePath="/clients" />
        </Slot>

        <Slot label="BvSummaryCard + PdlBadge">
          <div className="flex flex-col gap-2">
            <BvSummaryCard
              bv={{
                id: 'BV-1',
                type: 'natural',
                fullName: 'Иванов Алексей Петрович',
                share: 35.5,
                controlBasis: 'direct',
                pep: false,
                parents: [],
                is_pdl: true,
              }}
            />
            <BvSummaryCard
              bv={{
                id: 'BV-2',
                type: 'natural',
                fullName: 'Орозова Жылдыз',
                share: 28.0,
                controlBasis: 'direct',
                pep: true,
                parents: [],
              }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm">Карточка БВ может содержать:</span>
            <PdlBadge />
          </div>
        </Slot>

        <Slot label="ApprovalDialog (4 kinds — открыть risk_override)">
          <Button variant="danger" onClick={() => setApprovalOpen(true)}>
            Override Dialog
          </Button>
          <ApprovalDialog
            open={approvalOpen}
            onClose={() => setApprovalOpen(false)}
            onSubmit={async (data) => {
              await new Promise((r) => setTimeout(r, 600));
              pushToast({ tone: 'success', title: 'Override применён', description: data.justification.slice(0, 60) + '...' });
            }}
            kind="risk_override"
            context={{ clientName: sampleClient.type === 'le' ? sampleClient.shortName : sampleClient.id, currentLevel: sampleClient.risk.level }}
          />
        </Slot>
      </Section>

      <footer className="px-6 py-4 text-2xs text-text-mute">
        Phase B Components Gallery — Stage 2 / handoff-frontend.
      </footer>
    </div>
  );
}
