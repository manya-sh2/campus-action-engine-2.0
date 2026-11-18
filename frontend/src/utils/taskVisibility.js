// Server rules remain authoritative. Expire loaded cards locally even if a
// refresh fails or an older network response arrives after the deadline.
export function isTaskVisible(task, now = Date.now()) {
  if (!task || !['job', 'internship', 'assignment', 'exam'].includes(task.category)) return false;
  const received = new Date(task.sourceOccurredAt).getTime();
  if (!task.sourceOccurredAt || !Number.isFinite(received) || received > now || received < now - 30 * 86400000) return false;
  if (!task.deadline) return task.category !== 'assignment';
  const deadline = new Date(task.deadline).getTime();
  return Number.isFinite(deadline) && deadline > now;
}
