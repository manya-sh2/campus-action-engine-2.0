import { useState } from 'react';
import { userApi } from '../api/endpoints';

const BRANCHES = ['Mining', 'CSE', 'MNC', 'ECE', 'EEE', 'Chemical', 'Mechanical', 'Civil', 'Metallurgy', 'Ceramic'];

export function ProfilePanel({ user, onUpdated }) {
  const [form, setForm] = useState({
    branch: user.branch || '',
    year: user.year || '',
    graduationYear: user.graduationYear || '',
    cgpa: user.cgpa ?? '',
    skills: (user.skills || []).join(', '),
    preferredRoles: (user.preferredRoles || []).join(', '),
    timezone: user.timezone || 'Asia/Kolkata',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const handleChange = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates = {
        branch: form.branch || undefined,
        year: form.year ? Number(form.year) : undefined,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
        cgpa: form.cgpa !== '' ? Number(form.cgpa) : undefined,
        skills: form.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        preferredRoles: form.preferredRoles
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        timezone: form.timezone || undefined,
      };
      const res = await userApi.updateProfile(user._id, updates);
      onUpdated(res.data);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <div className="profile-readonly">
        <p>
          <strong>{user.name}</strong>
        </p>
        <p className="text-muted">{user.email}</p>
      </div>

      <div className="form-grid">
        <label>
          Branch
          <select value={form.branch} onChange={handleChange('branch')}>
            <option value="">Not set</option>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>

        <label>
          Year
          <input type="number" min="1" max="6" value={form.year} onChange={handleChange('year')} />
        </label>

        <label>
          Graduation year
          <input type="number" min="2000" max="2100" value={form.graduationYear} onChange={handleChange('graduationYear')} />
        </label>

        <label>
          CGPA
          <input type="number" min="0" max="10" step="0.01" value={form.cgpa} onChange={handleChange('cgpa')} />
        </label>

        <label className="form-grid-wide">
          Skills (comma-separated)
          <input type="text" value={form.skills} onChange={handleChange('skills')} placeholder="Node.js, MongoDB, C++" />
        </label>

        <label className="form-grid-wide">
          Preferred roles (comma-separated)
          <input
            type="text"
            value={form.preferredRoles}
            onChange={handleChange('preferredRoles')}
            placeholder="Backend Developer, Software Engineer"
          />
        </label>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {saved && <div className="banner banner-success">Profile updated.</div>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save profile'}
      </button>

      <p className="text-muted profile-hint">
        Your branch, CGPA, and graduation year drive eligibility checks. Skills and preferred roles drive importance
        scoring.
      </p>
    </form>
  );
}
