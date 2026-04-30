const SUPABASE_URL = 'https://hhyhulqngdkwsxhymmcd.supabase.co';
const SUPABASE_KEY = 'sb_publishable_haKvwV0M7KMj4Qz69M6WGg_KmIfU-aI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ────────────────────────────────────────────────────────────────────
let allIntakes = [];
let currentDetail = null;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) showDashboard(session.user);
  else showScreen('login-screen');
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
  if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
  showDashboard(data.user);
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showScreen('login-screen');
});

// ─── SCREENS ──────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showDashboard(user) {
  document.getElementById('admin-email-label').textContent = user.email;
  showScreen('dashboard-screen');
  loadPipeline();
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const view = link.dataset.view;
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    if (view === 'intelligence') renderIntelligence();
  });
});

document.getElementById('back-to-pipeline').addEventListener('click', () => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-pipeline').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(l => {
    l.classList.toggle('active', l.dataset.view === 'pipeline');
  });
});

// ─── PIPELINE ─────────────────────────────────────────────────────────────────
async function loadPipeline() {
  const { data, error } = await supabaseClient
    .schema('analytix')
    .from('intake_summary')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) { console.error(error); return; }
  allIntakes = data || [];
  renderPipeline();
  updateStats();
}

document.getElementById('refresh-btn').addEventListener('click', loadPipeline);
document.getElementById('filter-status').addEventListener('change', renderPipeline);
document.getElementById('filter-tier').addEventListener('change', renderPipeline);

