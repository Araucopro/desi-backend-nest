import { BadRequestException } from '@nestjs/common';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string, fieldName: string): Date {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new BadRequestException(`${fieldName} debe tener formato YYYY-MM-DD`);
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${fieldName} no es una fecha válida`);
  }
  return date;
}

export function assertDateRange(startDate: string, endDate: string): void {
  if (
    parseDateOnly(startDate, 'startDate') > parseDateOnly(endDate, 'endDate')
  ) {
    throw new BadRequestException('startDate no puede ser posterior a endDate');
  }
}

export function eachDate(startDate: string, endDate: string): string[] {
  assertDateRange(startDate, endDate);
  const current = parseDateOnly(startDate, 'startDate');
  const end = parseDateOnly(endDate, 'endDate');
  const result: string[] = [];

  while (current <= end) {
    result.push(formatDateOnly(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return result;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function rangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
): boolean {
  return (
    parseDateOnly(firstStart, 'startDate') <=
      parseDateOnly(secondEnd, 'endDate') &&
    parseDateOnly(secondStart, 'startDate') <=
      parseDateOnly(firstEnd, 'endDate')
  );
}
