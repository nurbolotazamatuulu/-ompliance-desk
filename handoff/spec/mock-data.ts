/**
 * ComplianceDesk · Реалистичные мок-данные.
 * Скопируй в src/mocks/. Цель — чтобы в реестре было видно настоящее разнообразие
 * статусов, рисков, юрисдикций; чтобы дашборд показывал живые цифры.
 *
 * Все генераторы детерминированы (seed): одинаковый набор от запуска к запуску.
 */

import type {
  Client, PfClient, LeClient, ClientStatus, RiskLevel,
  Transaction, SanctionMatch, AuditEvent, User, Document,
  KYTFlagCode, SanctionList, ChainAddress, ID,
} from '../types';

// ─── seeded RNG ─────────────────────────────────────────────────────────
let seed = 42;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const pad = (n: number, w: number) => String(n).padStart(w, '0');

// ─── справочники ────────────────────────────────────────────────────────
const LE_NAMES = [
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

const PF_LAST = ['Калыкова','Бекмурзаев','Жумабекова','Турдугулов','Маматова','Айтматов','Усенов','Касымов','Бакиева','Сулайманов','Орозова','Аширбаев','Жээнбекова','Дуйшенов','Алимбаева'];
const PF_FIRST_M = ['Айбек','Талант','Эрлан','Бакыт','Нурлан','Каныбек','Алмаз','Чыңгыз','Эльмир','Манас'];
const PF_FIRST_F = ['Айгуль','Бермет','Чолпон','Жылдыз','Назгүл','Эркингүл','Дамира','Айзада','Нуржан','Алия'];

const REGIONS_KG = ['Чуйская','Иссык-Кульская','Нарынская','Таласская','Ошская','Джалал-Абадская','Баткенская'];
const CITIES_KG = ['Бишкек','Ош','Жалал-Абад','Каракол','Токмок','Кара-Балта','Талас','Нарын','Балыкчы','Узген','Кызыл-Кыя'];
const STREETS_KG = ['ул. Чуй','ул. Манаса','пр. Эркиндик','ул. Жибек Жолу','ул. Тыныстанова','ул. Ибраимова','ул. Боконбаева','ул. Раззакова','ул. Юнусалиева','пр. Айтматова'];

const STATUSES: { s: ClientStatus; w: number }[] = [
  { s: 'in_review', w: 25 }, { s: 'approved', w: 28 }, { s: 'awaiting_docs', w: 12 },
  { s: 'submitted', w: 10 }, { s: 'rejected', w: 8 }, { s: 'suspended', w: 6 },
  { s: 'draft', w: 8 }, { s: 'closed', w: 3 },
];
const weighted = <T,>(items: { s: T; w: number }[]) => {
  const total = items.reduce((a, b) => a + b.w, 0);
  let r = rng() * total;
  for (const it of items) { if ((r -= it.w) <= 0) return it.s; }
  return items[0].s;
};

const innLE = () => range(14).map(() => Math.floor(rng() * 10)).join('');
const innPF = () => '2' + range(13).map(() => Math.floor(rng() * 10)).join('');
const okpo = () => range(8).map(() => Math.floor(rng() * 10)).join('');
const passportKG = () => {
  const letters = 'ABCEHKMOPTXY';
  return pick(letters.split('')) + pick(letters.split('')) + range(7).map(() => Math.floor(rng() * 10)).join('');
};
const isoDateBetween = (start: Date, end: Date) => {
  const t = start.getTime() + rng() * (end.getTime() - start.getTime());
  return new Date(t).toISOString();
};

// ─── риск ───────────────────────────────────────────────────────────────
const riskFor = (status: ClientStatus) => {
  // привязываем правдоподобно: rejected/suspended → высокие; approved → ниже
  const baseByStatus: Record<ClientStatus, [number, number]> = {
    draft: [10, 40], submitted: [20, 60], in_review: [25, 75],
    awaiting_docs: [30, 65], approved: [10, 45], rejected: [55, 95],
    suspended: [60, 95], closed: [10, 80],
  };
  const [lo, hi] = baseByStatus[status];
  const total = +(lo + rng() * (hi - lo)).toFixed(1);
  const level: RiskLevel = total < 30 ? 'low' : total < 50 ? 'medium' : total < 75 ? 'high' : 'critical';
  return {
    total,
    level,
    categories: {
      profile:      +(total * (0.7 + rng() * 0.5)).toFixed(1),
      assets:       +(total * (0.7 + rng() * 0.5)).toFixed(1),
      transactions: +(total * (0.8 + rng() * 0.5)).toFixed(1),
      control:      +(total * (0.6 + rng() * 0.5)).toFixed(1),
    },
    updatedAt: isoDateBetween(new Date('2026-04-01'), new Date('2026-05-03')),
    overrideTrigger: total >= 80 ? {
      code: 'C4.5',
      reason: 'Прямая связь с санкционным адресом ≤1 hop',
      forcedLevel: 'critical' as RiskLevel,
      triggeredAt: isoDateBetween(new Date('2026-04-15'), new Date('2026-05-03')),
    } : undefined,
  };
};

// ─── клиенты ────────────────────────────────────────────────────────────
export const generateClients = (n: number): Client[] => {
  const list: Client[] = [];
  for (let i = 0; i < n; i++) {
    const isLE = rng() > 0.45;
    const status = weighted(STATUSES);
    const id = `CL-${pad(i + 1, 5)}`;
    const created = isoDateBetween(new Date('2024-01-01'), new Date('2026-04-30'));

    if (isLE) {
      const [name] = pick(LE_NAMES);
      list.push({
        id, type: 'le', status, risk: riskFor(status),
        createdAt: created, updatedAt: created,
        inn: innLE(),
        fileNumber: `ЮЛ-${new Date(created).getFullYear()}-${pad(i + 1, 5)}`,
        tags: rng() > 0.6 ? ['VIP'] : [],
        fullName: `Общество с ограниченной ответственностью «${name}»`,
        shortName: `ОсОО "${name}"`,
        okpo: okpo(),
        registeredAt: created.slice(0, 10),
        registeredBy: 'Минюст КР, г. ' + pick(['Бишкек', 'Ош']),
        legalAddress: {
          country: 'KG', region: pick(REGIONS_KG),
          city: pick(CITIES_KG), street: pick(STREETS_KG),
          building: String(Math.floor(rng() * 250) + 1),
          apartment: rng() > 0.5 ? `оф. ${Math.floor(rng() * 500) + 100}` : undefined,
          postalCode: '7' + pad(Math.floor(rng() * 99999), 5),
        },
        industry: pick(['Виртуальные активы','Финтех','Майнинг','Инвестиции','Холдинг']),
        beneficialOwners: [],
        signatories: [],
        authorizedCapital: { amount: Math.floor(rng() * 50000000) + 100000, currency: 'KGS' },
        licenses: [],
      } as LeClient);
    } else {
      const female = rng() > 0.5;
      const last = pick(PF_LAST);
      const first = female ? pick(PF_FIRST_F) : pick(PF_FIRST_M);
      list.push({
        id, type: 'pf', status, risk: riskFor(status),
        createdAt: created, updatedAt: created,
        inn: innPF(),
        fileNumber: `ФЛ-${new Date(created).getFullYear()}-${pad(i + 1, 5)}`,
        tags: rng() > 0.85 ? ['PEP'] : [],
        lastName: last, firstName: first,
        middleName: pick(['кызы','уулу','Алмазовна','Бакытовна','Эрланович']),
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
          country: 'KG', region: pick(REGIONS_KG),
          city: pick(CITIES_KG), street: pick(STREETS_KG),
          building: String(Math.floor(rng() * 250) + 1),
        },
        pep: rng() > 0.92,
      } as PfClient);
    }
  }
  return list;
};

