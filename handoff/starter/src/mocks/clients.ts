/**
 * Мок-генератор клиентов.
 * Цель — наполнить реестр и доменные экраны достаточным разнообразием для проверки UI:
 * статусы, риски, юрисдикции, ИНН. Базируется на seeded RNG из ./_rng.ts.
 */

import type {
  Client,
  ClientStatus,
  LeClient,
  PfClient,
  RiskLevel,
} from '../types';
import { isoDateBetween, pad, pick, range, rng, weighted } from './_rng';

// ─── Справочники ────────────────────────────────────────────────────────

const LE_NAMES: ReadonlyArray<readonly [string, string]> = [
  ['Бишкек Крипто Брокер', 'commercial'],
  ['Crypto Bridge KG', 'commercial'],
  ['Манас Диджитал Эксчейндж', 'commercial'],
  ['Иссык-Куль Файненс', 'commercial'],
  ['ОшПэй Технолоджис', 'fintech'],
  ['Ала-Тоо Капитал', 'investment'],
  ['Тянь-Шань Маининг', 'mining'],
  ['КаракольКоин', 'commercial'],
  ['Жалал-Абад Активы', 'commercial'],
  ['Нарын Блокчейн Лаб', 'rd'],
  ['Чуй Виртуальные Активы', 'commercial'],
  ['Сулайман Диджитал', 'commercial'],
  ['Талас Стэйблкоин Сервис', 'fintech'],
  ['Ала-Арча Крипто Холдинг', 'holding'],
  ['Ат-Башы Диджитал Ассетс', 'commercial'],
];

const PF_LAST = ['Калыкова', 'Бекмурзаев', 'Жумабекова', 'Турдугулов', 'Маматова', 'Айтматов', 'Усенов', 'Касымов', 'Бакиева', 'Сулайманов', 'Орозова', 'Аширбаев', 'Жээнбекова', 'Дуйшенов', 'Алимбаева'];
const PF_FIRST_M = ['Айбек', 'Талант', 'Эрлан', 'Бакыт', 'Нурлан', 'Каныбек', 'Алмаз', 'Чыңгыз', 'Эльмир', 'Манас'];
const PF_FIRST_F = ['Айгуль', 'Бермет', 'Чолпон', 'Жылдыз', 'Назгүл', 'Эркингүл', 'Дамира', 'Айзада', 'Нуржан', 'Алия'];

const REGIONS_KG = ['Чуйская', 'Иссык-Кульская', 'Нарынская', 'Таласская', 'Ошская', 'Джалал-Абадская', 'Баткенская'];
const CITIES_KG = ['Бишкек', 'Ош', 'Жалал-Абад', 'Каракол', 'Токмок', 'Кара-Балта', 'Талас', 'Нарын', 'Балыкчы', 'Узген', 'Кызыл-Кыя'];
const STREETS_KG = ['ул. Чуй', 'ул. Манаса', 'пр. Эркиндик', 'ул. Жибек Жолу', 'ул. Тыныстанова', 'ул. Ибраимова', 'ул. Боконбаева', 'ул. Раззакова', 'ул. Юнусалиева', 'пр. Айтматова'];

const STATUSES: { s: ClientStatus; w: number }[] = [
  { s: 'in_review', w: 25 },
  { s: 'approved', w: 28 },
  { s: 'awaiting_docs', w: 12 },
  { s: 'submitted', w: 10 },
  { s: 'rejected', w: 8 },
  { s: 'suspended', w: 6 },
  { s: 'draft', w: 8 },
  { s: 'closed', w: 3 },
];

// ─── Генераторы низкого уровня ──────────────────────────────────────────

const innLE = () => range(14).map(() => Math.floor(rng() * 10)).join('');
const innPF = () => '2' + range(13).map(() => Math.floor(rng() * 10)).join('');
const okpo = () => range(8).map(() => Math.floor(rng() * 10)).join('');

const passportKG = () => {
  const letters = 'ABCEHKMOPTXY';
  return (
    pick(letters.split('')) +
    pick(letters.split('')) +
    range(7).map(() => Math.floor(rng() * 10)).join('')
  );
};

const riskFor = (status: ClientStatus) => {
  // Привязываем правдоподобно: rejected/suspended → высокие; approved → ниже.
  const baseByStatus: Record<ClientStatus, [number, number]> = {
    draft: [10, 40],
    submitted: [20, 60],
    in_review: [25, 75],
    awaiting_docs: [30, 65],
    approved: [10, 45],
    rejected: [55, 95],
    suspended: [60, 95],
    closed: [10, 80],
  };
  const [lo, hi] = baseByStatus[status];
  const total = +(lo + rng() * (hi - lo)).toFixed(1);
  const level: RiskLevel = total < 30 ? 'low' : total < 50 ? 'medium' : total < 75 ? 'high' : 'critical';
  return {
    total,
    level,
    categories: {
      profile: +(total * (0.7 + rng() * 0.5)).toFixed(1),
      assets: +(total * (0.7 + rng() * 0.5)).toFixed(1),
      transactions: +(total * (0.8 + rng() * 0.5)).toFixed(1),
      control: +(total * (0.6 + rng() * 0.5)).toFixed(1),
    },
    updatedAt: isoDateBetween(new Date('2026-04-01'), new Date('2026-05-03')),
    overrideTrigger:
      total >= 80
        ? {
            code: 'C4.5',
            reason: 'Прямая связь с санкционным адресом ≤1 hop',
            forcedLevel: 'critical' as RiskLevel,
            triggeredAt: isoDateBetween(new Date('2026-04-15'), new Date('2026-05-03')),
          }
        : undefined,
  };
};

