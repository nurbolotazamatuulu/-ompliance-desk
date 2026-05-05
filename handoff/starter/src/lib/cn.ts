import clsx, { type ClassValue } from 'clsx';

/**
 * Тонкая обёртка над clsx — единственный способ собирать className-строки.
 * Импортируйте через `@/lib/cn` или относительный путь.
 */
export const cn = (...inputs: ClassValue[]): string => clsx(inputs);
