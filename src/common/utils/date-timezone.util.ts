/**
 * Utilidades para cálculo de fechas y límites de períodos respetando Timezone (Intl.DateTimeFormat).
 */

export const DEFAULT_TIMEZONE = 'America/Santiago';

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Obtiene las partes de fecha/hora para una fecha instantánea en una zona horaria determinada.
 */
export function getZonedParts(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const result: Partial<DateParts> = {};

  for (const part of parts) {
    if (part.type === 'year') result.year = parseInt(part.value, 10);
    else if (part.type === 'month') result.month = parseInt(part.value, 10);
    else if (part.type === 'day') result.day = parseInt(part.value, 10);
    else if (part.type === 'hour') {
      const h = parseInt(part.value, 10);
      result.hour = h === 24 ? 0 : h;
    } else if (part.type === 'minute') result.minute = parseInt(part.value, 10);
    else if (part.type === 'second') result.second = parseInt(part.value, 10);
  }

  return {
    year: result.year ?? date.getUTCFullYear(),
    month: result.month ?? date.getUTCMonth() + 1,
    day: result.day ?? date.getUTCDate(),
    hour: result.hour ?? date.getUTCHours(),
    minute: result.minute ?? date.getUTCMinutes(),
    second: result.second ?? date.getUTCSeconds(),
  };
}

/**
 * Encuentra el instante exacto UTC (`Date`) que corresponde al año, mes, día, hora, minuto, segundo
 * dados en la zona horaria destino.
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  let utcMillis = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 3; i++) {
    const zonedParts = getZonedParts(new Date(utcMillis), timeZone);
    const zonedMillis = Date.UTC(
      zonedParts.year,
      zonedParts.month - 1,
      zonedParts.day,
      zonedParts.hour,
      zonedParts.minute,
      zonedParts.second,
    );
    const diff =
      Date.UTC(year, month - 1, day, hour, minute, second) - zonedMillis;
    if (diff === 0) break;
    utcMillis += diff;
  }

  return new Date(utcMillis);
}

/**
 * Retorna el instante UTC correspondiente al inicio del día (00:00:00.000) en el timeZone indicado.
 */
export function getStartOfDayInTimezone(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
  dayOffset = 0,
): Date {
  const parts = getZonedParts(date, timeZone);
  const targetDate = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset),
  );
  return zonedDateTimeToUtc(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth() + 1,
    targetDate.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
}

/**
 * Retorna el instante UTC correspondiente al inicio del mes (día 1, 00:00:00.000) en el timeZone indicado.
 */
export function getStartOfMonthInTimezone(
  date: Date,
  timeZone: string = DEFAULT_TIMEZONE,
): Date {
  const parts = getZonedParts(date, timeZone);
  return zonedDateTimeToUtc(parts.year, parts.month, 1, 0, 0, 0, timeZone);
}

/**
 * Retorna los límites de inicio y fin de un año en el timeZone indicado.
 */
export function getYearBoundsInTimezone(
  year: number,
  timeZone: string = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  const start = zonedDateTimeToUtc(year, 1, 1, 0, 0, 0, timeZone);
  const end = zonedDateTimeToUtc(year + 1, 1, 1, 0, 0, 0, timeZone);
  return { start, end };
}
