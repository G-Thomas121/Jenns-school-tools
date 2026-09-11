import { api, formatDate } from '../app.js';

export async function renderGradebook() {
  const [workflows, summary] = await Promise.all([
    api('/api/workflows'),
    api('/api/gradebook/summary'),
  ]);

  const assessments = workflows.filter(w => w.type !== 'slideshow' && w.type !== 'foldable');

  const english1 = summary.filter(s => s.grade === 'english1');
  const english2 = summary.filter(s => s.grade === 'english2');

  function summaryTable(students) {
    if (!students.length) return `<p class="text-muted" style="padding:12px 0">No students.</p>`;
    return `<table class="table">
      <thead><tr><th>Student</th><th>Graded</th><th>Average</th><th></th></tr></thead>
      <tbody>${students.map(s => {
        const pct = s.avg_pct;
        const color = pct === null ? 'badge-gray' : pct >= 90 ? 'badge-green' : pct >= 70 ? 'badge-yellow' : 'badge-red';
        return `<tr>
          <td style="font-weight:500">${s.name}</td>
          <td>${s.graded_count} assignment${s.graded_count !== 1 ? 's' : ''}</td>
          <td><span class="badge ${color}">${pct !== null ? pct + '%' : '—'}</span></td>
          <td><a href="#/gradebook/student/${s.id}" style="color:var(--color-accent);font-size:12px">Details</a></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>`;
  }

  window.__pageInit = () => {
    document.getElementById('ingest-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const wfId = document.getElementById('ingest-workflow').value;
      if (!wfId) return;
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Ingesting…';
      document.getElementById('ingest-result').style.display = 'none';

      try {
        const res = await api(`/api/submissions/ingest/${wfId}`, { method: 'POST' });
        const msg = `Done: ${res.matched} auto-matched, ${res.needs_review} need review.`;
        document.getElementById('ingest-result').textContent = msg;
        document.getElementById('ingest-result').className = 'alert alert-success';
        document.getElementById('ingest-result').style.display = 'block';
        if (res.needs_review > 0) {
          document.getElementById('review-link').style.display = 'inline-flex';
          document.getElementById('review-link').href = `#/gradebook/review/${wfId}`;
        }
      } catch (err) {
        document.getElementById('ingest-result').textContent = err.message;
        document.getElementById('ingest-result').className = 'alert alert-error';
        document.getElementById('ingest-result').style.display = 'block';
      }
      btn.disabled = false;
      btn.textContent = 'Run Ingestion';
    });
  };

  return `
    <div class="page-header flex justify-between items-center">
      <div>
        <h1>Gradebook</h1>
        <p class="page-subtitle">Scan, ingest, and grade student work.</p>
      </div>
      <a href="/api/gradebook/export" class="btn btn-outline" download>Export CSV</a>
    </div>

    <div class="card" style="margin-bottom:24px">
      <h2>Ingest Scanned Submissions</h2>
      <p class="text-muted text-sm" style="margin-bottom:12px">
        Drop scanned files into <code>submissions/inbox/</code>, select the assignment, then run ingestion.
        Claude will read each paper and try to match the student name automatically.
      </p>
      <form id="ingest-form" class="flex gap-8 items-center" style="flex-wrap:wrap">
        <select id="ingest-workflow" style="flex:2;min-width:220px">
          <option value="">— Select assignment —</option>
          ${assessments.map(w => `<option value="${w.id}">${w.name}</option>`).join('')}
        </select>
        <button type="submit" class="btn">Run Ingestion</button>
        <a id="review-link" class="btn btn-outline" style="display:none">Review Unmatched</a>
      </form>
      <div id="ingest-result" class="alert" style="display:none;margin-top:12px"></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <div class="flex justify-between items-center mb-16">
        <h2 style="margin-bottom:0">English 1 — 9th Grade</h2>
        <a href="/api/gradebook/export?grade=english1" class="btn btn-sm btn-outline" download>Export CSV</a>
      </div>
      ${summaryTable(english1)}
    </div>

    <div class="card">
      <div class="flex justify-between items-center mb-16">
        <h2 style="margin-bottom:0">English 2 — 10th Grade</h2>
        <a href="/api/gradebook/export?grade=english2" class="btn btn-sm btn-outline" download>Export CSV</a>
      </div>
      ${summaryTable(english2)}
    </div>

    ${assessments.length ? `
    <div class="card" style="margin-top:16px">
      <h2>Grade by Assignment</h2>
      <div class="card-grid" style="margin-top:8px">
        ${assessments.map(w => `
          <a href="#/gradebook/assignment/${w.id}" class="card card-sm" style="text-decoration:none;cursor:pointer">
            <div class="card-title">${w.name}</div>
            <div class="card-meta">${w.type} · ${w.output_count} version${w.output_count !== 1 ? 's' : ''}</div>
          </a>`).join('')}
      </div>
    </div>` : ''}`;
}
