import { randomUUID } from 'node:crypto';

const ALLOWED_CATEGORIES = new Set(['adultes', 'rencontres', 'spam', 'arnaque']);
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function normalizeSchedule(input = {}) {
  const time = TIME_PATTERN.test(input.time || '') ? input.time : '08:00';
  let timeZone = input.timeZone || 'UTC';
  try { new Intl.DateTimeFormat('fr-FR', { timeZone }).format(); } catch { timeZone = 'UTC'; }
  const categories = Array.isArray(input.categories)
    ? [...new Set(input.categories)].filter((category) => ALLOWED_CATEGORIES.has(category))
    : [...ALLOWED_CATEGORIES];
  return {
    enabled: Boolean(input.enabled),
    time,
    timeZone,
    threshold: Math.min(0.99, Math.max(0.8, Number(input.threshold) || 0.9)),
    categories,
    maxMessages: Math.floor(Math.min(50, Math.max(10, Number(input.maxMessages) || 50))),
  };
}

export function buildScheduledReport(messages, schedule, { id, startedAt, completedAt } = {}) {
  const categories = new Set(schedule.categories);
  const counts = { analyzed: messages.length, eligible: 0, ambiguous: 0, skipped: 0, protected: 0 };
  const byCategory = {};
  for (const message of messages) {
    const classification = message.classification || {};
    const categoryId = classification.id || 'autre';
    byCategory[categoryId] ||= { id: categoryId, label: classification.label || 'Autre', analyzed: 0, eligible: 0, ambiguous: 0 };
    byCategory[categoryId].analyzed += 1;
    if (classification.action !== 'quarantine') counts.protected += 1;
    else if (message.quarantined) counts.skipped += 1;
    else if (!categories.has(categoryId) || Number(classification.confidence) < schedule.threshold) {
      counts.ambiguous += 1;
      byCategory[categoryId].ambiguous += 1;
    } else {
      counts.eligible += 1;
      byCategory[categoryId].eligible += 1;
    }
  }
  return {
    id: id || randomUUID(),
    version: 1,
    mode: 'scheduled-simulation',
    status: 'completed',
    startedAt,
    completedAt,
    policy: schedule,
    metrics: { ...counts, executed: 0, failed: 0 },
    categories: Object.values(byCategory),
  };
}

export function createAgentScheduler({ scan, now = () => new Date(), intervalMs = 30_000, initialState, onStateChange = () => {} } = {}) {
  let schedule = normalizeSchedule(initialState?.schedule);
  let lastRunDate = typeof initialState?.lastRunDate === 'string' ? initialState.lastRunDate : null;
  let running = false;
  const reports = Array.isArray(initialState?.reports)
    ? initialState.reports.filter((report) => report?.id && report?.mode === 'scheduled-simulation').slice(0, 20)
    : [];

  function persist() {
    try { onStateChange({ schedule, lastRunDate, reports: [...reports] }); }
    catch (error) { console.warn(`État planifié non persisté : ${error.message}`); }
  }

  async function run() {
    if (running) return null;
    running = true;
    const started = now();
    try {
      const messages = await scan(schedule.maxMessages);
      const completed = now();
      const report = buildScheduledReport(messages, schedule, {
        id: randomUUID(),
        startedAt: started.toISOString(),
        completedAt: completed.toISOString(),
      });
      reports.unshift(report);
      reports.splice(20);
      persist();
      return report;
    } finally {
      running = false;
    }
  }

  async function tick() {
    if (!schedule.enabled || running) return;
    const parts = zonedParts(now(), schedule.timeZone);
    if (parts.time < schedule.time || parts.date === lastRunDate) return;
    try {
      await run();
      lastRunDate = parts.date;
      persist();
    } catch (error) {
      console.error('Scheduled agent simulation failed:', error.message);
    }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();

  function status() {
    return { ...schedule, running, lastRunDate, reports: reports.length };
  }

  return {
    configure(input) { schedule = normalizeSchedule(input); persist(); return status(); },
    disable() { schedule = { ...schedule, enabled: false }; persist(); return status(); },
    reset() {
      schedule = normalizeSchedule();
      lastRunDate = null;
      reports.length = 0;
      persist();
      return status();
    },
    run,
    reports: () => [...reports],
    status,
    tick,
  };
}
