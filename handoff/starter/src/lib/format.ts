/**
 * Форматтеры для отображения регуляторных полей (КГ): ИНН, паспорт, ОКПО,
 * деньги, даты, адреса. Все импорты date-fns с локалью ru.
 *
 * Принципы:
 * - input всегда «как пришло из API»; output — для отображения, не для записи обратно.
 * - mono-формы для табличных колонок и полей паспорта (фиксированной ширины).
 */

import { format, formatDistanceToNowStrict } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Money } from '../types';

/** Форматирует 14-значный ИНН в группах 4-4-4-2 (для удобства чтения). */
export const formatINN = (inn: string): string => {
  const clean = inn.replace(/\D/g, '');
  if (clean.length !== 14) return inn;
  return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12)}`;
};

/** Паспорт KG: серия (2 буквы) + 7 цифр → "AN 0123456". */
export const formatPassport = (series: string, number: string): string => {
  return `${series} ${number}`;
};

/** ОКПО — ровно 8 цифр; никакого форматирования, только нормализация. */
export const formatOkpo = (okpo: string): string => okpo.replace(/\D/g, '').padStart(8, '0').slice(0, 8);

/** Денежная сумма с разделителями групп (NBSP) и кодом валюты. */
export const formatMoney = (m: Money): string => {
  const fmt = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: m.amount % 1 === 0 ? 0 : 2,
  });
  return `${fmt.format(m.amount)} ${m.currency}`;
};

/** Число — для табличных колонок (tnum). */
export const formatNumber = (n: number, fractionDigits = 1): string => {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(n);
};

/** Короткая дата DD.MM.YYYY (для табличных ячеек). */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return format(d, 'dd.MM.yyyy', { locale: ru });
};

/** Дата + время DD.MM.YYYY HH:mm (для аудит-лога). */
export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return format(d, 'dd.MM.yyyy HH:mm', { locale: ru });
};

/** Относительное время «N часов назад». */
export const formatRelative = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return formatDistanceToNowStrict(d, { locale: ru, addSuffix: true });
};

/** Адрес одной строкой. */
export const formatAddress = (a: {
  city: string;
  street: string;
  building: string;
  apartment?: string;
}): string => {
  return [`г. ${a.city}`, `${a.street}, ${a.building}`, a.apartment].filter(Boolean).join(', ');
};

/** Хеш / адрес — обрезка с многоточием по середине. */
export const formatHash = (h: string, head = 6, tail = 4): string => {
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
};
