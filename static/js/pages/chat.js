import { api, navigate, showOutputModal, formatDate } from '../app.js';

let pollInterval = null;
let lastMessageId = 0;
let activeConvId = null;
let isWaiting = false;

export async function renderChat(convId = null) {
  const conversations = await api('/api/chat/conversations');

  if (convId === null && conversations.length > 0) {
    convId = conversations[0].id;
  }

  activeConvId = convId;

  window.__pageInit = () => {
    if (convId) startPolling(convId);
    bindUI();
  };

  const convList = conversations.map(c => `
    <div class="conv-item ${c.id === convId ? 'active' : ''}" data-id="${c.id}">
      <span class="conv-title">${c.title}</span>
      <button class="conv-delete" data-id="${c.id}" title="Delete">×</button>
    </div>`).join('') || '<div style="padding:12px;color:#475569;font-size:12px">No conversations yet.</div>';

  return `
    <div id="chat-shell" style="display:flex;height:calc(100vh - 56px);margin:-28px -32px;overflow:hidden">

      <!-- Conversation sidebar -->
      <div id="conv-sidebar" style="width:220px;flex-shrink:0;background:#0f172a;display:flex;flex-direction:column;border-right:1px solid #1e293b">
        <div style="padding:12px">
          <button id="new-conv-btn" class="btn w-full" style="font-size:12px;justify-content:center">+ New Chat</button>
        </div>
        <div id="conv-list" style="flex:1;overflow-y:auto;padding:4px 8px">
          ${convList}
        </div>
        <div style="padding:12px;border-top:1px solid #1e293b">
          <label class="btn btn-outline w-full" style="font-size:12px;justify-content:center;cursor:pointer">
            📎 Upload Doc
            <input type="file" id="file-upload" accept=".pdf,.docx,.txt,.md" style="display:none" />
          </label>
        </div>
      </div>

      <!-- Chat area -->
      <div style="flex:1;display:flex;flex-direction:column;background:#0f172a">
        ${convId ? `
        <div id="messages" style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:12px">
          <div style="text-align:center;color:#475569;font-size:12px;padding:20px 0">
            Loading conversation…
          </div>
        </div>
        <div id="input-area" style="padding:16px;border-top:1px solid #1e293b">
          <div style="display:flex;gap:8px;align-items:flex-end">
            <textarea id="chat-input" rows="2"
              style="flex:1;background:#1e293b;border:1px solid #334155;border-radius:8px;color:#f8fafc;font-size:14px;padding:10px 14px;resize:none;font-family:inherit"
              placeholder="Ask MARTY to create a worksheet, lesson plan, revise something…"
            ></textarea>
            <button id="send-btn" class="btn" style="height:52px;padding:0 20px">Send</button>
          </div>
          <div style="font-size:11px;color:#475569;margin-top:6px">Enter to send · Shift+Enter for new line</div>
        </div>` : `
        <div style="flex:1;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;color:#475569">
          <div style="font-size:48px">👋</div>
          <div style="font-size:18px;color:#94a3b8;font-weight:600">Hi, I'm MARTY</div>
          <div style="font-size:14px">Create a new chat to get started.</div>
          <button id="new-conv-btn-center" class="btn btn-lg" style="margin-top:8px">+ New Chat</button>
        </div>`}
      </div>
    </div>`;
}

function bindUI() {
  // New conversation buttons
  document.getElementById('new-conv-btn')?.addEventListener('click', newConversation);
  document.getElementById('new-conv-btn-center')?.addEventListener('click', newConversation);

  // Conversation list clicks
  document.querySelectorAll('.conv-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('conv-delete')) return;
      navigate(`/chat/${el.dataset.id}`);
    });
  });

  // Delete conversation
  document.querySelectorAll('.conv-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this conversation?')) return;
      await api(`/api/chat/conversations/${btn.dataset.id}`, { method: 'DELETE' });
      if (Number(btn.dataset.id) === activeConvId) {
        navigate('/chat');
      } else {
        navigate('/chat');
      }
    });
  });

  // Send message
  const sendBtn = document.getElementById('send-btn');
  const input = document.getElementById('chat-input');

  sendBtn?.addEventListener('click', sendMessage);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // File upload
  document.getElementById('file-upload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/chat/upload', { method: 'POST', body: formData });
    const data = await res.json();
    appendMessage({ display_role: 'system', display_content: `📎 ${data.message}` });
    e.target.value = '';
  });
}

async function newConversation() {
  const conv = await api('/api/chat/conversations', { method: 'POST' });
  navigate(`/chat/${conv.id}`);
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input?.value.trim();
  if (!content || !activeConvId || isWaiting) return;

  input.value = '';
  isWaiting = true;
  document.getElementById('send-btn').disabled = true;

  appendMessage({ display_role: 'user', display_content: content });
  appendTypingIndicator();

  await api(`/api/chat/conversations/${activeConvId}/messages`, {
    method: 'POST',
    body: { content },
  }).catch(() => {});
}

function startPolling(convId) {
  if (pollInterval) clearInterval(pollInterval);
  lastMessageId = 0;

  // Load existing messages immediately
  loadMessages(convId).then(() => {
    pollInterval = setInterval(() => loadMessages(convId), 2500);
  });

  // Clean up on navigation
  window.addEventListener('hashchange', () => {
    clearInterval(pollInterval);
    pollInterval = null;
  }, { once: true });
}