function renderPipeline() {
  const statusFilter = document.getElementById('filter-status').value;
  const tierFilter   = document.getElementById('filter-tier').value;

  let rows = allIntakes.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (tierFilter   !== 'all' && r.service_tier !== tierFilter) return false;
    return true;
  });

  const tbody = document.getElementById('pipeline-body');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading-cell">No intakes found.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${fmtDate(r.created_at)}</td>
      <td>${r.first_name || '—'} ${r.last_name || ''}</td>
      <td>${r.business_name || '—'}</td>
      <td>${r.industry || '—'}</td>
      <td>${r.stage || '—'}</td>
      <td><span class="badge badge-${r.service_tier || 'discovery'}">${r.service_tier || '—'}</span></td>
      <td>${r.project_type || '—'}</td>
      <td><span class="badge badge-${r.status || 'started'}">${r.status || '—'}</span></td>
      <td>
        <button class="btn-ghost" onclick="openDetail('${r.id}')">View</button>
      </td>
    </tr>
  `).join('');
}

function updateStats() {
  const total     = allIntakes.length;
  const submitted = allIntakes.filter(r => ['submitted','reviewed','converted'].includes(r.status)).length;
  const converted = allIntakes.filter(r => r.status === 'converted').length;
  const rate      = submitted ? Math.round((converted / submitted) * 100) : 0;

  document.querySelector('#stat-total .stat-num').textContent     = total;
  document.querySelector('#stat-submitted .stat-num').textContent = submitted;
  document.querySelector('#stat-converted .stat-num').textContent = converted;
  document.querySelector('#stat-rate .stat-num').textContent      = rate + '%';
}

// ─── DETAIL ───────────────────────────────────────────────────────────────────
async function openDetail(sessionId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(l => {
    l.classList.toggle('active', l.dataset.view === 'detail');
  });

  const r = allIntakes.find(i => i.id === sessionId);
  if (!r) return;
  currentDetail = r;

  document.getElementById('detail-title').textContent =
    (r.first_name ? `${r.first_name} ${r.last_name || ''}` : 'Anonymous') +
    (r.business_name ? ` — ${r.business_name}` : '');

  document.getElementById('detail-body').innerHTML = `
    <div class="detail-card">
      <h3>Contact</h3>
      ${detailRow('Name', `${r.first_name || ''} ${r.last_name || ''}`)}
      ${detailRow('Email', r.email)}
      ${detailRow('Location', [r.city, r.state].filter(Boolean).join(', '))}
    </div>

    <div class="detail-card">
      <h3>Session</h3>
      ${detailRow('Date', fmtDate(r.created_at))}
      ${detailRow('Tier', r.service_tier)}
      ${detailRow('Steps Completed', (r.completed_steps || []).join(', ') || 'none')}
      ${detailRow('Referral Source', r.referral_source)}
      ${detailRow('Campaign', r.utm_campaign)}
    </div>

    <div class="detail-card">
      <h3>Business</h3>
      ${detailRow('Name', r.business_name)}
      ${detailRow('Industry', r.industry)}
      ${detailRow('Stage', r.stage)}
      ${detailRow('Founders', r.num_founders)}
      ${detailRow('Revenue Range', r.annual_revenue_range)}
    </div>

    <div class="detail-card">
      <h3>Project Scope</h3>
      ${detailRow('Type', r.project_type)}
      ${detailRow('Budget Range', r.budget_range)}
      ${detailRow('Target Launch', r.desired_launch_date)}
      ${detailRow('Personas', r.num_stakeholder_personas)}
      ${detailRow('Has Content', r.has_existing_content ? 'Yes' : 'No')}
      ${detailRow('Has Branding', r.has_branding_assets ? 'Yes' : 'No')}
    </div>

    <div class="detail-card">
      <h3>Readiness</h3>
      ${detailRow('Interview Available', r.interview_available ? 'Yes' : 'No')}
      ${detailRow('Interview Format', r.interview_preferred_format)}
    </div>

    <div class="detail-card">
      <h3>Update Status</h3>
      <div class="status-update-row">
        <select id="detail-status-select" class="status-select">
          <option value="started"   ${r.status==='started'   ?'selected':''}>Started</option>
          <option value="submitted" ${r.status==='submitted' ?'selected':''}>Submitted</option>
          <option value="reviewed"  ${r.status==='reviewed'  ?'selected':''}>Reviewed</option>
          <option value="converted" ${r.status==='converted' ?'selected':''}>Converted</option>
          <option value="archived"  ${r.status==='archived'  ?'selected':''}>Archived</option>
        </select>
        <button class="btn-primary" style="width:auto;padding:0.4rem 1rem" onclick="updateStatus('${r.id}')">Save</button>
      </div>
    </div>

    <div class="detail-card full-width">
      <h3>Biggest Challenge</h3>
      <div class="detail-text-block">${r.biggest_challenge || '<em style="color:var(--text-muted)">Not provided</em>'}</div>
    </div>

    <div class="detail-card full-width">
      <h3>What Success Looks Like</h3>
      <div class="detail-text-block">${r.what_success_looks_like || '<em style="color:var(--text-muted)">Not provided</em>'}</div>
    </div>
  `;
}

async function updateStatus(sessionId) {
  const newStatus = document.getElementById('detail-status-select').value;
  const updates = { status: newStatus };
  if (newStatus === 'converted') updates.converted_at = new Date().toISOString();

  const { error } = await supabaseClient
    .schema('analytix')
    .from('intake_sessions')
    .update(updates)
    .eq('id', sessionId);

  if (error) { alert('Update failed: ' + error.message); return; }
  const idx = allIntakes.findIndex(i => i.id === sessionId);
  if (idx > -1) { allIntakes[idx].status = newStatus; }
  alert('Status updated to: ' + newStatus);
}

// ─── INTELLIGENCE ─────────────────────────────────────────────────────────────
function renderIntelligence() {
  renderBarChart('chart-industry',      groupBy(allIntakes, 'industry'),      '#388bfd');
  renderBarChart('chart-project-type',  groupBy(allIntakes, 'project_type'),  '#a371f7');
  renderBarChart('chart-stage',         groupBy(allIntakes, 'stage'),         '#d29922');
  renderBarChart('chart-budget',        groupBy(allIntakes, 'budget_range'),  '#2ea043');
  renderChallenges();
}

function groupBy(data, key) {
  const counts = {};
  data.forEach(r => {
    const val = r[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function renderBarChart(containerId, entries, color) {
  const el = document.getElementById(containerId);
  if (!entries.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No data yet.</p>'; return; }
  const max = entries[0][1];
  el.innerHTML = entries.map(([label, count]) => `
    <div class="bar-row">
      <span class="bar-label" title="${label}">${label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.round((count/max)*100)}%;background:${color}"></div>
      </div>
      <span class="bar-count">${count}</span>
    </div>
  `).join('');
}

function renderChallenges() {
  const el = document.getElementById('challenge-list');
  const items = allIntakes
    .filter(r => r.biggest_challenge)
    .slice(0, 10);

  if (!items.length) { el.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem">No challenge data yet.</p>'; return; }
  el.innerHTML = items.map(r => `
    <div class="challenge-item">
      ${r.biggest_challenge}
      <div class="challenge-meta">${r.business_name || 'Anonymous'} · ${r.industry || '—'} · ${fmtDate(r.created_at)}</div>
    </div>
  `).join('');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function detailRow(key, val) {
  return `<div class="detail-row"><span class="detail-key">${key}</span><span class="detail-val">${val ?? '—'}</span></div>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
