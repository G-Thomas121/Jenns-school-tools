import { api, formatDate } from '../app.js';

const CATEGORIES = ['general', 'class', 'students', 'preference'];

export async function renderContext() {
  const notes = await api('/api/context');

  const activeNotes = notes.filter(n => n.active);
  const inactiveNotes = notes.filter(n => !n.active);

  function noteCard(n) {
    const categoryColors = { general: 'badge-gray', class: 'badge-blue', students: 'badge-purple', preference: 'badge-green' };
    return `
      <div class="card card-sm" id="note-${n.id}" style="margin-bottom:12px;${n.active ? '' : 'opacity:0.6'}">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-8">
            <span class="card-title">${n.title}</span>
            <span class="badge ${categoryColors[n.category] || 'badge-gray'}">${n.category}</span>
            ${n.active ? '' : '<span class="badge badge-gray">Inactive</span>'}
          </div>
          <div class="flex gap-8">
            <button class="btn btn-sm btn-outline" onclick="toggleNote(${n.id}, ${n.active ? 0 : 1})">${n.active ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-sm btn-outline" onclick="editNote(${n.id})">Edit</button>
            <button class="btn btn-sm btn-ghost" onclick="deleteNote(${n.id})">Delete</button>
          </div>
        </div>
        <p style="margin-top:8px;white-space:pre-wrap;font-size:13px;color:var(--color-text-muted)">${n.content}</p>
        <div id="edit-form-${n.id}" style="display:none;margin-top:12px;border-top:1px solid var(--color-border);padding-top:12px">
          <div class="form-group">
            <label>Title</label>
            <input type="text" id="edit-title-${n.id}" value="${n.title.replace(/"/g, '&quot;')}" />
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="edit-cat-${n.id}">
              ${CATEGORIES.map(c => `<option value="${c}" ${n.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Content</label>
            <textarea id="edit-content-${n.id}" rows="4">${n.content}</textarea>
          </div>
          <button class="btn btn-sm save-edit-btn" data-id="${n.id}">Save</button>
          <button class="btn btn-sm btn-ghost" onclick="document.getElementById('edit-form-${n.id}').style.display='none'">Cancel</button>
        </div>
      </div>`;
  }

  window.__pageInit = () => {
    window.toggleNote = async (id, active) => {
      await api(`/api/context/${id}`, { method: 'PUT', body: { active: !!active } });
      window.location.hash = '#/context';
    };

    window.deleteNote = async (id) => {
      if (!confirm('Delete this context note?')) return;
      await api(`/api/context/${id}`, { method: 'DELETE' });
      window.location.hash = '#/context';
    };

    window.editNote = (id) => {
      document.querySelectorAll('[id^="edit-form-"]').forEach(el => el.style.display = 'none');
      document.getElementById(`edit-form-${id}`).style.display = 'block';
    };

    document.querySelectorAll('.save-edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await api(`/api/context/${id}`, {
          method: 'PUT',
          body: {
            title: document.getElementById(`edit-title-${id}`).value,
            category: document.getElementById(`edit-cat-${id}`).value,
            content: document.getElementById(`edit-content-${id}`).value,
          },
        });
        window.location.hash = '#/context';
      });
    });

    document.getElementById('add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await api('/api/context', {
          method: 'POST',
          body: {
            title: document.getElementById('new-title').value,
            category: document.getElementById('new-cat').value,
            content: document.getElementById('new-content').value,
          },
        });
        window.location.hash = '#/context';
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
      }
    });
  };

  return `
    <div class="page-header">
      <h1>My Context</h1>
      <p class="page-subtitle">Active notes are automatically included in every generation prompt.</p>
    </div>

    <div class="alert alert-info" style="margin-bottom:20px">
      Use context notes to tell Claude about your classes, students, preferences, and teaching style. The more detail you add, the better the outputs.
    </div>

    <div class="card" style="margin-bottom:24px">
      <h2>Add New Note</h2>
      <form id="add-form">
        <div class="flex gap-12">
          <div class="form-group" style="flex:2">
            <label for="new-title">Title</label>
            <input type="text" id="new-title" required placeholder="e.g. English 1 Class Overview" />
          </div>
          <div class="form-group" style="flex:1">
            <label for="new-cat">Category</label>
            <select id="new-cat">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label for="new-content">Content</label>
          <textarea id="new-content" rows="4" required
            placeholder="e.g. This class has 28 students, mixed reading levels. We're currently in the short story unit. Most students struggle with figurative language but are engaged in discussions."></textarea>
        </div>
        <button type="submit" class="btn">Add Note</button>
      </form>
    </div>

    ${activeNotes.length ? `
    <h2 style="margin-bottom:12px">Active Notes <span style="font-size:12px;color:var(--color-text-muted);font-weight:400">(included in every generation)</span></h2>
    ${activeNotes.map(noteCard).join('')}` : '<div class="text-muted" style="margin-bottom:16px">No active notes yet.</div>'}

    ${inactiveNotes.length ? `
    <hr />
    <h2 style="margin-bottom:12px;color:var(--color-text-muted)">Inactive Notes</h2>
    ${inactiveNotes.map(noteCard).join('')}` : ''}`;
}