async function loadMessages(convId) {
  const msgs = await api(`/api/chat/conversations/${convId}/messages?since=${lastMessageId}`).catch(() => []);
  if (!msgs.length) return;

  removeTypingIndicator();
  isWaiting = false;
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.disabled = false;

  msgs.forEach(msg => {
    if (msg.id > lastMessageId) lastMessageId = msg.id;
    appendMessage(msg);
  });

  // If last message is a tool_call or tool_result, MARTY is still working
  const last = msgs[msgs.length - 1];
  if (last && (last.display_role === 'tool_call' || last.display_role === 'tool_result')) {
    isWaiting = true;
    if (sendBtn) sendBtn.disabled = true;
    appendTypingIndicator();
  }
}

function appendMessage(msg) {
  const container = document.getElementById('messages');
  if (!container) return;

  // Clear the "loading" placeholder on first message
  if (container.querySelector('[style*="Loading conversation"]')) {
    container.innerHTML = '';
  }

  removeTypingIndicator();

  const el = document.createElement('div');
  el.className = 'chat-msg';

  const role = msg.display_role;

  if (role === 'user') {
    el.innerHTML = `
      <div style="display:flex;justify-content:flex-end">
        <div style="background:#3b82f6;color:#fff;border-radius:12px 12px 2px 12px;padding:10px 14px;max-width:75%;font-size:14px;white-space:pre-wrap">${escHtml(msg.display_content)}</div>
      </div>`;

  } else if (role === 'assistant') {
    el.innerHTML = `
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="width:28px;height:28px;border-radius:50%;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">M</div>
        <div style="background:#1e293b;color:#e2e8f0;border-radius:2px 12px 12px 12px;padding:10px 14px;max-width:80%;font-size:14px;line-height:1.6;white-space:pre-wrap">${renderMarkdown(msg.display_content)}</div>
      </div>`;
    // Parse output_ids from MARTY's message and add action buttons
    parseOutputActions(el, msg.display_content);

  } else if (role === 'tool_call') {
    el.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;padding:4px 0 4px 38px">
        <div style="width:6px;height:6px;border-radius:50%;background:#3b82f6;flex-shrink:0"></div>
        <span style="font-size:12px;color:#64748b;font-family:monospace">MARTY called: <span style="color:#93c5fd">${escHtml(msg.display_content)}</span></span>
      </div>`;

  } else if (role === 'tool_result') {
    el.innerHTML = `
      <div style="padding:2px 0 2px 54px">
        <span style="font-size:11px;color:#475569">↳ ${escHtml(msg.display_content)}</span>
      </div>`;

  } else if (role === 'error') {
    el.innerHTML = `
      <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:10px 14px;color:#fca5a5;font-size:13px;margin-left:38px">
        ${escHtml(msg.display_content)}
      </div>`;

  } else if (role === 'system') {
    el.innerHTML = `
      <div style="text-align:center;font-size:12px;color:#475569;padding:4px 0">${escHtml(msg.display_content)}</div>`;
  }

  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function parseOutputActions(el, text) {
  const matches = [...text.matchAll(/output_id=(\d+)/g)];
  if (!matches.length) return;

  const ids = [...new Set(matches.map(m => Number(m[1])))];
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;margin-left:38px';

  ids.forEach(id => {
    ['student', 'teacher', 'slideshow'].forEach(variant => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-outline';
      btn.style.fontSize = '11px';
      btn.textContent = { student: '📄 Student', teacher: '🔑 Teacher Key', slideshow: '🖥 Slideshow' }[variant];
      btn.style.color = '#93c5fd';
      btn.style.borderColor = '#1d4ed8';
      btn.style.background = 'transparent';
      btn.onclick = () => showOutputModal(0, id, variant, `Output ${id} — ${variant}`);
      bar.appendChild(btn);
    });

    const pptxBtn = document.createElement('button');
    pptxBtn.className = 'btn btn-sm';
    pptxBtn.style.cssText = 'font-size:11px;background:#1d4ed8';
    pptxBtn.textContent = '⬇ PPTX';
    pptxBtn.onclick = () => { window.location.href = `/api/chat/outputs/${id}/export/pptx`; };
    bar.appendChild(pptxBtn);

    const htmlBtn = document.createElement('button');
    htmlBtn.className = 'btn btn-sm btn-ghost';
    htmlBtn.style.fontSize = '11px';
    htmlBtn.textContent = '⬇ HTML';
    htmlBtn.onclick = () => { window.location.href = `/api/chat/outputs/${id}/download/student`; };
    bar.appendChild(htmlBtn);
  });

  el.appendChild(bar);
}

function appendTypingIndicator() {
  removeTypingIndicator();
  const container = document.getElementById('messages');
  if (!container) return;
  const el = document.createElement('div');
  el.id = 'typing-indicator';
  el.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:4px 0';
  el.innerHTML = `
    <div style="width:28px;height:28px;border-radius:50%;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">M</div>
    <div style="background:#1e293b;border-radius:2px 12px 12px 12px;padding:10px 16px;display:flex;gap:4px;align-items:center">
      <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse 1.2s ease-in-out infinite"></span>
      <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse 1.2s ease-in-out infinite 0.2s"></span>
      <span style="width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse 1.2s ease-in-out infinite 0.4s"></span>
    </div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code style="background:#0f172a;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
    .replace(/\n/g, '<br>');
}
