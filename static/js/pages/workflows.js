import { api, formatDate, typeBadge, gradeBadge } from '../app.js';

export async function renderWorkflows() {
  const workflows = await api('/api/workflows');

  if (!workflows.length) {
    return `
      <div class="page-header"><h1>Workflows</h1></div>
      <div class="empty">
        <p>No workflows yet.</p>
        <a href="#/workflows/new" class="btn">+ Create Your First Workflow</a>
      </div>`;
  }

  const rows = workflows.map(w => `
    <tr>
      <td><a href="#/workflows/${w.id}" style="font-weight:500;color:var(--color-accent);text-decoration:none">${w.name}</a></td>
      <td>${typeBadge(w.type)}</td>
      <td>${gradeBadge(w.grade)}</td>
      <td>${w.output_count} version${w.output_count !== 1 ? 's' : ''}</td>
      <td class="text-muted">${formatDate(w.updated_at)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="deleteWorkflow(${w.id}, '${w.name.replace(/'/g, "\\'")}')">Delete</button>
      </td>
    </tr>`).join('');

  window.__pageInit = () => {
    window.deleteWorkflow = async (id, name) => {
      if (!confirm(`Delete workflow "${name}"? This cannot be undone.`)) return;
      await api(`/api/workflows/${id}`, { method: 'DELETE' });
      window.location.hash = '#/workflows';
    };
  };

  return `
    <div class="page-header flex justify-between items-center">
      <div><h1>Workflows</h1><p class="page-subtitle">${workflows.length} total</p></div>
      <a href="#/workflows/new" class="btn">+ New Workflow</a>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Class</th><th>Versions</th><th>Last Updated</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
