const CATEGORIES = ['', 'job', 'internship', 'assignment', 'exam', 'event', 'scholarship', 'registration', 'announcement', 'other'];
const STATUSES = ['', 'pending', 'in_progress', 'completed', 'dismissed'];
const PRIORITY_LEVELS = ['', 'critical', 'high', 'medium', 'low'];

export function TaskFilters({ filters, onChange }) {
  return (
    <div className="filter-bar">
      <label>
        Status
        <select value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All'}
            </option>
          ))}
        </select>
      </label>

      <label>
        Category
        <select value={filters.category} onChange={(e) => onChange({ category: e.target.value })}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c || 'All'}
            </option>
          ))}
        </select>
      </label>

      <label>
        Priority
        <select value={filters.priorityLevel} onChange={(e) => onChange({ priorityLevel: e.target.value })}>
          {PRIORITY_LEVELS.map((p) => (
            <option key={p} value={p}>
              {p || 'All'}
            </option>
          ))}
        </select>
      </label>

      <label>
        Sort by
        <select value={filters.sortBy} onChange={(e) => onChange({ sortBy: e.target.value })}>
          <option value="priorityScore">Priority</option>
          <option value="urgencyScore">Urgency</option>
          <option value="importanceScore">Importance</option>
          <option value="deadline">Deadline</option>
          <option value="createdAt">Newest</option>
        </select>
      </label>

      <label>
        Order
        <select value={filters.sortOrder} onChange={(e) => onChange({ sortOrder: e.target.value })}>
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </label>
    </div>
  );
}
