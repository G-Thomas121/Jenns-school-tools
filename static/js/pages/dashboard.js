import { api, formatDate, typeBadge, gradeBadge } from '../app.js';

export async function renderDashboard() {
  const workflows = await api('/api/workflows');
  const recent = workflows.slice(0, 5);

  const stats = {
    total: workflows.length,
    worksheets: workflows.filter(w => w.type === 'worksheet').length,
    foldables: workflows.filter(w => w.type === 'foldable').length,
    slideshows: workflows.filter(w => w.type === 'slideshow').length,
  };

  const recentHtml = recent.length
    ? recent.map(w => `
        <tr>
          <td><a href="#/workflows/${w.id}" style="font-weight:500;color:var(--color-accent);text-decoration:none">${w.name}</a></td>
          <td>${typeBadge(w.type)}</td>
          <td>${gradeBadge(w.grade)}</td>
          <td>${w.output_count} version${w.output_count !== 1 ? 's' : ''}</td>
          <td class="text-muted">${formatDate(w.updated_at)}</td>
        </tr>`).join('')
    : `<tr><td colspan="5" class="empty" style="padding:32px;text-align:center;color:var(--color-text-muted)">
        No workflows yet. <a href="#/workflows/new" style="color:var(--color-accent)">Create your first one.</a>
       </td></tr>`;

  return `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p class="page-subtitle">Welcome back, Jenn!</p>
    </div>

    <div class="card-grid" style="margin-bottom:24px">
      <div class="card card-sm">
        <div class="text-muted text-sm">Total Workflows</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.total}</div>
      </div>
      <div class="card card-sm">
        <div class="text-muted text-sm">Worksheets</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.worksheets}</div>
      </div>
      <div class="card card-sm">
        <div class="text-muted text-sm">Foldables</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.foldables}</div>
      </div>
      <div class="card card-sm">
        <div class="text-muted text-sm">Slideshows</div>
        <div style="font-size:28px;font-weight:700;margin-top:4px">${stats.slideshows}</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="flex justify-between items-center mb-16">
        <h2 style="margin-bottom:0">Recent Workflows</h2>
        <a href="#/workflows/new" class="btn btn-sm">+ New Workflow</a>
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Name</th><th>Type</th><th>Class</th><th>Versions</th><th>Last Updated</th>
          </tr>
        </thead>
        <tbody>${recentHtml}</tbody>
      </table>
      ${workflows.length > 5 ? `<div style="margin-top:12px;text-align:right"><a href="#/workflows" style="color:var(--color-accent);font-size:13px">View all ${workflows.length} workflows →</a></div>` : ''}
    </div>

    <div class="card">
      <h2>Quick Start</h2>
      <div class="card-grid" style="margin-top:4px">
        <a href="#/workflows/new" class="card card-sm" style="text-decoration:none;cursor:pointer;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
          <div style="font-size:22px;margin-bottom:6px">📝</div>
          <div class="card-title">New Worksheet</div>
          <div class="card-meta">Structured student activity sheets</div>
        </a>
        <a href="#/workflows/new" class="card card-sm" style="text-decoration:none;cursor:pointer">
          <div style="font-size:22px;margin-bottom:6px">📂</div>
          <div class="card-title">New Foldable</div>
          <div class="card-meta">Interactive folded study tools</div>
        </a>
        <a href="#/workflows/new" class="card card-sm" style="text-decoration:none;cursor:pointer">
          <div style="font-size:22px;margin-bottom:6px">🖥️</div>
          <div class="card-title">New Slideshow</div>
          <div class="card-meta">Printable presentation slides</div>
        </a>
        <a href="#/documents" class="card card-sm" style="text-decoration:none;cursor:pointer">
          <div style="font-size:22px;margin-bottom:6px">📚</div>
          <div class="card-title">Manage Docs</div>
          <div class="card-meta">Add curriculum reference files</div>
        </a>
      </div>
    </div>
  `;
}
