import { renderDashboard } from './pages/dashboard.js';
import { renderWorkflows } from './pages/workflows.js';
import { renderWorkflowNew } from './pages/workflow-new.js';
import { renderWorkflowDetail } from './pages/workflow-detail.js';
import { renderDocuments } from './pages/documents.js';
import { renderContext } from './pages/context.js';
import { renderSuggestions } from './pages/suggestions.js';
import { renderStudents } from './pages/students.js';
import { renderGradebook } from './pages/gradebook.js';
import { renderChat } from './pages/chat.js';

// --- Router ---
const routes = [
  { pattern: /^\/$/, page: 'dashboard', render: () => renderDashboard() },
  { pattern: /^\/chat$/, page: 'chat', render: () => renderChat() },
  { pattern: /^\/chat\/(\d+)$/, page: 'chat', render: (m) => renderChat(Number(m[1])) },
  { pattern: /^\/workflows$/, page: 'workflows', render: () => renderWorkflows() },
  { pattern: /^\/workflows\/new$/, page: 'workflow-new', render: (_, params) => renderWorkflowNew(params) },
  { pattern: /^\/workflows\/(\d+)$/, page: 'workflows', render: (m) => renderWorkflowDetail(Number(m[1])) },
  { pattern: /^\/documents$/, page: 'documents', render: () => renderDocuments() },
  { pattern: /^\/context$/, page: 'context', render: () => renderContext() },
  { pattern: /^\/suggestions$/, page: 'suggestions', render: () => renderSuggestions() },
  { pattern: /^\/students$/, page: 'students', render: () => renderStudents() },
  { pattern: /^\/gradebook$/, page: 'gradebook', render: () => renderGradebook() },
];

function getLocation() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path, params };
}

export function navigate(path) {
  window.location.hash = path;
}

function matchRoute(path) {
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) return { route, match: m };
  }
  return null;
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}

async function router() {
  const { path, params } = getLocation();
  const found = matchRoute(path);
  const root = document.getElementById('page-root');

  if (!found) {
    root.innerHTML = `<div class="empty"><p>Page not found.</p><a class="btn" href="#/">Go Home</a></div>`;
    return;
  }

  setActiveNav(found.route.page);
  root.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>Loading…</span></div>';
  try {
    const html = await found.route.render(found.match, params);
    root.innerHTML = html;
    if (window.__pageInit) { window.__pageInit(); window.__pageInit = null; }
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Error loading page: ${e.message}</div>`;
    console.error(e);
  }
}

window.addEventListener('hashchange', router);
document.addEventListener('DOMContentLoaded', router);

// --- Modal ---
export async function showOutputModal(workflowId, outputId, variant = 'student', title = 'Output Preview') {
  const modal = document.getElementById('modal');
  const frame = document.getElementById('modal-frame');
  const modalTitle = document.getElementById('modal-title');
  const pptxBtn = document.getElementById('modal-export-pptx');
  const dlBtn = document.getElementById('modal-download-html');

  modalTitle.textContent = title;
  frame.srcdoc = '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#64748b">Loading…</div>';
  modal.classList.remove('hidden');

  let res;
  try {
    res = await api(`/api/workflows/${workflowId}/outputs/${outputId}`);
    const htmlMap = { student: res.html, teacher: res.teacher_html, slideshow: res.slideshow_html };
    frame.srcdoc = htmlMap[variant] || res.html || '<p>No content.</p>';
  } catch (e) {
    frame.srcdoc = `<p style="color:red;padding:20px">Error loading output: ${e.message}</p>`;
  }

  // Show PPTX export button only for slideshow variant
  if (pptxBtn) {
    pptxBtn.style.display = variant === 'slideshow' ? 'inline-flex' : 'none';
    pptxBtn.onclick = () => { window.location.href = `/api/chat/outputs/${outputId}/export/pptx`; };
  }
  if (dlBtn) {
    dlBtn.onclick = () => { window.location.href = `/api/chat/outputs/${outputId}/download/${variant}`; };
  }

  document.getElementById('modal-close').onclick = () => modal.classList.add('hidden');
  document.querySelector('.modal-backdrop').onclick = () => modal.classList.add('hidden');
  document.getElementById('modal-print').onclick = () => frame.contentWindow?.print();
  document.getElementById('modal-newtab').onclick = () => {
    const w = window.open('', '_blank');
    w.document.write(frame.srcdoc || '');
    w.document.close();
  };
}

// --- API helper ---
export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function typeBadge(type) {
  const map = {
    worksheet: 'badge-blue',
    foldable: 'badge-purple',
    slideshow: 'badge-green',
    study_guide: 'badge-yellow',
    lesson_plan: 'badge-yellow',
    custom: 'badge-gray',
  };
  return `<span class="badge ${map[type] || 'badge-gray'}">${type.replace('_', ' ')}</span>`;
}

export function gradeBadge(grade) {
  const map = { english1: 'English 1 (9th)', english2: 'English 2 (10th)', both: 'Both' };
  return `<span class="badge badge-gray">${map[grade] || grade}</span>`;
}
