import type { User } from '../types';

export const USERS: User[] = [
  {
    id: 'U-1',
    fullName: 'Айгуль Калыкова',
    email: 'a.kalykova@vasp.kg',
    role: 'compliance_officer',
    permissions: [],
    active: true,
    createdAt: '2024-01-15T09:00:00Z',
    lastLoginAt: '2026-05-03T07:30:00Z',
  },
  {
    id: 'U-2',
    fullName: 'Нурлан Бекмурзаев',
    email: 'n.bekmurzaev@vasp.kg',
    role: 'compliance_lead',
    permissions: [],
    active: true,
    createdAt: '2023-09-01T09:00:00Z',
    lastLoginAt: '2026-05-03T08:10:00Z',
  },
  {
    id: 'U-3',
    fullName: 'Бермет Турдугулова',
    email: 'b.turdugulova@vasp.kg',
    role: 'operator',
    permissions: [],
    active: true,
    createdAt: '2024-06-12T09:00:00Z',
  },
  {
    id: 'U-4',
    fullName: 'Эрлан Сулайманов',
    email: 'e.sulaimanov@vasp.kg',
    role: 'admin',
    permissions: [],
    active: true,
    createdAt: '2023-05-20T09:00:00Z',
  },
  {
    id: 'U-5',
    fullName: 'Жылдыз Орозова',
    email: 'j.orozova@audit.kg',
    role: 'auditor',
    permissions: [],
    active: true,
    createdAt: '2025-01-10T09:00:00Z',
  },
];

/** Текущий вошедший офицер для UI mock-режима. */
export const CURRENT_USER: User = USERS[0];
