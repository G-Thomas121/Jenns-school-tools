import { api, formatDate } from '../app.js';

export async function renderDocuments() {
  const docs = await api('/api/documents');

  const rows = docs.map(d => `
    <tr>
      <td style="font-weight:500">${d.title || d.filename}</td>
      <td class="text-muted">${d.filename}</td>
      <td>${d.subject || '<span class="text-muted">—</span>'}</td>
      <td>${d.grade || '<span class="text-muted">—</span>'}</td>
      <td class="text-muted">${formatDate(d.added_at)}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editDoc(${d.id})">Edit</button>
        <button class="btn btn-sm btn-ghost" onclick="removeDoc(${d.id}, '${d.filename.replace(/'/g, "\\'")}')">Remove</button>
      </td>
    </tr>`).join('');

  window.__pageInit = () => {
    document.getElementById('scan-btn').addEventListener('click', async () => {
      const btn = document.getElementById('scan-btn');
      btn.disabled = true;
      btn.textContent = 'Scanning…';
      const res = await api('/api/documents/scan', { method: 'POST' });
      const msg = res.added.length
        ? `Found ${res.added.length} new file${res.added.length !== 1 ? 's' : ''}: ${res.added.join(', ')}`
        : 'No new files found.';
      document.getElementById('scan-result').textContent = msg;
      document.getElementById('scan-result').style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Scan Curriculum Folder';
      setTimeout(() => window.location.reload(), 1500);
    });

    window.removeDoc = async (id, filename) => {
      if (!confirm(`Remove "${filename}" from the list? (The file itself won't be deleted.)`)) return;
      await api(`/api/documents/${id}`, { method: 'DELETE' });
      window.location.hash = '#/documents';
    };

    window.editDoc = (id) => {
      document.querySelectorAll('.edit-row').forEach(el => el.style.display = 'none');
      const row = document.getElementById(`edit-${id}`);
      if (row) row.style.display = 'table-row';
    };

    document.querySelectorAll('.save-doc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const body = {
          title: document.getElementById(`title-${id}`).value || null,
          subject: document.getElementById(`subject-${id}`).value || null,
          grade: document.getElementById(`grade-${id}`).value || null,
          description: document.getElementById(`desc-${id}`).value || null,
        };
        await api(`/api/documents/${id}`, { method: 'PUT', body });
        window.location.hash = '#/documents';
      });
    });
  };

  const editRows = docs.map(d => `
    <tr class="edit-row" id="edit-${d.id}" style="display:none;background:#f8fafc">
      <td colspan="6" style="padding:16px">
        <div class="flex gap-12" style="flex-wrap:wrap">
          <div class="form-group" style="flex:1;min-width:140px;margin-bottom:8px">
            <label>Title</label>
            <input type="text" id="title-${d.id}" value="${(d.title || '').replace(/"/g, '&quot;')}" />
          </div>
          <div class="form-group" style="flex:1;min-width:120px;margin-bottom:8px">
            <label>Subject</label>
            <input type="text" id="subject-${d.id}" value="${(d.subject || '').replace(/"/g, '&quot;')}" placeholder="e.g. Literature" />
          </div>
          <div class="form-group" style="flex:1;min-width:120px;margin-bottom:8px">
            <label>Grade</label>
            <select id="grade-${d.id}">
              <option value="">—</option>
              <option value="english1" ${d.grade === 'english1' ? 'selected' : ''}>English 1 (9th)</option>
              <option value="english2" ${d.grade === 'english2' ? 'selected' : ''}>English 2 (10th)</option>
              <option value="both" ${d.grade === 'both' ? 'selected' : ''}>Both</option>
            </select>
          </div>
          <div class="form-group" style="flex:2;min-width:200px;margin-bottom:8px">
            <label>Description</label>
            <input type="text" id="desc-${d.id}" value="${(d.description || '').replace(/"/g, '&quot;')}" />
          </div>
        </div>
        <button class="btn btn-sm save-doc-btn" data-id="${d.id}">Save</button>
        <button class="btn btn-sm btn-ghost" onclick="document.getElementById('edit-${d.id}').style.display='none'">Cancel</button>
      </td>
    </tr>`).join('');

  return `
    <div class="page-header flex justify-between items-center">
      <div>
        <h1>Curriculum Docs</h1>
        <p class="page-subtitle">Drop files into the <code>curriculum/</code> folder, then scan to register them.</p>
      </div>
      <div class="flex gap-8 items-center">
        <div id="scan-result" class="text-muted text-sm" style="display:none"></div>
        <button id="scan-btn" class="btn">Scan Curriculum Folder</button>
      </div>
    </div>

    <div class="alert alert-info" style="margin-bottom:16px">
      Supported formats: PDF, DOCX, TXT, MD — drop them into the <strong>curriculum/</strong> folder at the project root, then click Scan.
    </div>

    ${docs.length ? `
    <div class="card" style="padding:0;overflow:hidden">
      <table class="table">
        <thead><tr><th>Title</th><th>Filename</th><th>Subject</th><th>Grade</th><th>Added</th><th></th></tr></thead>
        <tbody>${docs.map((d, i) => rows.split('</tr>')[i] + '</tr>' + editRows.split('</tr>')[i] + '</tr>').join('')}</tbody>
      </table>
    </div>` : `
    <div class="empty">
      <p>No documents yet. Add files to the <code>curriculum/</code> folder and click Scan.</p>
    </div>`}`;
}