// ─── Главный генератор ──────────────────────────────────────────────────

/**
 * Назначает slaDeadline ~7 клиентам со статусами `in_review`/`awaiting_docs`,
 * относительно момента запуска приложения:
 *   - первые 2 → 0.5–3.5ч → red rowTone, попадают в Queue вверх
 *   - остальные 5 → 4.5–11.5ч → orange tone, поднимают KPI «SLA-риск»
 * Это даёт визуально проверяемое состояние: KPI orange + критическую row.
 */
const assignSlaDeadlines = (list: Client[]): void => {
  const now = Date.now();
  const candidates = list.filter(
    (c) => c.status === 'in_review' || c.status === 'awaiting_docs',
  );
  const targets = candidates.slice(0, 7);
  targets.forEach((c, idx) => {
    const hours = idx < 2 ? 0.5 + rng() * 3.0 : 4.5 + rng() * 7.0;
    const deadline = new Date(now + hours * 60 * 60 * 1000).toISOString();
    (c as { slaDeadline?: string }).slaDeadline = deadline;
  });
};

export const generateClients = (n: number): Client[] => {
  const list: Client[] = [];
  for (let i = 0; i < n; i++) {
    const isLE = rng() > 0.45;
    const status = weighted(STATUSES);
    const id = `CL-${pad(i + 1, 5)}`;
    const created = isoDateBetween(new Date('2024-01-01'), new Date('2026-04-30'));

    if (isLE) {
      const [name] = pick(LE_NAMES);
      const le: LeClient = {
        id,
        type: 'le',
        status,
        risk: riskFor(status),
        createdAt: created,
        updatedAt: created,
        inn: innLE(),
        fileNumber: `ЮЛ-${new Date(created).getFullYear()}-${pad(i + 1, 5)}`,
        tags: rng() > 0.6 ? ['VIP'] : [],
        fullName: `Общество с ограниченной ответственностью «${name}»`,
        shortName: `ОсОО "${name}"`,
        okpo: okpo(),
        registeredAt: created.slice(0, 10),
        registeredBy: 'Минюст КР, г. ' + pick(['Бишкек', 'Ош']),
        legalAddress: {
          country: 'KG',
          region: pick(REGIONS_KG),
          city: pick(CITIES_KG),
          street: pick(STREETS_KG),
          building: String(Math.floor(rng() * 250) + 1),
          apartment: rng() > 0.5 ? `оф. ${Math.floor(rng() * 500) + 100}` : undefined,
          postalCode: '7' + pad(Math.floor(rng() * 99999), 5),
        },
        industry: pick(['Виртуальные активы', 'Финтех', 'Майнинг', 'Инвестиции', 'Холдинг']),
        beneficialOwners: [],
        signatories: [],
        authorizedCapital: { amount: Math.floor(rng() * 50000000) + 100000, currency: 'KGS' },
        licenses: [],
      };
      list.push(le);
    } else {
      const female = rng() > 0.5;
      const last = pick(PF_LAST);
      const first = female ? pick(PF_FIRST_F) : pick(PF_FIRST_M);
      const pf: PfClient = {
        id,
        type: 'pf',
        status,
        risk: riskFor(status),
        createdAt: created,
        updatedAt: created,
        inn: innPF(),
        fileNumber: `ФЛ-${new Date(created).getFullYear()}-${pad(i + 1, 5)}`,
        tags: rng() > 0.85 ? ['PEP'] : [],
        lastName: last,
        firstName: first,
        middleName: pick(['кызы', 'уулу', 'Алмазовна', 'Бакытовна', 'Эрланович']),
        birthDate: isoDateBetween(new Date('1965-01-01'), new Date('2005-12-31')).slice(0, 10),
        birthPlace: 'г. ' + pick(CITIES_KG),
        citizenship: 'KG',
        passport: {
          series: passportKG().slice(0, 2),
          number: passportKG().slice(2),
          issuedBy: 'МКК ' + pick(REGIONS_KG),
          issuedAt: '2018-' + pad(Math.floor(rng() * 12) + 1, 2) + '-' + pad(Math.floor(rng() * 28) + 1, 2),
          expiresAt: '2028-' + pad(Math.floor(rng() * 12) + 1, 2) + '-' + pad(Math.floor(rng() * 28) + 1, 2),
        },
        registrationAddress: {
          country: 'KG',
          region: pick(REGIONS_KG),
          city: pick(CITIES_KG),
          street: pick(STREETS_KG),
          building: String(Math.floor(rng() * 250) + 1),
        },
        pep: rng() > 0.92,
      };
      list.push(pf);
    }
  }
  assignSlaDeadlines(list);
  return list;
};

export const CLIENTS: Client[] = generateClients(120);