export const CLIENTS = generateClients(120);

// ─── санкции, транзакции, аудит, документы — заглушки-генераторы ──────────
// (расширяй по тому же шаблону; формат задан в data-model.ts)

export const generateSanctionMatches = (clients: Client[]): SanctionMatch[] => {
  const lists: SanctionList[] = ['KG_GSFR','OFAC_SDN','EU_CFSP','UN_SC','UK_OFSI','INTERNAL'];
  const out: SanctionMatch[] = [];
  clients.forEach((c, i) => {
    if (rng() > 0.85) {
      out.push({
        id: `SM-${pad(i, 5)}`,
        clientId: c.id,
        list: pick(lists),
        matchedField: pick(['name','inn','address','wallet'] as const),
        matchedValue: c.type === 'le' ? c.shortName : `${c.lastName} ${c.firstName}`,
        similarity: +(0.7 + rng() * 0.3).toFixed(2),
        recordRef: 'REF-' + pad(Math.floor(rng() * 99999), 5),
        recordSummary: 'Запись из санкционного списка с похожими реквизитами',
        detectedAt: isoDateBetween(new Date('2026-03-01'), new Date('2026-05-03')),
        status: pick(['new','in_review','false_positive','true_match'] as const),
      });
    }
  });
  return out;
};

export const SANCTIONS = generateSanctionMatches(CLIENTS);

