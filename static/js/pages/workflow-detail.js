import { api, formatDate, typeBadge, gradeBadge, showOutputModal, navigate } from '../app.js';

export async function renderWorkflowDetail(id) {
  const wf = await api(`/api/workflows/${id}`);
  const docs = await api('/api/documents');

  const docMap = Object.fromEntries(docs.map(d => [d.id, d]));
  const selectedIds = JSON.parse(wf.doc_ids || '[]');
  const selectedDocs = selectedIds.map(id => docMap[id]).filter(Boolean);

  const outputRows = wf.outputs.length
    ? wf.outputs.map(o => `
        <tr>
          <td>Version ${o.version}</td>
          <td class="text-muted">${o.notes || '—'}</td>
          <td class="text-muted">${formatDate(o.created_at)}</td>
          <td>
            <div class="flex gap-8">
              <button class="btn btn-sm" onclick="viewOutput(${wf.id}, ${o.id}, 'student', 'Version ${o.version} — Student')">Student</button>
              <button class="btn btn-sm btn-outline" onclick="viewOutput(${wf.id}, ${o.id}, 'teacher', 'Version ${o.version} — Teacher Key')">Teacher Key</button>
              <button class="btn btn-sm btn-outline" onclick="viewOutput(${wf.id}, ${o.id}, 'slideshow', 'Version ${o.version} — Slideshow')">Slideshow</button>
              <button class="btn btn-sm btn-ghost" onclick="deleteOutput(${wf.id}, ${o.id})">Delete</button>
            </div>
          </td>
        </tr>`).join('')
    : `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--color-text-muted)">
        No outputs yet. Generate below.
       </td></tr>`;

  const docItems = docs.map(d => `
    <label class="checkbox-item">
      <input type="checkbox" name="doc_ids" value="${d.id}" ${selectedIds.includes(d.id) ? 'checked' : ''} />
      <div>
        <div class="doc-label">${d.title || d.filename}</div>
        <div class="doc-sub">${d.subject || ''} ${d.grade ? `· ${d.grade}` : ''}</div>
      </div>
    </label>`).join('');

  window.__pageInit = () => {
    window.viewOutput = (wfId, outId, variant, title) => showOutputModal(wfId, outId, variant, title);

    window.deleteOutput = async (wfId, outId) => {
      if (!confirm('Delete this output version?')) return;
      await api(`/api/workflows/${wfId}/outputs/${outId}`, { method: 'DELETE' });
      navigate(`/workflows/${wfId}`);
    };

    // Toggle iterative vs fresh UI
    const iterateToggle = document.getElementById('iterate-toggle');
    const freshToggle = document.getElementById('fresh-toggle');
    const iterateSection = document.getElementById('iterate-section');
    const freshSection = document.getElementById('fresh-section');
    if (iterateToggle) {
      iterateToggle.addEventListener('change', () => {
        iterateSection.style.display = 'block';
        freshSection.style.display = 'none';
      });
      freshToggle.addEventListener('change', () => {
        iterateSection.style.display = 'none';
        freshSection.style.display = 'block';
      });
    }

    document.getElementById('generate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('gen-btn');
      const progressEl = document.getElementById('gen-progress');
      btn.disabled = true;
      document.getElementById('gen-error').style.display = 'none';

      const doc_ids = [...document.querySelectorAll('input[name="doc_ids"]:checked')].map(el => Number(el.value));
      const variants = [...document.querySelectorAll('input[name="variant"]:checked')].map(el => el.value);
      if (!variants.length) {
        document.getElementById('gen-error').textContent = 'Select at least one version to generate.';
        document.getElementById('gen-error').style.display = 'block';
        btn.disabled = false;
        return;
      }

      const isIterating = iterateToggle?.checked;
      const baseOutputId = isIterating ? Number(document.getElementById('base-output-id')?.value) : null;
      const revisionInstructions = isIterating ? (document.getElementById('revision-instructions')?.value || null) : null;
      const notes = document.getElementById('gen-notes').value || null;

      try {
        await api(`/api/workflows/${wf.id}`, { method: 'PUT', body: { doc_ids } });

        const { job_id } = await api('/api/generate', {
          method: 'POST',
          body: { workflow_id: wf.id, notes, base_output_id: baseOutputId || null, revision_instructions: revisionInstructions, variants },
        });

        progressEl.style.display = 'flex';
        document.getElementById('gen-progress-text').textContent = 'Queued…';

        const poll = setInterval(async () => {
          try {
            const job = await api(`/api/generate/jobs/${job_id}`);
            document.getElementById('gen-progress-text').textContent = job.progress;
            if (job.status === 'complete') {
              clearInterval(poll);
              progressEl.style.display = 'none';
              btn.disabled = false;
              await showOutputModal(wf.id, job.output_id, variants[0], 'New Output');
              navigate(`/workflows/${wf.id}`);
            } else if (job.status === 'error') {
              clearInterval(poll);
              progressEl.style.display = 'none';
              btn.disabled = false;
              document.getElementById('gen-error').textContent = job.progress;
              document.getElementById('gen-error').style.display = 'block';
            }
          } catch (_) {}
        }, 3000);

      } catch (err) {
        document.getElementById('gen-error').textContent = err.message;
        document.getElementById('gen-error').style.display = 'block';
        progressEl.style.display = 'none';
        btn.disabled = false;
      }
    });

    document.getElementById('edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById('edit-name').value,
        context: document.getElementById('edit-context').value || null,
        instructions: document.getElementById('edit-instructions').value || null,
      };
      await api(`/api/workflows/${wf.id}`, { method: 'PUT', body });
      navigate(`/workflows/${wf.id}`);
    });

    document.getElementById('rubric-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      await api(`/api/workflows/${wf.id}`, {
        method: 'PUT',
        body: { rubric: document.getElementById('rubric-text').value || null },
      });
      btn.disabled = false;
      btn.textContent = 'Save Rubric';
      document.getElementById('rubric-saved').style.display = 'inline';
      setTimeout(() => { document.getElementById('rubric-saved').style.display = 'none'; }, 2000);
    });
  };

  return `
    <div class="page-header">
      <a href="#/workflows" style="color:var(--color-text-muted);font-size:13px;text-decoration:none">← Workflows</a>
      <div class="flex justify-between items-center" style="margin-top:4px">
        <div class="flex items-center gap-12">
          <h1 style="margin-bottom:0">${wf.name}</h1>
          ${typeBadge(wf.type)} ${gradeBadge(wf.grade)}
        </div>
        <a href="#/workflows/new?from=${wf.id}" class="btn btn-outline">Use as Template</a>
      </div>
      <p class="page-subtitle">Created ${formatDate(wf.created_at)} · Last updated ${formatDate(wf.updated_at)}</p>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2>Output Versions</h2>
      <table class="table">
        <thead><tr><th>Version</th><th>Notes</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${outputRows}</tbody>
      </table>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2>Generate New Version</h2>
      <div id="gen-error" class="alert alert-error" style="display:none"></div>
      <form id="generate-form">

        ${wf.outputs.length ? `
        <div class="form-group">
          <label>Mode</label>
          <div class="flex gap-12" style="margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
              <input type="radio" name="mode" id="iterate-toggle" value="iterate" checked />
              Revise existing version
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
              <input type="radio" name="mode" id="fresh-toggle" value="fresh" />
              Generate fresh
            </label>
          </div>
        </div>

        <div id="iterate-section">
          <div class="form-group">
            <label for="base-output-id">Base on</label>
            <select id="base-output-id">
              ${wf.outputs.map(o => `<option value="${o.id}">Version ${o.version} — ${formatDate(o.created_at)}</option>`).join('')}
            </select>
            <div class="form-hint">Claude will edit this version rather than starting from scratch.</div>
          </div>
          <div class="form-group">
            <label for="revision-instructions">What to change <span style="font-weight:400;color:var(--color-text-muted)">(required)</span></label>
            <textarea id="revision-instructions" rows="3"
              placeholder="e.g. Add a word bank at the top. Make question 2 focus on symbolism instead of plot. Simplify the instructions in section 1."></textarea>
          </div>
        </div>

        <div id="fresh-section" style="display:none">
          <div class="alert alert-info" style="margin-bottom:12px">Generates all selected versions from scratch using the current workflow context and docs.</div>
        </div>` : `
        <div id="iterate-section" style="display:none"></div>
        <div id="fresh-section"></div>`}

        <div class="form-group">
          <label>Versions to generate</label>
          <div class="flex gap-12" style="margin-top:4px">
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
              <input type="checkbox" name="variant" value="student" checked /> Student Version
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
              <input type="checkbox" name="variant" value="teacher" checked /> Teacher Answer Key
            </label>
            <label style="display:flex;align-items:center;gap:6px;font-weight:400;cursor:pointer">
              <input type="checkbox" name="variant" value="slideshow" checked /> Slideshow
            </label>
          </div>
          <div class="form-hint">Uncheck any you don't need — unchecked variants carry forward from the base version.</div>
        </div>

        <div class="form-group">
          <label>Curriculum Docs</label>
          <div class="checkbox-list">${docItems || '<div style="padding:12px;color:var(--color-text-muted)">No docs available.</div>'}</div>
        </div>

        <div class="form-group">
          <label for="gen-notes">Version label <span style="font-weight:400;color:var(--color-text-muted)">(optional)</span></label>
          <input type="text" id="gen-notes" placeholder="e.g. Added word bank, simplified instructions" />
        </div>

        <div class="flex items-center gap-12">
          <button type="submit" id="gen-btn" class="btn">Generate</button>
          <div id="gen-progress" class="flex items-center gap-8" style="display:none">
            <div class="spinner"></div>
            <span id="gen-progress-text" class="text-muted text-sm">Starting…</span>
            <span class="text-muted text-sm">· You can navigate away — generation continues in the background.</span>
          </div>
        </div>
      </form>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h2>Grading Rubric</h2>
      <p class="text-muted text-sm" style="margin-bottom:12px">
        Write your rubric here. It will be used when grading student submissions for this assignment.
        Include criteria, point values, and what earns full/partial/no credit.
      </p>
      <form id="rubric-form">
        <div class="form-group">
          <textarea id="rubric-text" rows="10" placeholder="Example:&#10;Textual Evidence Worksheet Rubric — 100 points&#10;&#10;1. Claim (20 pts)&#10;   Full: Clear, arguable claim directly answers the prompt&#10;   Partial: Claim present but vague or off-topic&#10;   None: No identifiable claim&#10;&#10;2. Evidence (30 pts)&#10;   Full: 2+ quotes, correctly cited, clearly relevant&#10;   Partial: 1 quote or citation errors&#10;   None: No textual evidence used&#10;...">${wf.rubric || ''}</textarea>
        </div>
        <div class="flex items-center gap-8">
          <button type="submit" class="btn">Save Rubric</button>
          <span id="rubric-saved" style="display:none;color:var(--color-success);font-size:13px">Saved!</span>
          ${!wf.rubric ? '<span class="text-muted text-sm">No rubric yet — submissions cannot be graded until one is saved.</span>' : ''}
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Edit Workflow Details</h2>
      <form id="edit-form">
        <div class="form-group">
          <label for="edit-name">Name</label>
          <input type="text" id="edit-name" value="${wf.name.replace(/"/g, '&quot;')}" required />
        </div>
        <div class="form-group">
          <label for="edit-context">Context / Description</label>
          <textarea id="edit-context" rows="3">${wf.context || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="edit-instructions">Special Instructions</label>
          <textarea id="edit-instructions" rows="2">${wf.instructions || ''}</textarea>
        </div>
        <button type="submit" class="btn">Save Changes</button>
      </form>
    </div>`;
}
