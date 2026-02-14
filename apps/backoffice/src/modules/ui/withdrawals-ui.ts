import { IncomingMessage, ServerResponse } from 'http';

export function handleWithdrawalsUi(_req: IncomingMessage, res: ServerResponse): void {
  const html = `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Backoffice • Saques Pix</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: "Inter", system-ui, sans-serif;
        --bg: #0c1117;
        --panel: #111826;
        --panel-2: #0f1724;
        --text: #e5e7eb;
        --muted: #94a3b8;
        --accent: #22c55e;
        --danger: #ef4444;
        --border: rgba(148, 163, 184, 0.2);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: radial-gradient(circle at 20% 20%, #172033, #0c1117 55%);
        color: var(--text);
        min-height: 100vh;
      }
      header {
        padding: 20px 24px;
        border-bottom: 1px solid var(--border);
        background: rgba(12, 17, 23, 0.8);
        backdrop-filter: blur(6px);
        position: sticky;
        top: 0;
        z-index: 5;
      }
      h1 { margin: 0 0 6px; font-size: 20px; }
      .subtitle { color: var(--muted); font-size: 12px; }
      main { padding: 24px; max-width: 1100px; margin: 0 auto; display: grid; gap: 18px; }
      .panel {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 16px;
      }
      .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
      label { font-size: 12px; color: var(--muted); display: block; margin-bottom: 6px; }
      input, select, button, textarea {
        width: 100%;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--panel-2);
        color: var(--text);
        font-size: 13px;
      }
      textarea { min-height: 36px; resize: vertical; }
      button {
        cursor: pointer;
        font-weight: 600;
      }
      .btn-primary { background: #1f2937; border-color: #334155; }
      .btn-approve { background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.4); color: #bbf7d0; }
      .btn-reject { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #fecaca; }
      .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 10px 8px; text-align: left; font-size: 12px; border-bottom: 1px solid var(--border); }
      th { color: var(--muted); font-weight: 600; }
      .tag {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        border: 1px solid var(--border);
      }
      .status-pending { color: #facc15; border-color: rgba(250, 204, 21, 0.4); }
      .status-requested { color: #60a5fa; border-color: rgba(96, 165, 250, 0.4); }
      .status-paid { color: var(--accent); border-color: rgba(34, 197, 94, 0.4); }
      .status-failed { color: var(--danger); border-color: rgba(239, 68, 68, 0.4); }
      .muted { color: var(--muted); }
      .actions { display: flex; gap: 8px; }
      .notice { font-size: 12px; color: var(--muted); }
      .pill { font-size: 11px; color: var(--muted); }
    </style>
  </head>
  <body>
    <header>
      <h1>Backoffice • Saques Pix</h1>
      <div class="subtitle">Aprove ou rejeite saques pendentes antes do worker processar.</div>
    </header>
    <main>
      <section class="panel">
        <div class="grid">
          <div>
            <label>Backoffice key</label>
            <input id="key" type="password" placeholder="BACKOFFICE_ACCESS_KEY" />
          </div>
          <div>
            <label>Backoffice user id (opcional)</label>
            <input id="userId" type="text" placeholder="UUID" />
          </div>
          <div>
            <label>Account ID (opcional)</label>
            <input id="accountId" type="text" placeholder="UUID" />
          </div>
        </div>
        <div class="row" style="margin-top:12px;">
          <button class="btn-primary" id="load">Carregar pendentes</button>
          <span class="notice" id="status">Aguardando...</span>
        </div>
      </section>

      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Conta</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Criado</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="rows">
            <tr><td colspan="6" class="muted">Nenhum item carregado.</td></tr>
          </tbody>
        </table>
      </section>
    </main>

    <script>
      const $ = (id) => document.getElementById(id);
      const storage = window.localStorage;
      const setStatus = (text) => { $('status').textContent = text; };

      function loadStored() {
        $('key').value = storage.getItem('bo_key') || '';
        $('userId').value = storage.getItem('bo_user') || '';
        $('accountId').value = storage.getItem('bo_account') || '';
      }

      function saveStored() {
        storage.setItem('bo_key', $('key').value);
        storage.setItem('bo_user', $('userId').value);
        storage.setItem('bo_account', $('accountId').value);
      }

      function headers() {
        const h = {};
        const key = $('key').value.trim();
        const userId = $('userId').value.trim();
        if (key) h['x-backoffice-key'] = key;
        if (userId) h['x-backoffice-user-id'] = userId;
        return h;
      }

      function formatCents(value) {
        const cents = Number(value || 0);
        const amount = (cents / 100).toFixed(2).replace('.', ',');
        return 'R$ ' + amount;
      }

      function statusClass(status) {
        const normalized = (status || '').toLowerCase();
        if (normalized.includes('pending')) return 'status-pending';
        if (normalized.includes('requested')) return 'status-requested';
        if (normalized.includes('paid')) return 'status-paid';
        if (normalized.includes('failed')) return 'status-failed';
        return '';
      }

      async function fetchWithdrawals() {
        saveStored();
        setStatus('Carregando...');
        const accountId = $('accountId').value.trim();
        const query = new URLSearchParams({
          tx_type: 'WITHDRAWAL',
          status: 'PENDING_APPROVAL',
          limit: '50',
        });
        if (accountId) query.set('account_id', accountId);
        const res = await fetch('/pix/transactions?' + query.toString(), { headers: headers() });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Falha ao carregar');
        }
        return res.json();
      }

      function renderRows(items) {
        const tbody = $('rows');
        tbody.innerHTML = '';
        if (!items.length) {
          tbody.innerHTML = '<tr><td colspan="6" class="muted">Nenhum saque pendente.</td></tr>';
          return;
        }
        for (const item of items) {
          const tr = document.createElement('tr');
          tr.innerHTML = \`
            <td><div class="pill">\${item.id}</div></td>
            <td>\${item.account_id}</td>
            <td>\${formatCents(item.amount_cents)}</td>
            <td><span class="tag \${statusClass(item.status)}">\${item.status}</span></td>
            <td>\${new Date(item.created_at).toLocaleString()}</td>
            <td>
              <div class="actions">
                <button class="btn-approve" data-action="approve" data-id="\${item.id}">Aprovar</button>
                <button class="btn-reject" data-action="reject" data-id="\${item.id}">Rejeitar</button>
              </div>
            </td>
          \`;
          tbody.appendChild(tr);
        }
      }

      async function callDecision(id, action) {
        saveStored();
        const reason = prompt('Motivo (opcional):') || '';
        const res = await fetch('/pix/withdrawals/' + action, {
          method: 'POST',
          headers: Object.assign({ 'content-type': 'application/json' }, headers()),
          body: JSON.stringify({ transaction_id: id, reason }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || 'Falha ao executar');
        }
        return res.json();
      }

      $('load').addEventListener('click', async () => {
        try {
          const data = await fetchWithdrawals();
          renderRows(data.items || []);
          setStatus('OK');
        } catch (err) {
          setStatus(err.message || 'Erro ao carregar');
        }
      });

      $('rows').addEventListener('click', async (event) => {
        const target = event.target;
        if (!target || !(target instanceof HTMLElement)) return;
        const action = target.dataset.action;
        const id = target.dataset.id;
        if (!action || !id) return;
        setStatus('Processando...');
        try {
          await callDecision(id, action === 'approve' ? 'approve' : 'reject');
          const data = await fetchWithdrawals();
          renderRows(data.items || []);
          setStatus('OK');
        } catch (err) {
          setStatus(err.message || 'Erro ao processar');
        }
      });

      loadStored();
    </script>
  </body>
</html>`;

  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(html);
}