export const generateTransactions = (clients: Client[], n: number): Transaction[] => {
  const flags: KYTFlagCode[] = ['sanctioned_address','mixer','darknet_market','high_risk_jurisdiction','structuring','velocity','amount_threshold','new_counterparty','pep_counterparty'];
  return range(n).map(i => {
    const c = pick(clients);
    const flagged = rng() > 0.7;
    const blocked = flagged && rng() > 0.5;
    return {
      id: `TX-${pad(i + 1, 6)}`,
      clientId: c.id,
      direction: rng() > 0.5 ? 'in' : 'out',
      status: blocked ? 'blocked' : flagged ? 'flagged' : 'completed',
      asset: pick(['USDT','BTC','ETH','TRX','USDC']),
      amount: +(rng() * 50000).toFixed(4),
      fiatAmount: { amount: Math.floor(rng() * 5000000), currency: 'KGS' as const },
      rate: +(rng() * 90 + 80).toFixed(2),
      counterpartyAddress: '0x' + range(40).map(() => '0123456789abcdef'[Math.floor(rng() * 16)]).join(''),
      counterpartyJurisdiction: pick(['KG','RU','US','AE','SG','GB','TR','??']),
      txHash: '0x' + range(64).map(() => '0123456789abcdef'[Math.floor(rng() * 16)]).join(''),
      network: pick(['tron','ethereum','bitcoin']),
      initiatedAt: isoDateBetween(new Date('2026-04-01'), new Date('2026-05-03')),
      flags: flagged ? [{
        code: pick(flags),
        severity: pick(['low','medium','high','critical'] as const),
        detail: 'Авто-детект KYT-фидом',
      }] : [],
      blockedReason: blocked ? 'Совпадение по санкционному адресу' : undefined,
    } as Transaction;
  });
};

export const TRANSACTIONS = generateTransactions(CLIENTS, 250);

export const USERS: User[] = [
  { id: 'U-1', fullName: 'Айгуль Калыкова', email: 'a.kalykova@vasp.kg', role: 'compliance_officer', permissions: [], active: true, createdAt: '2024-01-15T09:00:00Z', lastLoginAt: '2026-05-03T07:30:00Z' },
  { id: 'U-2', fullName: 'Нурлан Бекмурзаев', email: 'n.bekmurzaev@vasp.kg', role: 'compliance_lead', permissions: [], active: true, createdAt: '2023-09-01T09:00:00Z', lastLoginAt: '2026-05-03T08:10:00Z' },
  { id: 'U-3', fullName: 'Бермет Турдугулова', email: 'b.turdugulova@vasp.kg', role: 'operator', permissions: [], active: true, createdAt: '2024-06-12T09:00:00Z' },
  { id: 'U-4', fullName: 'Эрлан Сулайманов', email: 'e.sulaimanov@vasp.kg', role: 'admin', permissions: [], active: true, createdAt: '2023-05-20T09:00:00Z' },
  { id: 'U-5', fullName: 'Жылдыз Орозова', email: 'j.orozova@audit.kg', role: 'auditor', permissions: [], active: true, createdAt: '2025-01-10T09:00:00Z' },
];
