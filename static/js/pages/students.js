import { api } from '../app.js';

export async function renderStudents() {
  const students = await api('/api/students');
  const english1 = students.filter(s => s.grade === 'english1');
  const english2 = students.filter(s => s.grade === 'english2');

  function rosterTable(list, grade) {
    if (!list.length) return `<p class="text-muted" style="padding:12px 0">No students yet.</p>`;
    return `<table class="table">
      <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(s => `
        <tr style="${s.active ? '' : 'opacity:0.5'}">
          <td style="font-weight:500">${s.name}</td>
          <td><span class="badge ${s.active ? 'badge-green' : 'badge-gray'}">${s.active ? 'Active' : 'Inactive'}</span></td>
          <td>
            <button class="btn btn-sm btn-ghost" onclick="toggleStudent(${s.id}, ${s.active})">${s.active ? 'Deactivate' : 'Activate'}</button>
            <button class="btn btn-sm btn-ghost" onclick="deleteStudent(${s.id}, '${s.name.replace(/'/g, "\\'")}')">Remove</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  window.__pageInit = () => {
    window.toggleStudent = async (id, active) => {
      await api(`/api/students/${id}`, { method: 'PUT', body: { active: !active } });
      window.location.hash = '#/students';
    };

    window.deleteStudent = async (id, name) => {
      if (!confirm(`Remove ${name} from the roster?`)) return;
      await api(`/api/students/${id}`, { method: 'DELETE' });
      window.location.hash = '#/students';
    };

    document.getElementById('add-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-name').value.trim();
      const grade = document.getElementById('new-grade').value;
      if (!name) return;
      await api('/api/students', { method: 'POST', body: { name, grade } });
      window.location.hash = '#/students';
    });

    document.getElementById('bulk-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const grade = document.getElementById('bulk-grade').value;
      const names = document.getElementById('bulk-names').value
        .split('\n').map(n => n.trim()).filter(Boolean);
      for (const name of names) {
        await api('/api/students', { method: 'POST', body: { name, grade } });
      }
      window.location.hash = '#/students';
    });
  };

  return `
    <div class="page-header">
      <h1>Class Roster</h1>
      <p class="page-subtitle">Manage students for grading. Add them once and reuse all year.</p>
    </div>

    <div class="card-grid" style="margin-bottom:24px">
      <div class="card">
        <h2>Add One Student</h2>
        <form id="add-form" class="flex gap-8 items-center" style="flex-wrap:wrap">
          <input type="text" id="new-name" placeholder="Full Name" style="flex:2;min-width:160px" required />
          <select id="new-grade" style="flex:1;min-width:140px">
            <option value="english1">English 1 (9th)</option>
            <option value="english2">English 2 (10th)</option>
          </select>
          <button type="submit" class="btn">Add</button>
        </form>
      </div>

      <div class="card">
        <h2>Bulk Add</h2>
        <form id="bulk-form">
          <div class="form-group">
            <select id="bulk-grade">
              <option value="english1">English 1 (9th)</option>
              <option value="english2">English 2 (10th)</option>
            </select>
          </div>
          <div class="form-group">
            <textarea id="bulk-names" rows="4" placeholder="One name per line:&#10;Emma Jones&#10;Marcus Williams&#10;Sofia Garcia"></textarea>
          </div>
          <button type="submit" class="btn">Add All</button>
        </form>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2>English 1 — 9th Grade <span class="badge badge-blue" style="margin-left:8px">${english1.length}</span></h2>
      ${rosterTable(english1, 'english1')}
    </div>

    <div class="card">
      <h2>English 2 — 10th Grade <span class="badge badge-green" style="margin-left:8px">${english2.length}</span></h2>
      ${rosterTable(english2, 'english2')}
    </div>`;
}
