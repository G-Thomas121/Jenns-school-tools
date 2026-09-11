import { api, formatDate } from '../app.js';

const STATUS_BADGES = {
  new: 'badge-blue',
  reviewed: 'badge-yellow',
  planned: 'badge-purple',
  done: 'badge-green',
};

export async function renderSuggestions() {
  const suggestions = await api('/api/suggestions');

  const rows = suggestions.map(s => `
    <tr>
      <td style="font-weight:500">${s.title}</td>
      <td style="max-width:400px;color:var(--color-text-muted)">${s.description}</td>
      <td><span class="badge ${STATUS_BADGES[s.status] || 'badge-gray'}">${s.status}</span></td>
      <td class="text-muted">${formatDate(s.created_at)}</td>
      <td>
        <select class="status-select" data-id="${s.id}" style="font-size:12px;padding:4px 8px;border-radius:4px;border:1px solid var(--color-border)">
          <option value="new" ${s.status === 'new' ? 'selected' : ''}>new</option>
          <option value="reviewed" ${s.status === 'reviewed' ? 'selected' : ''}>reviewed</option>
          <option value="planned" ${s.status === 'planned' ? 'selected' : ''}>planned</option>
          <option value="done" ${s.status === 'done' ? 'selected' : ''}>done</option>
        </select>
        <button class="btn btn-sm btn-ghost" onclick="deleteSuggestion(${s.id})">Delete</button>
      </td>
    </tr>`).join('');

  window.__pageInit = () => {
    document.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        await api(`/api/suggestions/${sel.dataset.id}`, {
          method: 'PUT',
          body: { status: sel.value },
        });
      });
    });

    window.deleteSuggestion = async (id) => {
      if (!confirm('Delete this suggestion?')) return;
      await api(`/api/suggestions/${id}`, { method: 'DELETE' });
      window.location.hash = '#/suggestions';
    };

    document.getElementById('suggest-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/api/suggestions', {
          method: 'POST',
          body: {
            title: document.getElementById('sug-title').value,
            description: document.getElementById('sug-desc').value,
          },
        });
        window.location.hash = '#/suggestions';
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  };

  return `
    <div class="page-header">
      <h1>Suggestions</h1>
      <p class="page-subtitle">Submit feature requests or ideas. Grant can review and track them here.</p>
    </div>

    <div class="card" style="max-width:580px;margin-bottom:24px">
      <h2>Submit a Suggestion</h2>
      <form id="suggest-form">
        <div class="form-group">
          <label for="sug-title">Title</label>
          <input type="text" id="sug-title" required placeholder="Short description of what you'd like" />
        </div>
        <div class="form-group">
          <label for="sug-desc">Details</label>
          <textarea id="sug-desc" rows="3" required placeholder="Describe what you'd like the tool to do…"></textarea>
        </div>
        <button type="submit" class="btn">Submit</button>
      </form>
    </div>

    ${suggestions.length ? `
    <div class="card" style="padding:0;overflow:hidden">
      <table class="table">
        <thead><tr><th>Title</th><th>Description</th><th>Status</th><th>Submitted</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : '<div class="text-muted">No suggestions yet.</div>'}`;
}
