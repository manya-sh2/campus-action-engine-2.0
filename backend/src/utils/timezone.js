// Small, dependency-free timezone helper used only to resolve
// date-only deadlines (e.g. "2026-09-20" with no time component) to a
// concrete instant, interpreted as end-of-day in the student's own
// timezone rather than always assuming UTC.

/**
 * Returns the offset (in minutes) of `timeZone` from UTC at the given
 * instant, using Intl's built-in timezone database (no extra dependency
 * needed). Falls back to 0 (UTC) if the timezone string is invalid.
 */
function getTimezoneOffsetMinutes(date, timeZone) {
  try {
    // Intl.DateTimeFormat only has whole-second resolution. Formatting a
    // date with a nonzero millisecond component through it and then
    // reconstructing via Date.UTC (which defaults ms to 0) introduces a
    // fractional-minute rounding artifact once divided by 60000. Real-world
    // UTC offsets are always whole minutes, so strip milliseconds before
    // formatting and round the final result to eliminate that artifact.
    const wholeSecondDate = new Date(Math.floor(date.getTime() / 1000) * 1000);

    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = dtf.formatToParts(wholeSecondDate).reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );

    return Math.round((asUTC - wholeSecondDate.getTime()) / 60000);
  } catch (err) {
    return 0;
  }
}

/**
 * Resolves a deadline string (from LLM/mock extraction) into a concrete
 * Date, or null if it's missing/unparseable.
 *
 * - A full date-time string (with time and/or timezone info) is parsed
 *   as-is via `new Date(...)`.
 * - A bare date-only string ("YYYY-MM-DD") is treated as the end of
 *   that day (23:59:59.999) in the user's timezone, not UTC - e.g. a
 *   deadline of "2026-09-20" for a student in Asia/Kolkata means
 *   2026-09-20 23:59:59 IST, not UTC.
 */
function resolveDeadline(deadlineRaw, timezone) {
  if (!deadlineRaw || typeof deadlineRaw !== 'string') return null;

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw.trim());

  if (!isDateOnly) {
    const parsed = new Date(deadlineRaw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const [year, month, day] = deadlineRaw.trim().split('-').map(Number);
  // Represent "23:59:59.999 local wall-clock time" as if it were UTC,
  // then shift by the timezone's offset to get the real UTC instant.
  const naiveEndOfDayUTC = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  const offsetMinutes = getTimezoneOffsetMinutes(naiveEndOfDayUTC, timezone || 'UTC');
  return new Date(naiveEndOfDayUTC.getTime() - offsetMinutes * 60000);
}

module.exports = { resolveDeadline, getTimezoneOffsetMinutes };
