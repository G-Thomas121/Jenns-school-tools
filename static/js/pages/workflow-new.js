import { api, navigate } from '../app.js';

export async function renderWorkflowNew(params = {}) {
  const [docs, template] = await Promise.all([
    api('/api/documents'),
    params.from ? api(`/api/workflows/${params.from}`) : Promise.resolve(null),
  ]);

  const templateDocIds = template ? JSON.parse(template.doc_ids || '[]') : [];
  const isTemplate = !!template;

  const docItems = docs.length
    ? docs.map(d => `
        <label class="checkbox-item">
          <input type="checkbox" name="doc_ids" value="${d.id}"
            ${templateDocIds.includes(d.id) ? 'checked' : ''} />
          <div>
            <div class="doc-label">${d.title || d.filename}</div>
            <div class="doc-sub">${d.subject || ''} ${d.grade ? `· ${d.grade}` : ''} · ${d.filename}</div>
          </div>
        </label>`).join('')
    : `<div style="padding:16px;color:var(--color-text-muted);font-size:13px">
        No documents yet. <a href="#/documents" style="color:var(--color-accent)">Add curriculum docs first.</a>
       </div>`;

  window.__pageInit = () => {
    document.getElementById('wf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Creating…';

      const form = new FormData(e.target);
      const doc_ids = [...document.querySelectorAll('input[name="doc_ids"]:checked')].map(el => Number(el.value));

      try {
        const wf = await api('/api/workflows', {
          method: 'POST',
          body: {
            name: form.get('name'),
            type: form.get('type'),
            grade: form.get('grade'),
            context: form.get('context') || null,
            instructions: form.get('instructions') || null,
            doc_ids,
          },
        });

        // Carry rubric over from template
        if (template?.rubric) {
          await api(`/api/workflows/${wf.id}`, {
            method: 'PUT',
            body: { rubric: template.rubric },
          });
        }

        navigate(`/workflows/${wf.id}`);
      } catch (err) {
        document.getElementById('form-error').textContent = err.message;
        document.getElementById('form-error').style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create Workflow';
      }
    });
  };

  const sel = (val, target) => val === target ? 'selected' : '';

  return `
    <div class="page-header">
      <a href="${isTemplate ? `#/workflows/${template.id}` : '#/workflows'}"
         style="color:var(--color-text-muted);font-size:13px;text-decoration:none">
        ← ${isTemplate ? template.name : 'Workflows'}
      </a>
      <h1 style="margin-top:4px">${isTemplate ? 'New Workflow from Template' : 'New Workflow'}</h1>
    </div>

    ${isTemplate ? `
    <div class="alert alert-info" style="margin-bottom:16px">
      Pre-filled from <strong>${template.name}</strong> — same type, class, rubric, and doc selections.
      Update the name and context for today's lesson, adjust docs as needed, then generate.
    </div>` : ''}

    <div class="card" style="max-width:680px">
      <div id="form-error" class="alert alert-error" style="display:none"></div>
      <form id="wf-form">
        <div class="form-group">
          <label for="name">Workflow Name</label>
          <input type="text" id="name" name="name" required
            placeholder="e.g. Textual Evidence — The Lottery, Week 4"
            value="${isTemplate ? '' : ''}" />
          ${isTemplate ? `<div class="form-hint">Give this a new name to distinguish it from the template.</div>` : ''}
        </div>

        <div class="flex gap-12">
          <div class="form-group" style="flex:1">
            <label for="type">Output Type</label>
            <select id="type" name="type" required>
              <option value="worksheet" ${sel(template?.type, 'worksheet')}>Worksheet</option>
              <option value="foldable" ${sel(template?.type, 'foldable')}>Foldable</option>
              <option value="slideshow" ${sel(template?.type, 'slideshow')}>Slideshow</option>
              <option value="study_guide" ${sel(template?.type, 'study_guide')}>Study Guide</option>
              <option value="custom" ${sel(template?.type, 'custom')}>Custom</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label for="grade">Class</label>
            <select id="grade" name="grade" required>
              <option value="english1" ${sel(template?.grade, 'english1')}>English 1 (9th Grade)</option>
              <option value="english2" ${sel(template?.grade, 'english2')}>English 2 (10th Grade)</option>
              <option value="both" ${sel(template?.grade, 'both')}>Both Classes</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>Curriculum Docs to Reference</label>
          <div class="checkbox-list">${docItems}</div>
          <div class="form-hint">Select the documents Claude should use for this lesson.</div>
        </div>

        <div class="form-group">
          <label for="context">What do you want to create?</label>
          <textarea id="context" name="context" rows="4"
            placeholder="Describe the lesson focus, text being used, learning objective…">${template?.context || ''}</textarea>
        </div>

        <div class="form-group">
          <label for="instructions">Special Instructions <span style="font-weight:400;color:var(--color-text-muted)">(optional)</span></label>
          <textarea id="instructions" name="instructions" rows="2"
            placeholder="e.g. Keep it to one page, include a word bank…">${template?.instructions || ''}</textarea>
        </div>

        ${isTemplate && template?.rubric ? `
        <div class="alert alert-success" style="margin-bottom:16px">
          Rubric carried over from template — you can edit it on the workflow detail page after creating.
        </div>` : ''}

        <div class="flex gap-8" style="margin-top:8px">
          <button type="submit" id="submit-btn" class="btn btn-lg">Create Workflow</button>
          <a href="${isTemplate ? `#/workflows/${template.id}` : '#/workflows'}" class="btn btn-ghost btn-lg">Cancel</a>
        </div>
      </form>
    </div>`;
}
