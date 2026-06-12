'use strict';
// ============================================================
// CONFIG
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbz0D0iN3DLGHG9TIoSHLZcOeYcJ-ARscrLHv0a2Z86mOiao38jPnqJT9O1hDwdKTiuCFg/exec';
const WEEK_LABELS_FILTER = ['Week1/1','Week1/2','Week2/1','Week2/2','Week3/1','Week3/2','Week4/1','Week4/2'];
const WEEK_LABELS_GREASE = ['รอบ1','รอบ2'];
const ROLE_ORDER = { viewer:0, operation:1, manager:2, admin:3 };
const STATUS_COLOR = {
  'ทำแล้ว':'#38a169', 'ทำหลังเตือน':'#dd6b20',
  'โทรแจ้งแล้วรับทราบ':'#d69e2e', 'ยังไม่ได้ทำ':'#e53e3e'
};
const WDOT_CLASS = {
  'ทำแล้ว':'wdot-done', 'ทำหลังเตือน':'wdot-late',
  'โทรแจ้งแล้วรับทราบ':'wdot-called', 'ยังไม่ได้ทำ':'wdot-notdone'
};

// ============================================================
// STATE
// ============================================================
const S = {
  token: localStorage.getItem('swj_token'),
  user: null,
  page: 'dashboard',
  trucks: [],
  employees: [],
  dashMonth: new Date().getMonth() + 1,
  dashYear:  new Date().getFullYear()
};

// ============================================================
// NAV
// ============================================================
const NAV_ITEMS = [
  { id:'dashboard',       label:'📊 Dashboard',      minRole:'viewer'    },
  { id:'pm-form',         label:'🔧 บันทึก PM',      minRole:'operation', group:'การบันทึก ติดตาม อนุมัติ' },
  { id:'violation-form',  label:'⚠️ ใบเตือน',        minRole:'operation', group:'การบันทึก ติดตาม อนุมัติ' },
  { id:'approve',         label:'✅ อนุมัติรับทราบ',  minRole:'operation', group:'การบันทึก ติดตาม อนุมัติ' },
  { id:'track-status',    label:'🔍 ติดตามสถานะ',   minRole:'operation', group:'การบันทึก ติดตาม อนุมัติ' },
  { id:'line-notify',     label:'📣 แจ้งกลุ่มไลน์', minRole:'operation', group:'การบันทึก ติดตาม อนุมัติ' },
  { id:'history',         label:'📋 ประวัติ PM',     minRole:'operation', group:'ประวัติ' },
  { id:'vio-history',     label:'📁 ประวัติใบเตือน', minRole:'operation', group:'ประวัติ' },
  { id:'stopped-history', label:'⛔ ประวัติรถที่โดนสั่งหยุด', minRole:'operation', group:'ประวัติ' },
  { id:'good-employees',  label:'⭐ พนักงานทำดี',    minRole:'operation', group:'ผลประเมินพนักงานขับรถ' },
  { id:'warned-employees',label:'⚠️ พนักงานโดนเตือน', minRole:'operation', group:'ผลประเมินพนักงานขับรถ' },
  { id:'settings',        label:'⚙️ ตั้งค่า',        minRole:'operation' },
];

// ============================================================
// BOOT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });

  if (S.token) {
    showLoading(true);
    const r = await callGAS('validateSession', S.token);
    showLoading(false);
    if (r.success) { S.user = r.user; enterApp(); }
    else { localStorage.removeItem('swj_token'); S.token = null; showLogin(); }
  } else {
    showLogin();
  }

  // Close notif dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.topbar-right')) {
      document.getElementById('notif-dropdown').classList.remove('open');
    }
  });
});

// ============================================================
// API
// ============================================================
async function callGAS(fn, ...args) {
  try {
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ fn, args })
    });
    return await resp.json();
  } catch(e) {
    return { success: false, error: 'เชื่อมต่อไม่ได้: ' + e.message };
  }
}

// ============================================================
// AUTH
// ============================================================
async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
    errEl.style.display = 'block';
    return;
  }

  showLoading(true);
  const r = await callGAS('login', username, password);
  showLoading(false);

  if (r.success) {
    S.token = r.token;
    S.user  = r.user;
    localStorage.setItem('swj_token', r.token);
    enterApp();
  } else {
    errEl.textContent = r.error || 'เข้าสู่ระบบไม่สำเร็จ';
    errEl.style.display = 'block';
  }
}

async function doLogout() {
  if (S.token) await callGAS('logout', S.token);
  localStorage.removeItem('swj_token');
  S.token = null; S.user = null; S.trucks = []; S.employees = [];
  document.getElementById('app').style.display = 'none';
  showLogin();
}

function showLogin() {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function injectAppStyles() {
  if (document.getElementById('swj-injected-styles')) return;
  const style = document.createElement('style');
  style.id = 'swj-injected-styles';
  style.textContent = `
    .nav-item {
      background: #1a3556 !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.28) !important;
      margin: 2px 8px !important;
      border-radius: 7px !important;
      border-left: 3px solid transparent !important;
      transition: background .18s, transform .12s, box-shadow .18s !important;
    }
    .nav-item:hover {
      background: #b8722e !important;
      color: #fff !important;
      box-shadow: 0 4px 12px rgba(184,114,46,0.35) !important;
    }
    .nav-item:active {
      transform: scale(0.95) !important;
    }
    .nav-item.active {
      background: #d4883f !important;
      color: #fff !important;
      border-left-color: #ffd700 !important;
      box-shadow: 0 4px 14px rgba(212,136,63,0.4) !important;
    }
  `;
  document.head.appendChild(style);
}

function enterApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('sb-name').textContent = S.user.name;
  document.getElementById('sb-role').textContent = roleLabel(S.user.role);
  injectAppStyles();
  injectTopbarLogo();
  renderNav();
  loadNotifications();
  navigateTo('dashboard');
}

function injectTopbarLogo() {
  // Sidebar logo — fix filter so logo shows correctly
  const sidebarLogoImg = document.querySelector('.logo-box img');
  if (sidebarLogoImg) {
    sidebarLogoImg.style.filter = 'none';
    sidebarLogoImg.style.height = '42px';
    sidebarLogoImg.style.width  = '42px';
    sidebarLogoImg.style.objectFit = 'contain';
    sidebarLogoImg.style.borderRadius = '6px';
  }

  // ByKhunMeen watermark in topbar
  if (!document.getElementById('bkm-watermark')) {
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight) {
      const bkm = document.createElement('span');
      bkm.id = 'bkm-watermark';
      bkm.textContent = 'ByKhunMeen';
      bkm.style.cssText = 'font-size:10px;color:#a0aec0;margin-right:8px;user-select:none';
      topbarRight.insertBefore(bkm, topbarRight.firstChild);
    }
  }
}

// ============================================================
// NAVIGATION
// ============================================================
function renderNav() {
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  const visible = NAV_ITEMS.filter(item => hasRole(item.minRole));
  const makeBtn = item => {
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.dataset.page = item.id;
    btn.textContent = item.label;
    btn.onclick = () => navigateTo(item.id);
    return btn;
  };
  visible.filter(item => !item.group).forEach(item => nav.appendChild(makeBtn(item)));
  ['การบันทึก ติดตาม อนุมัติ','ประวัติ','ผลประเมินพนักงานขับรถ'].forEach(group => {
    const items = visible.filter(item => item.group === group);
    if (!items.length) return;
    const details = document.createElement('details');
    details.className = 'nav-group';
    details.open = true;
    const summary = document.createElement('summary');
    summary.textContent = group;
    details.appendChild(summary);
    items.forEach(item => details.appendChild(makeBtn(item)));
    nav.appendChild(details);
  });
}

function navigateTo(page) {
  S.page = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  const item = NAV_ITEMS.find(n => n.id === page);
  document.getElementById('page-title').textContent =
    item ? item.label.replace(/^\S+\s/, '') : page;
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.remove('mobile-open');
  }
  renderPage(page);
}

async function renderPage(page) {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  switch(page) {
    case 'dashboard':      await renderDashboard(content);      break;
    case 'pm-form':        await renderPMForm(content);         break;
    case 'violation-form': await renderViolationForm(content);  break;
    case 'approve':        await renderApprove(content);        break;
    case 'history':        await renderHistory(content);        break;
    case 'vio-history':    await renderVioHistory(content);     break;
    case 'stopped-history': await renderStoppedHistory(content); break;
    case 'good-employees': await renderGoodEmployees(content);  break;
    case 'warned-employees': await renderWarnedEmployees(content); break;
    case 'line-notify':    await renderLineNotify(content);     break;
    case 'track-status':   await renderTrackStatus(content);    break;
    case 'settings':       await renderSettings(content);       break;
    default: content.innerHTML = '<div class="empty"><p>ไม่พบหน้า</p></div>';
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('mobile-open');
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard(container) {
  const m = S.dashMonth, y = S.dashYear;
  showLoading(true);
  const r = await callGAS('getDashboardData', S.token, m, y);
  showLoading(false);

  if (!r.success) {
    container.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`;
    return;
  }

  const { stats, rows, activities, stoppedTrucks = [] } = r.data;
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="dashPrevMonth()">◀</button>
      <span style="font-size:16px;font-weight:700;color:var(--navy)">${thMonths[m-1]} ${y+543}</span>
      <button class="btn btn-outline btn-sm" onclick="dashNextMonth()">▶</button>
      <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="renderDashboard(document.getElementById('content'))">🔄 รีเฟรช</button>
    </div>

    <div class="stats-grid">
      ${mkStatCard('done',    'green',  '✅ ทำแล้ว',           stats.done            ?? 0)}
      ${mkStatCard('not_done','red',    '❌ ยังไม่ทำ',          stats.notDone         ?? 0)}
      ${mkStatCard('called',  'yellow', '📞 โทรแจ้งแล้ว',      stats.called          ?? 0)}
      ${mkStatCard('late',    'orange', '⏰ เกินกำหนด',        stats.late            ?? 0)}
      ${mkStatCard('warned',  'orange', '⚠️ ใบเตือน',           stats.warned          ?? 0)}
      ${mkStatCard('stopped', 'red', '\u26d4 \u0e2b\u0e22\u0e38\u0e14\u0e23\u0e16', stats.stopped ?? 0)}
      ${mkStatCard('pending_approval','blue','🕐 รออนุมัติ',    stats.pendingApproval ?? 0)}
    </div>

    ${stoppedTrucks.length ? `
      <div class="card stopped-card" style="margin-bottom:16px;border-left:4px solid var(--red)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <div class="card-title" style="margin-bottom:0">⛔ รถที่ถูกสั่งหยุด</div>
          <button class="btn btn-outline btn-sm" onclick="showCardDetail('stopped')">ดูรายละเอียด</button>
        </div>
        <div class="stopped-list">
          ${stoppedTrucks.map(v => `
            <button class="stopped-item" onclick="showTruckDetail('${v.truckNumber}')">
              <strong>${v.truckNumber}</strong>
              <span>${v.type || '-'}</span>
              <small>${v.weekLabel || '-'} · ระดับ ${v.punishmentLevel || '-'}</small>
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}

    <div class="card" style="overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin-bottom:0">ตารางสถานะรถประจำเดือน</div>
        <div style="display:flex;gap:8px;font-size:11px;flex-wrap:wrap">
          <span class="wdot wdot-done" style="width:auto;border-radius:4px;padding:1px 6px">ทำแล้ว</span>
          <span class="wdot wdot-late" style="width:auto;border-radius:4px;padding:1px 6px">หลังเตือน</span>
          <span class="wdot wdot-called" style="width:auto;border-radius:4px;padding:1px 6px">โทรแจ้ง</span>
          <span class="wdot wdot-notdone" style="width:auto;border-radius:4px;padding:1px 6px">ยังไม่ทำ</span>
          <span class="wdot wdot-empty" style="width:auto;border-radius:4px;padding:1px 6px">ไม่มีข้อมูล</span>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th rowspan="2" style="min-width:70px">รถ</th>
              <th rowspan="2" style="min-width:80px">คนขับ</th>
              <th colspan="8" class="week-group">เป่ากรอง</th>
              <th colspan="8" class="week-group">เดรนน้ำ</th>
              <th colspan="2" class="week-group">อัดจารบี</th>
            </tr>
            <tr>
              ${WEEK_LABELS_FILTER.map(w=>`<th class="week-sub">${w.replace('Week','W')}</th>`).join('')}
              ${WEEK_LABELS_FILTER.map(w=>`<th class="week-sub">${w.replace('Week','W')}</th>`).join('')}
              <th class="week-sub">ร1</th>
              <th class="week-sub">ร2</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length
              ? rows.map(row => renderTruckRow(row)).join('')
              : `<tr><td colspan="20" style="text-align:center;padding:24px;color:#999">ไม่พบข้อมูลรถที่ active — ตรวจสอบ status รถใน Google Sheets</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top:16px" id="dash-good-emp">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="card-title" style="margin-bottom:0">⭐ พนักงานไม่มีใบเตือน (2 เดือน)</div>
        <button class="btn btn-outline btn-sm" onclick="navigateTo('good-employees')">ดูทั้งหมด →</button>
      </div>
      <div id="dash-good-list"><div class="empty"><div class="spinner"></div></div></div>
    </div>

    ${activities.length ? `
      <div class="card" style="margin-top:16px">
        <div class="card-title">กิจกรรมล่าสุด</div>
        ${activities.map(a => `
          <div class="activity-item">
            <span class="activity-time">${fmtDT(a.timestamp)}</span>
            <span class="activity-user">${a.username}</span>
            <span class="activity-text">${a.detail}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  // Load Top 5 good employees in background (no await — non-blocking)
  loadDashGoodEmp();
}

async function loadDashGoodEmp() {
  const el = document.getElementById('dash-good-list');
  if (!el) return;
  const r = await callGAS('getGoodEmployees', S.token);
  const el2 = document.getElementById('dash-good-list');
  if (!el2) return;
  if (!r.success) { el2.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; return; }
  const top5 = (r.data || []).slice(0, 5);
  if (!top5.length) { el2.innerHTML = '<div class="empty"><p>ทุกคนยังไม่มีข้อมูลใบเตือน</p></div>'; return; }
  el2.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${top5.map((emp, i) => `
        <div style="background:var(--bg2,#f7f9fc);border-radius:10px;padding:10px 14px;min-width:120px;cursor:pointer;border:1.5px solid ${i===0?'#f6c90e':'#e2e8f0'};transition:box-shadow .15s"
             onclick="showGoodEmpDetail('${emp.employeeId}')">
          <div style="font-size:16px">${['🥇','🥈','🥉','4️⃣','5️⃣'][i]}</div>
          <div style="font-weight:700;font-size:13px">${emp.nickname}</div>
          <div style="font-size:11px;color:#718096">${emp.streakDays === 999 ? 'ไม่เคยโดน' : emp.streakDays + ' วัน'}</div>
          <div style="font-size:11px;color:#4a9d5f">PM ${emp.pmCount} งาน</div>
        </div>
      `).join('')}
    </div>
  `;
}

function mkStatCard(type, color, label, value) {
  return `
    <div class="stat-card ${color}" data-type="${type}" onclick="showCardDetail('${type}')"
         style="cursor:pointer" title="กดเพื่อดูรายละเอียด">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
    </div>
  `;
}

function renderTruckRow(row) {
  const nick = row.nickname || row.fullName || row.employeeId || '-';
  const fw   = row.filterByWeek || {};
  const dw   = row.drainByWeek  || {};
  const gw   = row.greaseByWeek || {};
  const stopBadge = row.isStopped ? '<span class="status-badge badge-red" style="margin-left:4px">หยุดรถ</span>' : '';

  const dot = (st) => {
    const cls = WDOT_CLASS[st] || 'wdot-empty';
    const title = st || 'ไม่มีข้อมูล';
    return `<span class="wdot ${cls}" title="${title}" onclick="showTruckDetail('${row.truckNumber}')"></span>`;
  };

  return `
    <tr class="${row.isStopped ? 'truck-row-stopped' : ''}">
      <td>
        <span class="truck-link" onclick="showTruckDetail('${row.truckNumber}')">${row.truckNumber}</span>${stopBadge}
      </td>
      <td style="font-size:12px;white-space:nowrap">${nick}</td>
      ${WEEK_LABELS_FILTER.map(wl=>`<td class="week-cell">${dot(fw[wl]?.status)}</td>`).join('')}
      ${WEEK_LABELS_FILTER.map(wl=>`<td class="week-cell">${dot(dw[wl]?.status)}</td>`).join('')}
      <td class="week-cell">${dot(gw['รอบ1']?.status)}</td>
      <td class="week-cell">${dot(gw['รอบ2']?.status)}</td>
    </tr>
  `;
}


async function dashPrevMonth() {
  S.dashMonth--; if (S.dashMonth < 1) { S.dashMonth = 12; S.dashYear--; }
  await renderDashboard(document.getElementById('content'));
}
async function dashNextMonth() {
  S.dashMonth++; if (S.dashMonth > 12) { S.dashMonth = 1; S.dashYear++; }
  await renderDashboard(document.getElementById('content'));
}

async function doAutoMode(m, y) {
  if (!confirm(`สร้าง Auto PM Tasks สำหรับ ${m}/${y} ใช่ไหม?`)) return;
  showLoading(true);
  const r = await callGAS('generateMonthlyPMTasks', S.token, m, y);
  showLoading(false);
  if (r.success) {
    showToast(`✅ สร้าง ${r.count} tasks เรียบร้อย`, 'success');
    await renderDashboard(document.getElementById('content'));
    await loadNotifications();
  } else {
    showToast(r.error, 'error');
  }
}

async function showCardDetail(cardType) {
  const m = S.dashMonth, y = S.dashYear;
  showLoading(true);
  const r = await callGAS('getDashboardCardDetail', S.token, cardType, m, y);
  showLoading(false);
  if (!r.success) { showToast(r.error, 'error'); return; }

  const labels = { done:'ทำแล้ว', not_done:'ยังไม่ทำ', called:'โทรแจ้งแล้ว',
                   late:'เกินกำหนด', warned:'ใบเตือน', pending_approval:'รออนุมัติ', stopped:'หยุดรถ' };
  const data = r.data || [];

  const isViolationCard = ['warned', 'pending_approval', 'stopped'].includes(cardType);
  const rows = data.map(item => `
    <tr>
      <td>${item.truckNumber || '-'}</td>
      <td>${item.type || '-'}</td>
      <td>${item.weekLabel || item.round || '-'}</td>
      <td>${cardType === 'late' ? (item.dueRule || 'เกินกำหนดตามปฏิทิน') : (item.status || item.docStatus || '-')}</td>
      <td style="font-size:11px">${fmtDT(cardType === 'late' ? (item.dueDate || item.createdAt) : item.createdAt)}</td>
      ${isViolationCard ? `<td><button class="btn-ghost btn-sm" onclick="doShowWarning('${item.id}')">ดูหนังสือ</button></td>` : ''}
    </tr>
  `).join('');

  openModal(`
    <div class="modal-header">
      <span class="modal-title">${labels[cardType] || cardType}</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${cardType === 'late' ? `
        <div class="info-box blue" style="margin-bottom:12px">
          ที่มา: เป่ากรอง/เดรนน้ำ รอบ Week x/1 เกินหลังวันพุธ, Week x/2 เกินหลังวันอาทิตย์, อัดจารบี รอบ1 เกินหลังวันที่ 15 และรอบ2 เกินหลังสิ้นเดือน เฉพาะรายการที่ยังไม่ทำ
        </div>
      ` : ''}
      ${!data.length ? '<div class="empty"><p>ไม่มีข้อมูล</p></div>' : `
        <div class="table-wrap"><table>
          <thead><tr><th>รถ</th><th>ประเภท</th><th>รอบ</th><th>${cardType === 'late' ? 'กติกา' : 'สถานะ'}</th><th>${cardType === 'late' ? 'ครบกำหนด' : 'วันที่'}</th>${isViolationCard ? '<th></th>' : ''}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      `}
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">ปิด</button></div>
  `);
}

// ============================================================
// TRUCK DETAIL MODAL
// ============================================================
async function showTruckDetail(truckNumber) {
  showLoading(true);
  const r = await callGAS('getMaintenanceLogs', S.token, {
    truckNumber, month: S.dashMonth, year: S.dashYear
  });
  showLoading(false);
  if (!r.success) { showToast(r.error, 'error'); return; }

  const data = (r.data || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));

  const rows = data.map(rec => {
    const photos = safePhotoUrls(rec.photoUrls);
    return `
      <tr>
        <td>${rec.type}</td>
        <td>${rec.weekLabel || '-'}</td>
        <td><span class="status-badge" style="background:${STATUS_COLOR[rec.status]||'#a0aec0'};color:#fff">
          ${rec.status}
        </span></td>
        <td style="font-size:11px">${fmtDT(rec.createdAt)}</td>
        <td>
          ${photoPreviewButton(photos)}
          <button class="btn-ghost btn-sm" onclick="openComments('maintenance','${rec.id}')">💬</button>
        </td>
      </tr>
    `;
  }).join('');

  openModal(`
    <div class="modal-header">
      <span class="modal-title">รถ ${truckNumber} — ประวัติ PM</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      ${!data.length ? '<div class="empty"><p>ยังไม่มีบันทึก</p></div>' : `
        <div class="table-wrap"><table>
          <thead><tr><th>ประเภท</th><th>รอบ</th><th>สถานะ</th><th>วันที่</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      `}
    </div>
    <div class="modal-footer"><button class="btn btn-outline" onclick="closeModal()">ปิด</button></div>
  `, 'modal-lg');
}

// ============================================================
// NOTIFICATIONS
// ============================================================
async function loadNotifications() {
  if (!S.token) return;
  const r = await callGAS('getNotifications', S.token);
  if (!r.success) return;

  const notifs = r.data || [];
  const badge  = document.getElementById('notif-badge');
  const list   = document.getElementById('notif-list');

  badge.textContent = notifs.length;
  badge.style.display = notifs.length ? 'flex' : 'none';
  window._notifIds = notifs.map(n => n.id);

  if (!notifs.length) {
    list.innerHTML = '<div class="notif-empty">ไม่มีการแจ้งเตือน</div>';
    return;
  }

  list.innerHTML = notifs.map(n => `
    <div class="notif-item" id="notif-${n.id}">
      <div class="notif-item-row">
        <div class="notif-item-content" onclick="handleNotifClick('${n.page}')">
          <div class="notif-title">${n.title}</div>
          <div class="notif-body">${n.body}</div>
          <div class="notif-body" style="color:#a0aec0;font-size:11px">${fmtDT(n.createdAt)}</div>
        </div>
        <div class="notif-actions">
          <button class="notif-dismiss" onclick="dismissNotif('${n.id}')" title="ปิด">×</button>
          ${hasRole('manager') ? `<button class="notif-dismiss" style="color:var(--red)" onclick="deleteNotif('${n.id}')" title="ลบ">🗑</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function toggleNotif() {
  document.getElementById('notif-dropdown').classList.toggle('open');
}

function handleNotifClick(page) {
  document.getElementById('notif-dropdown').classList.remove('open');
  if (page && NAV_ITEMS.find(n => n.id === page)) navigateTo(page);
}

async function dismissNotif(id) {
  await callGAS('dismissNotification', S.token, id);
  await loadNotifications();
}

async function deleteNotif(id) {
  await callGAS('deleteNotification', S.token, id);
  await loadNotifications();
}

async function dismissAllNotif() {
  const ids = window._notifIds || [];
  if (!ids.length) return;
  showLoading(true);
  await Promise.all(ids.map(id => callGAS('dismissNotification', S.token, id)));
  showLoading(false);
  await loadNotifications();
  document.getElementById('notif-dropdown').classList.remove('open');
}

// ============================================================
// PM FORM
// ============================================================
async function renderPMForm(container) {
  await ensureTrucks();
  const active = S.trucks.filter(t => !t.status || t.status === 'active');

  container.innerHTML = `
    <div class="card" style="max-width:620px">
      <div class="card-title">🔧 บันทึกงาน PM</div>

      <div class="form-group">
        <label class="form-label required">ประเภทงาน</label>
        <div class="type-selector">
          <button class="type-btn" onclick="selectPMType(this,'เป่ากรอง')">เป่ากรอง</button>
          <button class="type-btn" onclick="selectPMType(this,'เดรนน้ำ')">เดรนน้ำ</button>
          <button class="type-btn" onclick="selectPMType(this,'อัดจารบี')">อัดจารบี</button>
        </div>
        <input type="hidden" id="pm-type">
      </div>

      <div class="form-group">
        <label class="form-label required">หมายเลขรถ</label>
        <select id="pm-truck" class="form-control">
          <option value="">-- เลือกรถ --</option>
          ${active.map(t => `<option value="${t.truckNumber}" data-emp="${t.employeeId||''}">${t.truckNumber}${t.employee ? ' — '+t.employee.nickname : ''}</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label class="form-label required">รอบ/สัปดาห์</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="pm-week-auto" class="form-control" readonly
                 style="flex:0 0 auto;width:120px;background:#f7f7f7" placeholder="อัตโนมัติ">
          <select id="pm-week-override" class="form-control" style="flex:1">
            <option value="">เลือกรอบอื่น (ย้อนหลัง)</option>
          </select>
        </div>
        <div class="form-hint">รอบที่คำนวณจากวันที่วันนี้ — เลือก dropdown ขวาเพื่อเปลี่ยน</div>
      </div>

      <div class="form-group">
        <label class="form-label required">สถานะ</label>
        <div class="status-selector">
          <button class="status-btn active green" data-val="ทำแล้ว" onclick="selectPMStatus(this)">✅ ทำแล้ว</button>
          <button class="status-btn" data-val="ทำหลังเตือน" onclick="selectPMStatus(this)">🟠 ทำหลังเตือน</button>
          <button class="status-btn" data-val="โทรแจ้งแล้วรับทราบ" onclick="selectPMStatus(this)">📞 โทรแจ้งแล้ว</button>
          <button class="status-btn" data-val="ยังไม่ได้ทำ" onclick="selectPMStatus(this)">❌ ยังไม่ทำ</button>
        </div>
        <input type="hidden" id="pm-status" value="ทำแล้ว">
      </div>

      <div class="form-group">
        <label class="form-label">หมายเหตุ</label>
        <textarea id="pm-notes" class="form-control" rows="2" placeholder="หมายเหตุ (ถ้ามี)"></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">รูปภาพ (หลายรูปได้)</label>
        <div class="photo-zone" onclick="document.getElementById('pm-photos').click()" id="pm-photo-zone">
          📷 คลิกเพื่อเลือกรูป หรือลากวางที่นี่
        </div>
        <input type="file" id="pm-photos" accept="image/*" multiple style="display:none"
               onchange="previewPhotos(this,'pm-photo-preview')">
        <div class="photo-previews" id="pm-photo-preview"></div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="submitPMForm()">💾 บันทึก</button>
        <button class="btn btn-outline" onclick="renderPMForm(document.getElementById('content'))">ล้าง</button>
      </div>
    </div>
  `;

  // Drag & drop
  const zone = document.getElementById('pm-photo-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag');
    const input = document.getElementById('pm-photos');
    const dt = e.dataTransfer;
    // can't set files directly, but can preview
    previewPhotosFromFiles(Array.from(dt.files), 'pm-photo-preview');
    window._dropFiles = Array.from(dt.files);
  });
}

function selectPMType(btn, type) {
  btn.closest('.type-selector').querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('pm-type').value = type;

  const labels = type === 'อัดจารบี' ? WEEK_LABELS_GREASE : WEEK_LABELS_FILTER;
  const auto   = calcWeekLabel(type);
  document.getElementById('pm-week-auto').value = auto;

  const sel = document.getElementById('pm-week-override');
  sel.innerHTML = '<option value="">เลือกรอบอื่น (ย้อนหลัง)</option>' +
    labels.map(l => `<option value="${l}">${l}</option>`).join('');
}

function selectPMStatus(btn) {
  document.querySelectorAll('.status-btn').forEach(b => {
    b.classList.remove('active','green','yellow','red','orange');
  });
  btn.classList.add('active');
  const val = btn.dataset.val;
  document.getElementById('pm-status').value = val;
  if (val === 'ทำแล้ว')              btn.classList.add('green');
  if (val === 'ทำหลังเตือน')         btn.classList.add('orange');
  if (val === 'โทรแจ้งแล้วรับทราบ') btn.classList.add('yellow');
  if (val === 'ยังไม่ได้ทำ')          btn.classList.add('red');
}

function calcWeekLabel(type) {
  const day = new Date().getDate();
  if (type === 'อัดจารบี') return day <= 15 ? 'รอบ1' : 'รอบ2';
  return WEEK_LABELS_FILTER[Math.min(Math.floor((day - 1) / 4), 7)];
}

function previewPhotos(input, previewId) {
  previewPhotosFromFiles(Array.from(input.files), previewId);
}

function previewPhotosFromFiles(files, previewId) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  preview.innerHTML = '';
  files.forEach(file => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onclick = () => openPhotoViewer([img.src]);
    const rm = document.createElement('button');
    rm.className = 'remove'; rm.textContent = '×';
    rm.onclick = () => wrap.remove();
    wrap.appendChild(img); wrap.appendChild(rm);
    preview.appendChild(wrap);
  });
}

async function submitPMForm() {
  const type     = document.getElementById('pm-type').value;
  const truck    = document.getElementById('pm-truck').value;
  const weekAuto = document.getElementById('pm-week-auto').value;
  const weekOvr  = document.getElementById('pm-week-override').value;
  const status   = document.getElementById('pm-status').value;
  const notes    = document.getElementById('pm-notes').value.trim();
  const weekLabel = weekOvr || weekAuto;

  if (!type)    { showToast('กรุณาเลือกประเภทงาน', 'error'); return; }
  if (!truck)   { showToast('กรุณาเลือกหมายเลขรถ', 'error'); return; }
  if (!weekLabel){ showToast('กรุณาเลือกรอบ', 'error'); return; }

  const sel = document.getElementById('pm-truck');
  const empId = sel.options[sel.selectedIndex]?.dataset?.emp || '';

  showLoading(true);
  const r = await callGAS('createMaintenanceLog', S.token, {
    type, truckNumber: truck, employeeId: empId,
    status, weekLabel, notes, isLate: false, isAuto: false
  });

  if (!r.success) { showLoading(false); showToast(r.error, 'error'); return; }

  const logId = r.id;

  // Collect files (from input or drag-drop)
  const inputFiles = Array.from(document.getElementById('pm-photos').files);
  const dropFiles  = window._dropFiles || [];
  const allFiles   = inputFiles.length ? inputFiles : dropFiles;

  if (allFiles.length) {
    const filesData = await filesToBase64(allFiles);
    const upR = await callGAS('uploadPhotosToLog', S.token, logId, filesData);
    if (!upR.success) showToast('บันทึกแล้ว แต่อัปโหลดรูปไม่สำเร็จ', 'warning');
  }

  showLoading(false);
  showToast('บันทึก PM เรียบร้อย', 'success');
  window._dropFiles = [];
  await loadNotifications();
  await renderPMForm(document.getElementById('content'));
}

// ============================================================
// VIOLATION FORM
// ============================================================
async function renderViolationForm(container) {
  await ensureTrucks();
  const active = S.trucks.filter(t => !t.status || t.status === 'active');

  container.innerHTML = `
    <div class="card" style="max-width:620px">
      <div class="card-title">⚠️ สร้างใบเตือน</div>

      <div class="form-group">
        <label class="form-label required">หมายเลขรถ</label>
        <select id="vio-truck" class="form-control" onchange="onVioTruckChange()">
          <option value="">-- เลือกรถ --</option>
          ${active.map(t => `<option value="${t.truckNumber}" data-emp="${t.employeeId||''}">${t.truckNumber}${t.employee ? ' — '+t.employee.nickname : ''}</option>`).join('')}
        </select>
        <div id="vio-emp-info" class="emp-info-box"></div>
      </div>

      <div class="form-group">
        <label class="form-label required">ประเภทการละเลย</label>
        <div class="type-selector">
          <button class="type-btn" onclick="selectVioType(this,'เป่ากรอง')">เป่ากรอง</button>
          <button class="type-btn" onclick="selectVioType(this,'เดรนน้ำ')">เดรนน้ำ</button>
          <button class="type-btn" onclick="selectVioType(this,'อัดจารบี')">อัดจารบี</button>
        </div>
        <input type="hidden" id="vio-type">
      </div>

      <div class="form-group">
        <label class="form-label required">รอบที่ละเลย</label>
        <select id="vio-week" class="form-control">
          <option value="">-- เลือกประเภทก่อน --</option>
        </select>
      </div>

      <!-- Punishment level auto display -->
      <div id="punishment-display" style="display:none;margin-bottom:16px">
        <label class="form-label">ระดับโทษ (จากประวัติ)</label>
        <div style="display:flex;gap:8px">
          ${[1,2,3].map(l => `
            <div id="plvl-${l}" style="flex:1;text-align:center;padding:10px 6px;border-radius:8px;
                 border:2px solid #e2e8f0;transition:.2s;font-size:13px">
              <div style="font-size:20px;font-weight:700">${l}</div>
              <div style="font-size:11px;color:#718096">${l===1?'ตักเตือน':l===2?'หนังสือเตือน':'โทษหนัก'}</div>
            </div>
          `).join('')}
        </div>
        <div id="vio-count-info" class="form-hint" style="margin-top:6px"></div>
      </div>

      <input type="hidden" id="vio-level" value="1">

      <div id="vio-stop-order-wrap" class="form-group" style="display:none">
        <label class="form-label" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="vio-stop-order"> มีคำสั่งหยุดจอดรถ (ระดับ 2 ขึ้นไป)
        </label>
      </div>

      <div class="form-group">
        <label class="form-label required">รายละเอียด / เหตุผล</label>
        <textarea id="vio-reason" class="form-control" rows="3" placeholder="อธิบายสาเหตุการละเลย"></textarea>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn-danger" onclick="submitViolationForm()">⚠️ สร้างใบเตือน</button>
        <button class="btn btn-outline" onclick="renderViolationForm(document.getElementById('content'))">ล้าง</button>
      </div>
    </div>
  `;
}

function selectVioType(btn, type) {
  btn.closest('.type-selector').querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('vio-type').value = type;

  const labels = type === 'อัดจารบี' ? WEEK_LABELS_GREASE : WEEK_LABELS_FILTER;
  const sel = document.getElementById('vio-week');
  sel.innerHTML = '<option value="">-- เลือกรอบ --</option>' +
    labels.map(l => `<option value="${l}">${l}</option>`).join('');

  triggerVioCount();
}

let _vioTimer = null;
function onVioTruckChange() {
  // Show employee info
  const sel   = document.getElementById('vio-truck');
  const opt   = sel.options[sel.selectedIndex];
  const empId = opt?.dataset?.emp || '';
  const truck = sel.value;

  const infoBox = document.getElementById('vio-emp-info');
  if (empId && S.employees.length) {
    const emp = S.employees.find(e => e.employeeId === empId);
    if (emp) {
      infoBox.innerHTML = `<div class="emp-name">${emp.fullName}</div><div class="emp-id">${empId}</div>`;
      infoBox.classList.add('show');
    }
  } else {
    infoBox.classList.remove('show');
  }

  triggerVioCount();
}

function triggerVioCount() {
  clearTimeout(_vioTimer);
  _vioTimer = setTimeout(loadVioCount, 400);
}

async function loadVioCount() {
  const sel   = document.getElementById('vio-truck');
  const type  = document.getElementById('vio-type')?.value;
  if (!sel || !type || !sel.value) return;

  const empId = sel.options[sel.selectedIndex]?.dataset?.emp || '';
  if (!empId) return;

  const r = await callGAS('getViolationCountByType', S.token, empId, type);
  if (!r.success) return;

  const prevCount = r.data?.[type] || 0;
  const nextLevel = Math.min(prevCount + 1, 3);

  document.getElementById('punishment-display').style.display = 'block';
  [1,2,3].forEach(l => {
    const el = document.getElementById('plvl-' + l);
    if (l === nextLevel) {
      el.style.borderColor = '#e53e3e';
      el.style.background  = '#fff5f5';
      el.style.color       = '#e53e3e';
    } else {
      el.style.borderColor = '#e2e8f0';
      el.style.background  = '';
      el.style.color       = '';
    }
  });

  document.getElementById('vio-level').value = String(nextLevel);
  document.getElementById('vio-count-info').textContent =
    `ประวัติ: โดนเรื่อง "${type}" มาแล้ว ${prevCount} ครั้ง → ครั้งนี้เป็นระดับ ${nextLevel}`;

  // แสดง stop-order เฉพาะระดับ 2 ขึ้นไป
  const stopWrap = document.getElementById('vio-stop-order-wrap');
  const stopChk  = document.getElementById('vio-stop-order');
  if (stopWrap) {
    stopWrap.style.display = nextLevel >= 2 ? '' : 'none';
    if (nextLevel >= 2 && stopChk) stopChk.checked = true;
    else if (stopChk) stopChk.checked = false;
  }
}

async function submitViolationForm() {
  const truckSel = document.getElementById('vio-truck');
  const truck    = truckSel.value;
  const type     = document.getElementById('vio-type').value;
  const week     = document.getElementById('vio-week').value;
  const level    = document.getElementById('vio-level').value;
  const stop     = document.getElementById('vio-stop-order').checked;
  const reason   = document.getElementById('vio-reason').value.trim();

  if (!truck)  { showToast('กรุณาเลือกรถ', 'error'); return; }
  if (!type)   { showToast('กรุณาเลือกประเภทการละเลย', 'error'); return; }
  if (!week)   { showToast('\u0e01\u0e23\u0e38\u0e13\u0e32\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e23\u0e2d\u0e1a\u0e17\u0e35\u0e48\u0e25\u0e30\u0e40\u0e25\u0e22', 'error'); return; }
  if (!reason) { showToast('กรุณาระบุเหตุผล', 'error'); return; }

  const empId = truckSel.options[truckSel.selectedIndex]?.dataset?.emp || '';

  showLoading(true);
  const r = await callGAS('createViolationLog', S.token, {
    truckNumber: truck, employeeId: empId, type,
    weekLabel: week, punishmentLevel: level,
    stopOrder: stop, reason
  });
  showLoading(false);

  if (r.success) {
    showToast('สร้างใบเตือนเรียบร้อย', 'success');
    await loadNotifications();
    await renderViolationForm(document.getElementById('content'));
    const pdf = await callGAS('getWarningLetterPdf', S.token, r.id);
    if (pdf.success && pdf.url) openPdfPreview(pdf.url, 'Preview PDF Draft');
    else showToast(pdf.error || 'สร้างแล้ว แต่เปิด Preview PDF ไม่ได้', 'warning');
  } else {
    showToast(r.error, 'error');
  }
}

// ============================================================
// APPROVE
// ============================================================
async function renderApprove(container) {
  showLoading(true);
  const r = await callGAS('getPendingApprovals', S.token);
  showLoading(false);

  if (!r.success) {
    container.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`;
    return;
  }

  const all = r.data || [];
  const pending     = all.filter(v => v.docStatus === 'pending');
  const approved    = all.filter(v => v.docStatus === 'approved');

  const sections = [];
  if (hasRole('manager') && pending.length) {
    sections.push(`<h3 style="margin-bottom:10px;color:var(--navy)">🕐 รออนุมัติ (${pending.length})</h3>`);
    sections.push(pending.map(v => mkVioCard(v)).join(''));
  }
  if (approved.length) {
    sections.push(`<h3 style="margin:16px 0 10px;color:var(--navy)">📋 รอพนักงานรับทราบ (${approved.length})</h3>`);
    sections.push(approved.map(v => mkVioCard(v)).join(''));
  }
  container.innerHTML = sections.length
    ? sections.join('')
    : '<div class="empty"><div class="icon">✅</div><p>ไม่มีรายการ</p></div>';
}

function mkVioCard(v) {
  const empName = v.employee
    ? `${v.employee.nickname} — ${v.employee.fullName}`
    : (v.employeeId || '-');
  const lvlClass = `level-${v.punishmentLevel || 1}`;
  const photos   = safePhotoUrls(v.ackPhotoUrls);

  let actions = '';
  if (v.docStatus === 'pending' && hasRole('manager')) {
    actions = `
      <div class="vc-actions">
        <button class="btn btn-success btn-sm" onclick="doApprove('${v.id}')">✅ อนุมัติ</button>
        <button class="btn btn-outline btn-sm" onclick="doShowWarning('${v.id}')">📄 ดูหนังสือ</button>
      </div>
    `;
  } else if (v.docStatus === 'approved') {
    actions = `
      <div class="vc-actions">
        ${v.pdfApprovedUrl ? `<a class="btn btn-outline btn-sm" href="${v.pdfApprovedUrl}" target="_blank">📄 ดูหนังสือ</a>` : ''}
        <button class="btn btn-warning btn-sm" onclick="doShowWarning('${v.id}')">🖨 พิมพ์</button>
        <button class="btn btn-primary btn-sm" onclick="openAckForm('${v.id}')">✍️ รับทราบ</button>
      </div>
    `;
  } else if (v.docStatus === 'acknowledged') {
    const docUrl = v.pdfAckUrl || v.pdfApprovedUrl || '';
    actions = `
      <div style="margin-top:8px;font-size:12px;color:var(--green)">
        ✅ รับทราบ ${fmtDT(v.driverAckAt)}
        ${photoPreviewButton(photos, 'หลักฐาน')}
      </div>
      <div class="vc-actions" style="margin-top:6px">
        <button class="btn btn-outline btn-sm" onclick="doShowWarning('${v.id}')">🖨 ดู/พิมพ์หนังสือ</button>
        ${docUrl ? `<a class="btn btn-outline btn-sm" href="${docUrl}" target="_blank">📄 PDF</a>` : ''}
      </div>
    `;
  }

  return `
    <div class="violation-card ${lvlClass}">
      <div class="vc-header">
        <div>
          <span class="vc-truck">รถ ${v.truckNumber}</span>
          <span class="status-badge badge-orange" style="margin-left:6px">${v.type}</span>
          ${v.weekLabel ? `<span class="round-badge" style="margin-left:4px">${v.weekLabel}</span>` : ''}
          ${v.stopOrder ? '<span class="status-badge badge-red" style="margin-left:4px">หยุดรถ</span>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span class="status-badge badge-gray">ระดับ ${v.punishmentLevel||1}</span>
          <button class="btn-ghost btn-icon" onclick="openComments('violation','${v.id}')" title="ความคิดเห็น">💬</button>
        </div>
      </div>
      <div class="vc-meta">${empName} · ${fmtDT(v.createdAt)}</div>
      <div class="vc-reason">${v.reason}</div>
      ${actions}
    </div>
  `;
}

async function doApprove(violationId) {
  if (!confirm('ยืนยันอนุมัติใบเตือนนี้?')) return;
  showLoading(true);
  const r = await callGAS('approveViolationDoc', S.token, violationId);
  showLoading(false);
  if (r.success) {
    showToast('อนุมัติเรียบร้อย', 'success');
    await loadNotifications();
    await renderApprove(document.getElementById('content'));
  } else {
    showToast(r.error, 'error');
  }
}

async function doShowWarning(violationId) {
  const popup = window.open('', '_blank');
  if (popup) popup.document.write('<p style="font-family:Sarabun,Arial;padding:24px">กำลังเปิดหนังสือ...</p>');
  showLoading(true);
  const r = await callGAS('getWarningLetterPdf', S.token, violationId);
  showLoading(false);
  if (!r.success) { if (popup) popup.close(); showToast(r.error, 'error'); return; }
  if (!r.url || !/^https?:\/\//.test(r.url)) { if (popup) popup.close(); showToast('ไม่พบ PDF', 'error'); return; }
  if (popup) popup.location.href = r.url;
  else window.open(r.url, '_blank');
}

function openPdfPreview(url, title = 'PDF') {
  if (!url || !/^https?:\/\//.test(url)) {
    showToast('ไม่พบ PDF', 'error');
    return;
  }
  openModal(`
    <div class="modal-header">
      <span class="modal-title">📄 ${title}</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body" style="padding:0;height:75vh">
      <iframe src="${url}" style="width:100%;height:100%;border:0;border-radius:0 0 8px 8px"></iframe>
    </div>
    <div class="modal-footer">
      <a class="btn btn-outline" href="${url}" target="_blank">เปิดในแท็บใหม่</a>
      <button class="btn btn-primary" onclick="closeModal()">ปิด</button>
    </div>
  `, 'modal-xl');
}


function openAckForm(violationId) {
  openModal(`
    <div class="modal-header">
      <span class="modal-title">✅ ยืนยันรับทราบ</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="info-box blue" style="margin-bottom:12px">
        แนบรูปหลักฐานการรับทราบ ระบบจะสร้างหน้าที่ 2 ของหนังสือเป็นหลักฐานอัตโนมัติ
      </div>
      <div class="form-group">
        <label class="form-label required">รูปหลักฐาน</label>
        <div class="photo-zone" onclick="document.getElementById('ack-photos').click()">
          📷 คลิกเพื่อเลือกรูปหลักฐาน
        </div>
        <input type="file" id="ack-photos" accept="image/*" multiple style="display:none"
               onchange="previewPhotos(this,'ack-preview')">
        <div class="photo-previews" id="ack-preview"></div>
      </div>
      <div class="form-hint">เมื่อกดยืนยัน PDF ฉบับรับทราบจะมีหน้าที่ 2 พร้อมรูปหลักฐาน</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="submitAck('${violationId}')">✅ ยืนยันรับทราบ</button>
    </div>
  `);
}


async function submitAck(violationId) {
  const files    = Array.from(document.getElementById('ack-photos').files);
  if (!files.length) { showToast('กรุณาอัปโหลดรูปหลักฐาน', 'error'); return; }
  const filesData = await filesToBase64(files);

  showLoading(true);
  closeModal();
  const r = await callGAS('acknowledgeDocument', S.token, violationId, filesData);
  showLoading(false);

  if (r.success) {
    showToast('รับทราบเรียบร้อย', 'success');
    await loadNotifications();
    await renderApprove(document.getElementById('content'));
  } else {
    showToast(r.error, 'error');
  }
}

// ============================================================
// HISTORY — PM
// ============================================================
async function renderHistory(container) {
  await ensureTrucks();
  const now = new Date();

  container.innerHTML = `
    <div class="card">
      <div class="card-title">📋 ประวัติ PM</div>
      <div class="filter-bar">
        <label>รถ</label>
        <select id="hist-truck" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          ${S.trucks.filter(t=>t.status==='active').map(t=>`<option value="${t.truckNumber}">${t.truckNumber}</option>`).join('')}
        </select>
        <label>ประเภท</label>
        <select id="hist-type" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          <option>เป่ากรอง</option><option>เดรนน้ำ</option><option>อัดจารบี</option>
        </select>
        <label>เดือน</label>
        <input type="number" id="hist-month" class="form-control" style="width:60px"
               placeholder="ทั้งหมด" min="1" max="12">
        <label>ปี</label>
        <input type="number" id="hist-year" class="form-control" style="width:75px"
               placeholder="ทั้งหมด">
        <button class="btn btn-primary btn-sm" onclick="loadHistory()">🔍 ค้นหา</button>
      </div>
      <div id="hist-results"><div class="empty"><div class="spinner"></div></div></div>
    </div>
  `;

  await loadHistory();
}

async function loadHistory() {
  const truck = document.getElementById('hist-truck').value;
  const type  = document.getElementById('hist-type').value;
  const month = document.getElementById('hist-month').value;
  const year  = document.getElementById('hist-year').value;

  const el = document.getElementById('hist-results');
  el.innerHTML = '<div class="empty"><div class="spinner"></div></div>';

  const filters = {};
  if (truck) filters.truckNumber = truck;
  if (type)  filters.type  = type;
  if (month) filters.month = month;
  if (year)  filters.year  = year;

  const r = await callGAS('getMaintenanceLogs', S.token, filters);
  if (!r.success) { el.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; return; }

  const data = (r.data || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!data.length) { el.innerHTML = '<div class="empty"><p>ไม่พบข้อมูล</p></div>'; return; }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>รถ</th><th>คนขับ</th><th>ประเภท</th><th>รอบ</th><th>สถานะ</th><th>วันที่</th><th>รูป</th><th>เอกสาร</th><th>หมายเหตุ</th></tr></thead>
        <tbody>
          ${data.map(rec => {
            const photos    = safePhotoUrls(rec.photoUrls || rec.photo_urls);
            const empNick   = rec.employee?.nickname || rec.employeeId || '-';
            const docUrl = rec.pdfUrl || rec.documentUrl || rec.warningPdfUrl || '';
            return `
              <tr>
                <td style="font-weight:600">${rec.truckNumber}</td>
                <td style="font-size:12px">${empNick}</td>
                <td>${rec.type}</td>
                <td>${rec.weekLabel || '-'}</td>
                <td><span class="status-badge" style="background:${STATUS_COLOR[rec.status]||'#a0aec0'};color:#fff;font-size:11px">${rec.status}</span></td>
                <td style="font-size:11px;white-space:nowrap">${fmtDT(rec.logDate || rec.createdAt)}</td>
                <td style="white-space:nowrap">${photoPreviewButton(photos)}</td>
                <td style="white-space:nowrap">${docLinkButton(docUrl, 'เปิด')}</td>
                <td style="white-space:nowrap">
                  ${rec.notes ? `<span title="${rec.notes}" style="cursor:help">📝</span>` : '-'}
                  <button class="btn-ghost btn-sm" onclick="openComments('maintenance','${rec.id}')">💬</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function notifyLine(logId, hasPhotos) {
  if (!hasPhotos) { showToast('กรุณาแนบรูปหลักฐานก่อน', 'error'); return; }
  const btn = document.getElementById('nline-' + logId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  const r = await callGAS('notifyLine', S.token, logId);
  if (!r.success) {
    showToast(r.error, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '📣แจ้ง'; }
    return;
  }
  showToast('แจ้งลงกลุ่มไลน์เรียบร้อย ✓', 'success');
  if (btn) { btn.disabled = true; btn.textContent = '✅แจ้งแล้ว'; btn.style.color = 'var(--green)'; }
  await loadNotifications();
}

// ============================================================
// VIO HISTORY — ประวัติการละเลย
// ============================================================
async function renderVioHistory(container) {
  await ensureTrucks();
  const now = new Date();

  container.innerHTML = `
    <div class="card">
      <div class="card-title">📁 ประวัติใบเตือน</div>
      <div class="filter-bar">
        <label>รถ</label>
        <select id="vh-truck" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          ${S.trucks.filter(t=>t.status==='active').map(t=>`<option value="${t.truckNumber}">${t.truckNumber}</option>`).join('')}
        </select>
        <label>ประเภท</label>
        <select id="vh-type" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          <option>เป่ากรอง</option><option>เดรนน้ำ</option><option>อัดจารบี</option>
        </select>
        <label>เดือน</label>
        <input type="number" id="vh-month" class="form-control" style="width:60px"
               value="" placeholder="${now.getMonth()+1}" min="1" max="12">
        <label>ปี</label>
        <input type="number" id="vh-year" class="form-control" style="width:75px"
               value="" placeholder="${now.getFullYear()}">
        <button class="btn btn-primary btn-sm" onclick="loadVioHistory()">🔍 ค้นหา</button>
      </div>
      <div id="vh-results"><div class="empty"><div class="spinner"></div></div></div>
    </div>
  `;

  await loadVioHistory();
}

async function loadVioHistory() {
  const truck = document.getElementById('vh-truck').value;
  const type  = document.getElementById('vh-type').value;
  const month = document.getElementById('vh-month').value;
  const year  = document.getElementById('vh-year').value;

  const el = document.getElementById('vh-results');
  el.innerHTML = '<div class="empty"><div class="spinner"></div></div>';

  const filters = {};
  if (truck) filters.truckNumber = truck;
  if (type)  filters.type  = type;
  if (month) filters.month = month;
  if (year)  filters.year  = year;

  const r = await callGAS('getViolationLogs', S.token, filters);
  if (!r.success) { el.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; return; }

  const data = (r.data || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!data.length) { el.innerHTML = '<div class="empty"><p>ไม่พบข้อมูล</p></div>'; return; }

  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>รถ</th><th>พนักงาน</th><th>ประเภท</th><th>รอบ</th><th>ระดับ</th><th>สถานะ</th><th>วันที่</th><th></th></tr></thead>
        <tbody>
          ${data.map(v => {
            const empNick = v.employee?.nickname || v.employeeId || '-';
            const docStatus = { pending:'รออนุมัติ', approved:'รอรับทราบ', acknowledged:'เสร็จสิ้น' }[v.docStatus] || v.docStatus;
            const docBadge  = { pending:'badge-yellow', approved:'badge-orange', acknowledged:'badge-green' }[v.docStatus] || 'badge-gray';
            return `
              <tr>
                <td style="font-weight:600">${v.truckNumber}</td>
                <td style="font-size:12px">${empNick}</td>
                <td>${v.type}</td>
                <td>${v.weekLabel || '-'}</td>
                <td style="text-align:center">${v.punishmentLevel||1}</td>
                <td><span class="status-badge ${docBadge}">${docStatus}</span></td>
                <td style="font-size:11px;white-space:nowrap">${fmtDT(v.createdAt)}</td>
                <td style="white-space:nowrap">
                  <button class="btn-ghost btn-sm" onclick="doShowWarning('${v.id}')" title="ดู/พิมพ์หนังสือ">🖨</button>
                  <button class="btn-ghost btn-sm" onclick="openComments('violation','${v.id}')">💬</button>
                  ${(v.pdfAckUrl||v.pdfApprovedUrl) ? `<a class="btn-ghost btn-sm" href="${v.pdfAckUrl||v.pdfApprovedUrl}" target="_blank" title="PDF">📄</a>` : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
// STOPPED TRUCK HISTORY
// ============================================================
async function renderStoppedHistory(container) {
  await ensureTrucks();
  const now = new Date();
  container.innerHTML = `
    <div class="card">
      <div class="card-title">⛔ ประวัติรถที่โดนสั่งหยุด</div>
      <div class="filter-bar">
        <label>รถ</label>
        <select id="sh-truck" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          ${S.trucks.map(t=>`<option value="${t.truckNumber}">${t.truckNumber}</option>`).join('')}
        </select>
        <label>ประเภท</label>
        <select id="sh-type" class="form-control" style="width:auto">
          <option value="">ทั้งหมด</option>
          <option>เป่ากรอง</option><option>เดรนน้ำ</option><option>อัดจารบี</option>
        </select>
        <label>เดือน</label>
        <input type="number" id="sh-month" class="form-control" style="width:60px" placeholder="${now.getMonth()+1}" min="1" max="12">
        <label>ปี</label>
        <input type="number" id="sh-year" class="form-control" style="width:75px" placeholder="${now.getFullYear()}">
        <button class="btn btn-primary btn-sm" onclick="loadStoppedHistory()">ค้นหา</button>
      </div>
      <div id="sh-results"><div class="empty"><div class="spinner"></div></div></div>
    </div>
  `;
  await loadStoppedHistory();
}

async function loadStoppedHistory() {
  const el = document.getElementById('sh-results');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  const filters = {
    truckNumber: document.getElementById('sh-truck')?.value || '',
    type: document.getElementById('sh-type')?.value || '',
    month: document.getElementById('sh-month')?.value || '',
    year: document.getElementById('sh-year')?.value || ''
  };
  const r = await callGAS('getStoppedTruckHistory', S.token, filters);
  if (!r.success) { el.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; return; }
  const data = r.data || [];
  if (!data.length) { el.innerHTML = '<div class="empty"><p>ไม่พบประวัติรถที่โดนสั่งหยุด</p></div>'; return; }
  el.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>รถ</th><th>พนักงาน</th><th>ประเภท</th><th>รอบ</th><th>ระดับ</th><th>สถานะหยุด</th><th>วันที่</th><th>หลักฐาน</th><th>เอกสาร</th></tr></thead>
        <tbody>
          ${data.map(v => {
            const emp = v.employee?.nickname || v.employeeId || '-';
            const cleared = v.followupDone === true || v.followupDone === 'true';
            const photos = safePhotoUrls(v.ackPhotoUrls || v.ack_photo_urls || v.ackPhotoUrl || v.ack_photo_url);
            const pdf = v.pdfUrl || v.pdf_url || v.pdfAckUrl || v.pdfApprovedUrl || v.pdfPendingUrl || '';
            return `<tr>
              <td style="font-weight:700">${v.truckNumber || '-'}</td>
              <td>${emp}</td>
              <td>${v.type || '-'}</td>
              <td>${v.weekLabel || v.round || '-'}</td>
              <td>${v.punishmentLevel || '-'}</td>
              <td><span class="status-badge ${cleared ? 'badge-green' : 'badge-red'}">${cleared ? 'เคลียร์แล้ว' : 'ยังหยุดอยู่'}</span></td>
              <td style="white-space:nowrap">${fmtDT(v.createdAt)}</td>
              <td>${photoPreviewButton(photos, 'หลักฐาน')}</td>
              <td style="white-space:nowrap">
                <button class="btn-ghost btn-sm" onclick="doShowWarning('${v.id}')">ดูหนังสือ</button>
                ${docLinkButton(pdf, 'PDF')}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================================
// GOOD EMPLOYEES PAGE
// ============================================================
async function renderGoodEmployees(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">⭐ พนักงานทำดี — ไม่มีใบเตือนใน 2 เดือน</div>
      <div id="ge-loading"><div class="empty"><div class="spinner"></div></div></div>
      <div id="ge-content" style="display:none"></div>
    </div>
  `;

  const r = await callGAS('getGoodEmployees', S.token);
  const loadEl = document.getElementById('ge-loading');
  const cntEl  = document.getElementById('ge-content');
  if (loadEl) loadEl.style.display = 'none';
  if (!cntEl) return;

  if (!r.success) {
    cntEl.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`;
    cntEl.style.display = '';
    return;
  }

  const data = r.data || [];
  if (!data.length) {
    cntEl.innerHTML = '<div class="empty"><p>ไม่มีพนักงานที่ผ่านเกณฑ์</p></div>';
    cntEl.style.display = '';
    return;
  }

  const medals = ['🥇','🥈','🥉'];
  const top3Html = data.slice(0, 3).map((emp, i) => `
    <div style="flex:1;min-width:160px;background:${i===0?'#fffbea':'#f7f9fc'};border:2px solid ${i===0?'#f6c90e':'#e2e8f0'};border-radius:14px;padding:18px 16px;text-align:center;cursor:pointer"
         onclick="showGoodEmpDetail('${emp.employeeId}')">
      <div style="font-size:32px">${medals[i] || (i+1)+'.'}</div>
      <div style="font-size:16px;font-weight:700;margin-top:6px">${emp.nickname}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${emp.fullName}</div>
      <div style="margin-top:8px;font-size:13px;color:${emp.streakDays===999?'#4a9d5f':'#2d7dd2'};font-weight:600">
        ${emp.streakDays === 999 ? 'ไม่เคยมีใบเตือน' : '🔥 ' + emp.streakDays + ' วัน'}
      </div>
      <div style="font-size:11px;color:#4a9d5f;margin-top:4px">PM 3 เดือน: ${emp.pmCount} งาน</div>
    </div>
  `).join('');

  const tableHtml = data.map((emp, i) => `
    <tr style="cursor:pointer" onclick="showGoodEmpDetail('${emp.employeeId}')">
      <td style="text-align:center;font-size:15px">${medals[i] || (i+1)}</td>
      <td style="font-weight:600">${emp.nickname}</td>
      <td style="font-size:12px;color:#666">${emp.fullName}</td>
      <td style="text-align:center;font-weight:600;color:${emp.streakDays===999?'#4a9d5f':'#2d7dd2'}">
        ${emp.streakDays === 999 ? 'ไม่เคยโดน' : emp.streakDays + ' วัน'}
      </td>
      <td style="text-align:center">${emp.pmCount}</td>
      <td style="font-size:11px;color:#999">${emp.lastVioAt ? fmtDT(emp.lastVioAt) : '-'}</td>
    </tr>
  `).join('');

  cntEl.innerHTML = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">
      ${top3Html}
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>#</th><th>ชื่อเล่น</th><th>ชื่อ-สกุล</th><th>Streak</th><th>PM (3 เดือน)</th><th>ใบเตือนล่าสุด</th></tr>
        </thead>
        <tbody>${tableHtml}</tbody>
      </table>
    </div>
  `;
  cntEl.style.display = '';
}

async function showGoodEmpDetail(employeeId) {
  const modal = document.getElementById('modal-container');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <div class="modal-header">
          <span class="modal-title">⭐ รายละเอียดพนักงาน</span>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body" id="ge-detail-body">
          <div class="empty"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  const [empR, vioR] = await Promise.all([
    callGAS('getEmployees', S.token),
    callGAS('getViolationLogs', S.token, { employeeId })
  ]);

  const body = document.getElementById('ge-detail-body');
  if (!body) return;

  const emp = (empR.data || []).find(e => e.employeeId === employeeId);
  if (!emp) { body.innerHTML = '<div class="empty"><p>ไม่พบข้อมูล</p></div>'; return; }

  const vios = (vioR.data || []).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const now  = new Date();
  const cut2M = new Date(now); cut2M.setMonth(cut2M.getMonth() - 2);
  const recentVios = vios.filter(v => v.createdAt && new Date(v.createdAt) >= cut2M);

  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:40px">👷</div>
      <div style="font-size:18px;font-weight:700">${emp.nickname}</div>
      <div style="font-size:13px;color:#666">${emp.fullName}</div>
      <div style="font-size:11px;color:#999">${emp.employeeId}</div>
    </div>
    <div style="display:flex;gap:12px;justify-content:center;margin-bottom:16px;flex-wrap:wrap">
      <div style="background:#f0fff4;border-radius:8px;padding:8px 16px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#4a9d5f">${recentVios.length === 0 ? '✅ ไม่มี' : recentVios.length}</div>
        <div style="font-size:11px;color:#666">ใบเตือน 2 เดือน</div>
      </div>
      <div style="background:#ebf8ff;border-radius:8px;padding:8px 16px;text-align:center">
        <div style="font-size:20px;font-weight:700;color:#2d7dd2">${vios.length}</div>
        <div style="font-size:11px;color:#666">ใบเตือนทั้งหมด</div>
      </div>
    </div>
    ${vios.length ? `
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;color:#555">ประวัติใบเตือน</div>
      ${vios.slice(0,5).map(v => `
        <div style="font-size:12px;padding:6px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">
          <span>${v.type} — ระดับ ${v.punishmentLevel}</span>
          <span style="color:#999">${fmtDT(v.createdAt)}</span>
        </div>
      `).join('')}
    ` : '<div style="text-align:center;color:#4a9d5f;font-size:13px">ไม่มีประวัติใบเตือน</div>'}
  `;
}

// ============================================================
// WARNED EMPLOYEES PAGE
// ============================================================
async function renderWarnedEmployees(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-title">⚠️ พนักงานที่โดนหนังสือเตือน</div>
      <div id="we-loading"><div class="empty"><div class="spinner"></div></div></div>
      <div id="we-content" style="display:none"></div>
    </div>
  `;
  const r = await callGAS('getWarnedEmployees', S.token);
  const loadEl = document.getElementById('we-loading');
  const cntEl = document.getElementById('we-content');
  if (loadEl) loadEl.style.display = 'none';
  if (!cntEl) return;
  if (!r.success) { cntEl.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; cntEl.style.display = ''; return; }
  const data = r.data || [];
  if (!data.length) { cntEl.innerHTML = '<div class="empty"><p>ยังไม่มีพนักงานที่โดนหนังสือเตือน</p></div>'; cntEl.style.display = ''; return; }
  const medals = ['🥇','🥈','🥉'];
  const top3Html = data.slice(0,3).map((emp,i)=>`
    <div class="warn-rank-card" onclick="showWarnedEmpDetail('${emp.employeeId}')">
      <div style="font-size:32px">${medals[i] || i+1}</div>
      <div style="font-size:16px;font-weight:700;margin-top:6px">${emp.nickname || emp.employeeId}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${emp.fullName || '-'}</div>
      <div style="margin-top:8px;font-size:18px;color:var(--red);font-weight:700">${emp.vioTotal} ครั้ง</div>
      <div style="font-size:11px;color:#999;margin-top:4px">ล่าสุด ${emp.lastVioAt ? fmtDT(emp.lastVioAt) : '-'}</div>
    </div>`).join('');
  const tableHtml = data.map((emp,i)=>`
    <tr style="cursor:pointer" onclick="showWarnedEmpDetail('${emp.employeeId}')">
      <td style="text-align:center;font-size:15px">${medals[i] || (i+1)}</td>
      <td style="font-weight:600">${emp.nickname || '-'}</td>
      <td style="font-size:12px;color:#666">${emp.fullName || '-'}</td>
      <td style="text-align:center;font-weight:700;color:var(--red)">${emp.vioTotal}</td>
      <td style="text-align:center">${emp.stopTotal || 0}</td>
      <td style="font-size:11px;color:#999">${emp.lastVioAt ? fmtDT(emp.lastVioAt) : '-'}</td>
    </tr>`).join('');
  cntEl.innerHTML = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px">${top3Html}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>ชื่อเล่น</th><th>ชื่อ-สกุล</th><th>ใบเตือน</th><th>สั่งหยุด</th><th>ล่าสุด</th></tr></thead>
      <tbody>${tableHtml}</tbody>
    </table></div>`;
  cntEl.style.display = '';
}

async function showWarnedEmpDetail(employeeId) {
  openModal(`
    <div class="modal-header"><span class="modal-title">⚠️ รายละเอียดพนักงานโดนเตือน</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body" id="we-detail-body"><div class="empty"><div class="spinner"></div></div></div>
  `, 'modal-lg');
  const r = await callGAS('getViolationLogs', S.token, { employeeId });
  const body = document.getElementById('we-detail-body');
  if (!body) return;
  if (!r.success) { body.innerHTML = `<div class="empty"><p style="color:var(--red)">${r.error}</p></div>`; return; }
  const vios = (r.data || []).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const emp = vios[0]?.employee || {};
  body.innerHTML = `
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:40px">⚠️</div>
      <div style="font-size:18px;font-weight:700">${emp.nickname || employeeId}</div>
      <div style="font-size:13px;color:#666">${emp.fullName || ''}</div>
      <div style="font-size:11px;color:#999">${employeeId}</div>
    </div>
    ${!vios.length ? '<div class="empty"><p>ไม่พบประวัติใบเตือน</p></div>' : `
      <div class="table-wrap"><table>
        <thead><tr><th>รถ</th><th>ประเภท</th><th>รอบ</th><th>ระดับ</th><th>สถานะ</th><th>วันที่</th><th></th></tr></thead>
        <tbody>${vios.map(v=>`
          <tr>
            <td>${v.truckNumber || '-'}</td><td>${v.type || '-'}</td><td>${v.weekLabel || '-'}</td>
            <td style="text-align:center">${v.punishmentLevel || '-'}</td>
            <td>${v.stopOrder ? '<span class="status-badge badge-red">หยุดรถ</span>' : (v.docStatus || '-')}</td>
            <td style="font-size:11px;white-space:nowrap">${fmtDT(v.createdAt)}</td>
            <td><button class="btn-ghost btn-sm" onclick="doShowWarning('${v.id}')">📄</button></td>
          </tr>`).join('')}</tbody>
      </table></div>`}
  `;
}

// ============================================================
// SETTINGS
// ============================================================
async function renderSettings(container) {
  const tabs = [
    { id:'users',     label:'👤 ผู้ใช้',    minRole:'admin'     },
    { id:'signature', label:'✍️ ลายเซ็นต์', minRole:'manager'   },
    { id:'employees', label:'👷 พนักงาน',  minRole:'operation' },
    { id:'trucks',    label:'🚛 รถบรรทุก', minRole:'operation' },
  ].filter(t => hasRole(t.minRole));

  container.innerHTML = `
    <div class="card">
      <div class="tabs" id="settings-tabs">
        ${tabs.map((t,i)=>`
          <div class="tab${i===0?' active':''}" data-tab="${t.id}" onclick="switchTab('${t.id}')">${t.label}</div>
        `).join('')}
      </div>
      <div id="settings-body" style="padding-top:16px">
        <div class="empty"><div class="spinner"></div></div>
      </div>
    </div>
  `;

  if (tabs.length) switchTab(tabs[0].id);
}

async function switchTab(tab) {
  document.querySelectorAll('#settings-tabs .tab').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === tab));
  const body = document.getElementById('settings-body');
  body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
  switch(tab) {
    case 'employees': await settingsEmployees(body); break;
    case 'trucks':    await settingsTrucks(body);    break;
    case 'signature': await settingsSignature(body); break;
    case 'users':     await settingsUsers(body);     break;
  }
}

// --- Employees ---
async function settingsEmployees(el) {
  const r = await callGAS('getEmployees', S.token);
  if (!r.success) { el.innerHTML = `<p style="color:var(--red)">${r.error}</p>`; return; }
  const data = r.data || [];

  el.innerHTML = `
    <div class="settings-header">
      <span>${data.length} พนักงาน</span>
      ${hasRole('operation') ? `<button class="btn btn-primary btn-sm" onclick="modalAddEmployee()">+ เพิ่มพนักงาน</button>` : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>รหัส</th><th>ชื่อเล่น</th><th>ชื่อ-นามสกุล</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>
        ${data.map(e => `
          <tr>
            <td>${e.employeeId}</td>
            <td>${e.nickname||'-'}</td>
            <td>${e.fullName}</td>
            <td><span class="status-badge ${e.status==='active'?'badge-green':'badge-gray'}">${e.status}</span></td>
            <td style="white-space:nowrap">
              ${hasRole('operation') ? `<button class="btn-ghost btn-sm" onclick="modalEditEmployee('${e.employeeId}','${e.nickname||''}','${e.fullName}','${e.status}')">✏️</button>` : ''}
              ${hasRole('operation') ? `<button class="btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteEmployee('${e.employeeId}')">🗑</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function modalAddEmployee() {
  openModal(`
    <div class="modal-header"><span class="modal-title">เพิ่มพนักงาน</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label required">รหัสพนักงาน</label><input id="m-emp-id" class="form-control" placeholder="SWJ-XXX"></div>
      <div class="form-group"><label class="form-label">ชื่อเล่น</label><input id="m-emp-nick" class="form-control"></div>
      <div class="form-group"><label class="form-label required">ชื่อ-นามสกุล</label><input id="m-emp-name" class="form-control"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="saveEmployee()">บันทึก</button>
    </div>
  `);
}

async function saveEmployee() {
  const id   = document.getElementById('m-emp-id')?.value.trim();
  const nick = document.getElementById('m-emp-nick')?.value.trim();
  const name = document.getElementById('m-emp-name')?.value.trim();
  if (!id || !name) { showToast('กรุณากรอกรหัสและชื่อ', 'error'); return; }
  showLoading(true);
  const r = await callGAS('createEmployee', S.token, { employeeId:id, nickname:nick, fullName:name });
  showLoading(false);
  closeModal();
  if (r.success) { showToast('เพิ่มพนักงานแล้ว','success'); switchTab('employees'); }
  else showToast(r.error, 'error');
}

function modalEditEmployee(id, nick, name, status) {
  openModal(`
    <div class="modal-header"><span class="modal-title">แก้ไข ${id}</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">ชื่อเล่น</label><input id="m-emp-nick" class="form-control" value="${nick}"></div>
      <div class="form-group"><label class="form-label required">ชื่อ-นามสกุล</label><input id="m-emp-name" class="form-control" value="${name}"></div>
      <div class="form-group"><label class="form-label">สถานะ</label>
        <select id="m-emp-status" class="form-control">
          <option value="active" ${status==='active'?'selected':''}>active</option>
          <option value="inactive" ${status!=='active'?'selected':''}>inactive</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="updateEmployee('${id}')">บันทึก</button>
    </div>
  `);
}

async function updateEmployee(id) {
  const nick   = document.getElementById('m-emp-nick')?.value.trim();
  const name   = document.getElementById('m-emp-name')?.value.trim();
  const status = document.getElementById('m-emp-status')?.value;
  showLoading(true);
  const r = await callGAS('updateEmployee', S.token, id, { nickname:nick, fullName:name, status });
  showLoading(false);
  closeModal();
  if (r.success) { showToast('อัปเดตแล้ว','success'); switchTab('employees'); }
  else showToast(r.error, 'error');
}

async function confirmDeleteEmployee(id) {
  if (!confirm(`ลบพนักงาน ${id}?`)) return;
  showLoading(true);
  const r = await callGAS('deleteEmployee', S.token, id);
  showLoading(false);
  if (r.success) { showToast('ลบแล้ว','success'); switchTab('employees'); }
  else showToast(r.error, 'error');
}

// --- Trucks ---
async function settingsTrucks(el) {
  await ensureEmployees();
  const r = await callGAS('getTrucks', S.token);
  if (!r.success) { el.innerHTML = `<p style="color:var(--red)">${r.error}</p>`; return; }
  S.trucks = r.data || [];

  el.innerHTML = `
    <div class="settings-header">
      <span>${S.trucks.length} คัน</span>
      ${hasRole('operation') ? `<button class="btn btn-primary btn-sm" onclick="modalAddTruck()">+ เพิ่มรถ</button>` : ''}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>หมายเลขรถ</th><th>คนขับ</th><th>สถานะ</th><th></th></tr></thead>
      <tbody>
        ${S.trucks.map(t => `
          <tr>
            <td style="font-weight:600">${t.truckNumber}</td>
            <td style="font-size:12px">${t.employee ? t.employee.nickname+' ('+t.employeeId+')' : (t.employeeId || '-')}</td>
            <td><span class="status-badge ${t.status==='active'?'badge-green':'badge-gray'}">${t.status}</span></td>
            <td style="white-space:nowrap">
              ${hasRole('operation') ? `<button class="btn-ghost btn-sm" onclick="modalEditTruck('${t.truckNumber}','${t.employeeId||''}','${t.status}')">✏️</button>` : ''}
              ${hasRole('operation') ? `<button class="btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteTruck('${t.truckNumber}')">🗑</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function modalAddTruck() {
  const empOpts = S.employees.map(e => `<option value="${e.employeeId}">${e.nickname||e.employeeId} — ${e.fullName}</option>`).join('');
  openModal(`
    <div class="modal-header"><span class="modal-title">เพิ่มรถ</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label required">หมายเลขรถ</label><input id="m-truck-num" class="form-control"></div>
      <div class="form-group"><label class="form-label">คนขับ</label>
        <select id="m-truck-emp" class="form-control"><option value="">-- ไม่ระบุ --</option>${empOpts}</select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="saveTruck()">บันทึก</button>
    </div>
  `);
}

async function saveTruck() {
  const num = document.getElementById('m-truck-num')?.value.trim();
  const emp = document.getElementById('m-truck-emp')?.value;
  if (!num) { showToast('กรุณากรอกหมายเลขรถ', 'error'); return; }
  showLoading(true);
  const r = await callGAS('createTruck', S.token, { truckNumber:num, employeeId:emp||'' });
  showLoading(false);
  closeModal();
  if (r.success) { showToast('เพิ่มรถแล้ว','success'); S.trucks=[]; switchTab('trucks'); }
  else showToast(r.error, 'error');
}

function modalEditTruck(num, empId, status) {
  const empOpts = S.employees.map(e =>
    `<option value="${e.employeeId}" ${e.employeeId===empId?'selected':''}>${e.nickname||e.employeeId} — ${e.fullName}</option>`
  ).join('');
  openModal(`
    <div class="modal-header"><span class="modal-title">แก้ไขรถ ${num}</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">คนขับ</label>
        <select id="m-truck-emp" class="form-control"><option value="">-- ไม่ระบุ --</option>${empOpts}</select>
      </div>
      <div class="form-group"><label class="form-label">สถานะ</label>
        <select id="m-truck-status" class="form-control">
          <option value="active" ${status==='active'?'selected':''}>active</option>
          <option value="inactive" ${status!=='active'?'selected':''}>inactive</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="updateTruck('${num}')">บันทึก</button>
    </div>
  `);
}

async function updateTruck(num) {
  const emp    = document.getElementById('m-truck-emp')?.value;
  const status = document.getElementById('m-truck-status')?.value;
  showLoading(true);
  const r = await callGAS('updateTruck', S.token, num, { employeeId:emp, status });
  showLoading(false);
  closeModal();
  if (r.success) { showToast('อัปเดตแล้ว','success'); S.trucks=[]; switchTab('trucks'); }
  else showToast(r.error, 'error');
}

async function confirmDeleteTruck(num) {
  if (!confirm(`ลบรถ ${num}?`)) return;
  showLoading(true);
  const r = await callGAS('deleteTruck', S.token, num);
  showLoading(false);
  if (r.success) { showToast('ลบแล้ว','success'); S.trucks=[]; switchTab('trucks'); }
  else showToast(r.error, 'error');
}

// --- Signature ---
async function settingsSignature(el) {
  showLoading(true);
  const r = await callGAS('getMyProfile', S.token);
  showLoading(false);
  const sigUrl = r.success ? (r.data?.signatureDataUrl || r.data?.signatureUrl || '') : '';

  el.innerHTML = `
    <div style="max-width:520px">
      <h4 style="margin-bottom:12px;color:var(--navy)">ลายเซ็นต์ของฉัน (${S.user?.name})</h4>
      <div id="sig-current" style="margin-bottom:16px">
        ${sigUrl
          ? `<div style="background:#f8f9fa;border:2px dashed #dee2e6;border-radius:10px;padding:16px;display:inline-block;margin-bottom:10px;min-width:240px;text-align:center">
               <img src="${sigUrl}" style="max-width:300px;max-height:140px;display:block;margin:0 auto"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
               <div style="display:none;color:var(--red);font-size:12px;padding:8px">โหลดรูปไม่ได้ - ลองอัปโหลดใหม่</div>
             </div>
             <div style="display:flex;gap:8px;margin-top:6px">
               ${hasRole('admin') ? `<button class="btn btn-danger btn-sm" onclick="clearSignature()">🗑 ลบลายเซ็น</button>` : ''}
             </div>`
          : '<div class="info-box yellow">ยังไม่มีลายเซ็น</div>'}
      </div>
      <div class="form-group">
        <label class="form-label">อัปโหลดลายเซ็นใหม่ (PNG แนะนำ พื้นโปร่งใส)</label>
        <div class="photo-zone" onclick="document.getElementById('sig-file').click()">
          ✍️ คลิกเพื่อเลือกไฟล์ลายเซ็น
        </div>
        <input type="file" id="sig-file" accept="image/*" style="display:none" onchange="previewSig(this)">
        <div id="sig-preview" style="margin-top:8px"></div>
      </div>
      <button class="btn btn-primary" onclick="doUploadSignature()">อัปโหลดลายเซ็น</button>
    </div>
  `;
}


function previewSig(input) {
  if (!input.files[0]) return;
  const preview = document.getElementById('sig-preview');
  const img = document.createElement('img');
  img.src = URL.createObjectURL(input.files[0]);
  img.style.cssText = 'max-width:220px;max-height:110px;border:1px solid var(--border);border-radius:6px';
  preview.innerHTML = '';
  preview.appendChild(img);
}

async function doUploadSignature() {
  const file = document.getElementById('sig-file')?.files[0];
  if (!file) { showToast('กรุณาเลือกไฟล์', 'error'); return; }
  const b64 = (await fileToBase64(file)).split(',')[1];
  showLoading(true);
  const r = await callGAS('uploadSignature', S.token, b64, file.type);
  showLoading(false);
  if (r.success) { showToast('อัปโหลดลายเซ็นแล้ว','success'); switchTab('signature'); }
  else showToast(r.error, 'error');
}

async function clearSignature() {
  if (!confirm('ลบลายเซ็นนี้?')) return;
  // admin only — update via updateUser with empty signature_url
  const profile = await callGAS('getMyProfile', S.token);
  if (!profile.success) { showToast('ไม่สามารถโหลดข้อมูลผู้ใช้', 'error'); return; }
  showLoading(true);
  const r = await callGAS('updateUser', S.token, profile.data.id, { signatureUrl: '' });
  showLoading(false);
  if (r.success) { showToast('ลบลายเซ็นแล้ว','success'); switchTab('signature'); }
  else showToast(r.error, 'error');
}

// --- Users (admin) ---
async function settingsUsers(el) {
  const r = await callGAS('getUsers', S.token);
  if (!r.success) { el.innerHTML = `<p style="color:var(--red)">${r.error}</p>`; return; }
  const data = r.data || [];

  el.innerHTML = `
    <div class="settings-header">
      <span>${data.length} ผู้ใช้</span>
      <button class="btn btn-primary btn-sm" onclick="modalAddUser()">+ เพิ่มผู้ใช้</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Username</th><th>ชื่อ</th><th>Role</th><th>สร้างเมื่อ</th><th></th></tr></thead>
      <tbody>
        ${data.map(u => `
          <tr>
            <td style="font-weight:600">${u.username}</td>
            <td>${u.name}</td>
            <td><span class="status-badge badge-blue">${u.role}</span></td>
            <td style="font-size:11px">${fmtDT(u.createdAt)}</td>
            <td style="white-space:nowrap">
              <button class="btn-ghost btn-sm" onclick="modalEditUser('${u.id}','${u.name}','${u.role}')">✏️</button>
              <button class="btn-ghost btn-sm" style="color:var(--red)" onclick="confirmDeleteUser('${u.id}','${u.username}')">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function modalAddUser() {
  openModal(`
    <div class="modal-header"><span class="modal-title">เพิ่มผู้ใช้</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label required">Username</label><input id="m-u-uname" class="form-control"></div>
      <div class="form-group"><label class="form-label required">ชื่อ</label><input id="m-u-name" class="form-control"></div>
      <div class="form-group"><label class="form-label required">รหัสผ่าน</label><input type="password" id="m-u-pass" class="form-control"></div>
      <div class="form-group"><label class="form-label required">Role</label>
        <select id="m-u-role" class="form-control">
          <option value="viewer">viewer — ดูอย่างเดียว</option>
          <option value="operation">operation — บันทึกได้</option>
          <option value="manager">manager — อนุมัติได้</option>
          <option value="admin">admin — ทุกสิทธิ์</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="saveUser()">บันทึก</button>
    </div>
  `);
}

async function saveUser() {
  const uname = document.getElementById('m-u-uname')?.value.trim();
  const name  = document.getElementById('m-u-name')?.value.trim();
  const pass  = document.getElementById('m-u-pass')?.value;
  const role  = document.getElementById('m-u-role')?.value;
  if (!uname || !name || !pass) { showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  showLoading(true);
  const r = await callGAS('createUser', S.token, { username:uname, name, password:pass, role });
  showLoading(false);
  closeModal();
  if (r.success) { showToast('เพิ่มผู้ใช้แล้ว','success'); switchTab('users'); }
  else showToast(r.error, 'error');
}

function modalEditUser(id, name, role) {
  openModal(`
    <div class="modal-header"><span class="modal-title">แก้ไขผู้ใช้</span><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label required">ชื่อ</label><input id="m-u-name" class="form-control" value="${name}"></div>
      <div class="form-group"><label class="form-label">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label><input type="password" id="m-u-pass" class="form-control"></div>
      <div class="form-group"><label class="form-label required">Role</label>
        <select id="m-u-role" class="form-control">
          ${['viewer','operation','manager','admin'].map(r=>
            `<option value="${r}" ${r===role?'selected':''}>${r}</option>`
          ).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="updateUser('${id}')">บันทึก</button>
    </div>
  `);
}

async function updateUser(id) {
  const name = document.getElementById('m-u-name')?.value.trim();
  const pass = document.getElementById('m-u-pass')?.value;
  const role = document.getElementById('m-u-role')?.value;
  const data = { name, role };
  if (pass) data.password = pass;
  showLoading(true);
  const r = await callGAS('updateUser', S.token, id, data);
  showLoading(false);
  closeModal();
  if (r.success) { showToast('อัปเดตแล้ว','success'); switchTab('users'); }
  else showToast(r.error, 'error');
}

async function confirmDeleteUser(id, username) {
  if (!confirm(`ลบผู้ใช้ ${username}?`)) return;
  showLoading(true);
  const r = await callGAS('deleteUser', S.token, id);
  showLoading(false);
  if (r.success) { showToast('ลบแล้ว','success'); switchTab('users'); }
  else showToast(r.error, 'error');
}

// ============================================================
// COMMENTS MODAL
// ============================================================
async function openComments(refType, refId) {
  openModal(`
    <div class="modal-header">
      <span class="modal-title">💬 ความคิดเห็น</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div id="comment-list-wrap">
        <div class="empty"><div class="spinner"></div></div>
      </div>
    </div>
    <div class="modal-footer" style="flex-direction:column;align-items:stretch;gap:8px">
      <div class="comment-input-row">
        <textarea id="comment-input" class="form-control" rows="2" placeholder="พิมพ์ความคิดเห็น..."></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="closeModal()">ปิด</button>
        <button class="btn btn-primary" onclick="submitComment('${refType}','${refId}')">ส่ง</button>
      </div>
    </div>
  `);

  document.getElementById('comment-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) submitComment(refType, refId);
  });

  await loadComments(refType, refId);
}

async function loadComments(refType, refId) {
  const wrap = document.getElementById('comment-list-wrap');
  if (!wrap) return;
  const r = await callGAS('getComments', S.token, refType, refId);
  if (!r.success) { wrap.innerHTML = `<p style="color:var(--red)">${r.error}</p>`; return; }

  const comments = r.data || [];
  if (!comments.length) {
    wrap.innerHTML = '<div class="empty" style="padding:12px"><p>ยังไม่มีความคิดเห็น</p></div>';
    return;
  }

  wrap.innerHTML = `
    <div class="comment-list">
      ${comments.map(c => {
        const isMe = c.username === S.user?.username;
        return `
          <div class="comment-bubble ${isMe?'mine':''}">
            <div class="comment-header">
              <span class="comment-author">${c.displayName || c.username}</span>
              <span class="comment-time">${fmtDT(c.createdAt)}</span>
            </div>
            <div class="comment-text">${c.message}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
  // Scroll to bottom
  const list = wrap.querySelector('.comment-list');
  if (list) list.scrollTop = list.scrollHeight;
}

async function submitComment(refType, refId) {
  const input   = document.getElementById('comment-input');
  const message = input?.value.trim();
  if (!message) return;
  input.value = '';
  const r = await callGAS('addComment', S.token, refType, refId, message);
  if (r.success) await loadComments(refType, refId);
  else showToast(r.error, 'error');
}

// ============================================================
// PHOTO VIEWER
// ============================================================
function openPhotoViewer(urls) {
  if (!urls || !urls.length) return;
  window._pvUrls = urls;
  window._pvIdx  = 0;
  _renderPhotoViewer();
}

function _renderPhotoViewer() {
  const urls = window._pvUrls;
  const idx  = window._pvIdx;
  openModal(`
    <div class="modal-header">
      <span class="modal-title">📷 รูปภาพ ${idx+1} / ${urls.length}</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body" style="text-align:center">
      <img src="${urls[idx]}" style="max-width:100%;max-height:65vh;border-radius:6px;object-fit:contain"
           onerror="this.alt='โหลดรูปไม่ได้';this.style.padding='20px'">
      ${urls.length > 1 ? `
        <div style="margin-top:10px;display:flex;justify-content:center;align-items:center;gap:12px">
          <button class="btn btn-outline btn-sm" onclick="pvNav(-1)">◀</button>
          <span style="font-size:13px">${idx+1} / ${urls.length}</span>
          <button class="btn btn-outline btn-sm" onclick="pvNav(1)">▶</button>
        </div>
      ` : ''}
      <div style="margin-top:8px">
        <a class="btn btn-outline btn-sm" href="${urls[idx]}" target="_blank">🔗 เปิดในแท็บใหม่</a>
      </div>
    </div>
  `, 'modal-lg');
}

function pvNav(delta) {
  const len = window._pvUrls.length;
  window._pvIdx = (window._pvIdx + delta + len) % len;
  _renderPhotoViewer();
}

// ============================================================
// MODAL SYSTEM
// ============================================================
function openModal(html, extraClass = '') {
  const c = document.getElementById('modal-container');
  c.style.display = 'flex';
  c.innerHTML = `
    <div class="modal-overlay" onclick="closeModal()">
      <div class="modal ${extraClass}" onclick="event.stopPropagation()">
        ${html}
      </div>
    </div>
  `;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const c = document.getElementById('modal-container');
  c.style.display = 'none';
  c.innerHTML = '';
  document.body.style.overflow = '';
}

// ============================================================
// UTILITIES
// ============================================================
function showLoading(show) {
  const el = document.getElementById('loading-overlay');
  if (show) { el.style.display = 'flex'; }
  else      { el.style.display = 'none'; }
}

function showToast(message, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function hasRole(minRole) {
  if (!S.user) return false;
  return (ROLE_ORDER[S.user.role] || 0) >= (ROLE_ORDER[minRole] || 0);
}

function roleLabel(role) {
  return { viewer:'ผู้ดู', operation:'ปฏิบัติการ', manager:'ผู้จัดการ', admin:'ผู้ดูแลระบบ' }[role] || role;
}

function fmtDT(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    const p = n => String(n).padStart(2,'0');
    return `${d.getDate()}/${p(d.getMonth()+1)}/${d.getFullYear()+543} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return iso; }
}

function safePhotoUrls(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(u => u && typeof u === 'string' && u.startsWith('http'));
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(u => u && typeof u === 'string' && u.startsWith('http'));
  } catch {}
  return Array.from(new Set(String(raw).match(/https?:\/\/[^\s"',\]\[]+/g) || []));
}

function photoPreviewButton(photos, label = 'รูป') {
  const urls = safePhotoUrls(photos);
  if (!urls.length) return '<span class="muted" title="ไม่มีรูปหลักฐาน">-</span>';
  return `
    <button class="btn-ghost btn-sm photo-preview-btn" onclick='openPhotoViewer(${JSON.stringify(urls)})'>
      ${urls.slice(0, 3).map(u => `<img src="${u}" alt="">`).join('')}
      <span>${label} ${urls.length}</span>
    </button>
  `;
}

function docLinkButton(url, label = 'เอกสาร') {
  if (!url || !/^https?:\/\//.test(String(url))) {
    return '<span class="muted" title="ไม่มีเอกสารเตือน">ไม่มีเอกสาร</span>';
  }
  return `<a class="btn-ghost btn-sm" href="${url}" target="_blank">${label}</a>`;
}

async function filesToBase64(files) {
  return Promise.all(Array.from(files).map(async f => ({
    name:     f.name,
    mimeType: f.type,
    base64:   (await fileToBase64(f)).split(',')[1]
  })));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function ensureTrucks() {
  if (S.trucks.length) return;
  const r = await callGAS('getTrucks', S.token);
  if (r.success) S.trucks = r.data || [];
}

async function ensureEmployees() {
  if (S.employees.length) return;
  const r = await callGAS('getEmployees', S.token);
  if (r.success) S.employees = r.data || [];
}

// ─── หน้า แจ้งลงกลุ่มไลน์ ───────────────────────────────────────────────────

async function renderLineNotify(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title-h2">📣 แจ้งลงกลุ่มไลน์</h2>
    </div>
    <div class="card" style="max-width:560px;margin-bottom:20px">
      <div class="card-header"><span class="card-title">แจ้งงาน PM ลงกลุ่ม</span></div>
      <div class="card-body">
        <div class="form-group">
          <label class="form-label required">หัวข้องาน</label>
          <div class="type-selector" id="ln-type-selector" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-outline type-btn" onclick="selectLnType(this,'เป่ากรอง')">🔵 เป่ากรอง</button>
            <button class="btn btn-outline type-btn" onclick="selectLnType(this,'เดรนน้ำ')">🟡 เดรนน้ำ</button>
            <button class="btn btn-outline type-btn" onclick="selectLnType(this,'อัดจารบี')">🟢 อัดจารบี</button>
          </div>
          <input type="hidden" id="ln-type" value="">
        </div>
        <div class="form-group">
          <label class="form-label required">Week/รอบ</label>
          <select id="ln-week-round" class="form-control">
            <option value="">-- เลือก Week/รอบ --</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">หมายเหตุ</label>
          <input type="text" id="ln-notes" class="form-control" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)">
        </div>
        <div class="form-group">
          <label class="form-label required">รูปหลักฐาน (บังคับ)</label>
          <label class="photo-upload-btn btn btn-outline" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            📎 เลือกรูป
            <input type="file" id="ln-photos" accept="image/*" multiple style="display:none" onchange="previewLnPhotos()">
          </label>
          <div id="ln-photo-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
        </div>
        <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="submitLineNotify()">
          📣 แจ้งลงกลุ่มไลน์
        </button>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">ประวัติการแจ้ง</span></div>
      <div class="card-body" id="ln-history-body">
        <div style="text-align:center;padding:20px;color:#888">กำลังโหลด...</div>
      </div>
    </div>`;
  renderLnWeekRoundOptions('');
  await loadLineNotifyHistory();
}

function selectLnType(btn, type) {
  document.querySelectorAll('#ln-type-selector .type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ln-type').value = type;
  renderLnWeekRoundOptions(type);
}

function renderLnWeekRoundOptions(type) {
  const sel = document.getElementById('ln-week-round');
  if (!sel) return;
  const labels = type === 'อัดจารบี' ? WEEK_LABELS_GREASE : WEEK_LABELS_FILTER;
  sel.innerHTML = '<option value="">-- เลือก Week/รอบ --</option>' +
    labels.map(wr => `<option value="${wr}">${wr}</option>`).join('');
}

function previewLnPhotos() {
  const files = document.getElementById('ln-photos').files;
  const preview = document.getElementById('ln-photo-preview');
  preview.innerHTML = '';
  Array.from(files).forEach(f => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.style.cssText = 'width:72px;height:72px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0';
    preview.appendChild(img);
  });
}

async function submitLineNotify() {
  const type      = document.getElementById('ln-type').value;
  const weekRound = document.getElementById('ln-week-round').value;
  const notes     = document.getElementById('ln-notes').value.trim();
  const photoFiles= document.getElementById('ln-photos').files;

  if (!type)  return showToast('กรุณาเลือกหัวข้องาน', 'error');
  if (!weekRound) return showToast('กรุณาเลือก Week/รอบ', 'error');
  if (!photoFiles.length) return showToast('กรุณาแนบรูปหลักฐาน', 'error');

  showLoading(true);
  try {
    const filesData = await filesToBase64(photoFiles);
    const data = { type, week_label: weekRound, notes };
    const r = await callGAS('createLineNotification', S.token, data, filesData);
    if (r.success) {
      showToast(`แจ้งเรียบร้อย — อัปเดต ${r.updatedCount || 0} คัน`, 'success');
      document.getElementById('ln-type').value = '';
      document.querySelectorAll('#ln-type-selector .type-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('ln-week-round').value = '';
      document.getElementById('ln-notes').value     = '';
      document.getElementById('ln-photos').value    = '';
      document.getElementById('ln-photo-preview').innerHTML = '';
      await loadLineNotifyHistory();
    } else {
      showToast(r.error || 'เกิดข้อผิดพลาด', 'error');
    }
  } catch(e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadLineNotifyHistory() {
  const body = document.getElementById('ln-history-body');
  if (!body) return;
  const r = await callGAS('getLineNotifications', S.token);
  if (!r.success || !r.data || !r.data.length) {
    body.innerHTML = '<div style="text-align:center;padding:20px;color:#888">ยังไม่มีประวัติการแจ้ง</div>';
    return;
  }
  const rows = r.data.map(n => {
    const photos = safePhotoUrls(n.photoUrls || n.photo_urls);
    return `<tr>
      <td style="white-space:nowrap">${fmtDT(n.createdAt || n.created_at)}</td>
      <td>${n.type || '-'}</td>
      <td>${n.weekLabel || n.week_label || '-'}</td>
      <td>${n.notes || '-'}</td>
      <td>${photoPreviewButton(photos)}</td>
      <td>${n.createdBy || n.created_by || '-'}</td>
    </tr>`;
  }).join('');
  body.innerHTML = `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>วันที่</th><th>หัวข้อ</th><th>Week/รอบ</th><th>หมายเหตุ</th><th>รูป</th><th>แจ้งโดย</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── หน้า ติดตามสถานะ ─────────────────────────────────────────────────────────

async function renderTrackStatus(container) {
  container.innerHTML = `
    <div class="page-header">
      <h2 class="page-title-h2">🔍 ติดตามสถานะ</h2>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-body" style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;min-width:130px">
          <label class="form-label">หัวข้องาน</label>
          <select id="ts-type" class="form-control" onchange="renderTsWeekRoundOptions()">
            <option value="">ทั้งหมด</option>
            <option>เป่ากรอง</option><option>เดรนน้ำ</option><option>อัดจารบี</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:150px">
          <label class="form-label">Week/รอบ</label>
          <select id="ts-week-round" class="form-control">
            <option value="">ทั้งหมด</option>
          </select>
        </div>
        <div class="form-group" style="margin:0;min-width:130px">
          <label class="form-label">สถานะ</label>
          <select id="ts-status" class="form-control">
            <option value="">ทั้งหมด</option>
            <option value="ยังไม่ได้ทำ">ยังไม่ได้ทำ</option>
            <option value="โทรแจ้งแล้วรับทราบ">โทรแจ้งแล้วรับทราบ</option>
            <option value="ทำแล้ว">ทำแล้ว</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="loadTrackStatus()">🔍 ค้นหา</button>
        <button class="btn btn-outline" onclick="openBulkUpdateStatusModal()">อัปเดตทั้งหมด</button>
      </div>
    </div>
    <div id="ts-result">
      <div style="text-align:center;padding:20px;color:#888">กรองแล้วกด ค้นหา</div>
    </div>`;
  renderTsWeekRoundOptions();
  await loadTrackStatus();
}

function renderTsWeekRoundOptions() {
  const sel = document.getElementById('ts-week-round');
  if (!sel) return;
  const type = document.getElementById('ts-type')?.value || '';
  const labels = type === 'อัดจารบี'
    ? WEEK_LABELS_GREASE
    : type
    ? WEEK_LABELS_FILTER
    : WEEK_LABELS_FILTER.concat(WEEK_LABELS_GREASE);
  sel.innerHTML = '<option value="">ทั้งหมด</option>' +
    labels.map(wr => `<option value="${wr}">${wr}</option>`).join('');
}

async function loadTrackStatus() {
  const result = document.getElementById('ts-result');
  if (!result) return;
  result.innerHTML = '<div style="text-align:center;padding:20px;color:#888">กำลังโหลด...</div>';

  const filters = {
    type:      document.getElementById('ts-type')?.value   || '',
    week_label: document.getElementById('ts-week-round')?.value || '',
    status:    document.getElementById('ts-status')?.value || ''
  };

  const res = await callGAS('getFollowupTrucks', S.token, filters);
  if (!res.success || !res.data || !res.data.length) {
    result.innerHTML = '<div style="text-align:center;padding:20px;color:#888">ไม่พบข้อมูล</div>';
    return;
  }

  const statusColor = {
    'ยังไม่ได้ทำ':        '#e53e3e',
    'โทรแจ้งแล้วรับทราบ': '#d69e2e',
    'ทำแล้ว':             '#38a169'
  };

  window._tsLogs = res.data;
  const rows = res.data.map((log, i) => {
    const sc = statusColor[log.status] || '#718096';
    const photos = safePhotoUrls(log.photoUrls || log.photo_urls);
    const locked = (log.status === 'ทำแล้ว' || log.status === 'ทำหลังเตือน') && !hasRole('manager');
    return `<tr>
      <td style="font-weight:600">${log.truckNumber || log.truck_number || '-'}</td>
      <td>${log.type || '-'}</td>
      <td>${log.weekLabel || log.week_label || '-'}</td>
      <td><span style="color:${sc};font-weight:600">${log.status || '-'}</span></td>
      <td>${photoPreviewButton(photos)}</td>
      <td style="white-space:nowrap">${fmtDT(log.updatedAt || log.updated_at || log.createdAt || log.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-outline" ${locked ? 'disabled title="รายการทำแล้ว แก้ไขได้เฉพาะ Manager/Admin"' : ''} onclick="openUpdateStatusModal(${i})">
          อัปเดต
        </button>
      </td>
    </tr>`;
  }).join('');

  result.innerHTML = `
    <div style="overflow-x:auto">
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
        <button class="btn btn-primary btn-sm" onclick="openBulkUpdateStatusModal()">อัปเดตทั้งหมด</button>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>รถ</th><th>หัวข้อ</th><th>Week/รอบ</th><th>สถานะ</th><th>รูป</th><th>อัปเดตล่าสุด</th><th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:8px;font-size:12px;color:#888">พบ ${res.data.length} รายการ</div>`;
}

function openUpdateStatusModal(idx) {
  const log = window._tsLogs && window._tsLogs[idx];
  if (!log) return;
  const logId = log.id;
  const truckNumber = log.truckNumber || log.truck_number || '-';
  const type = log.type || '-';
  const weekLabel = log.weekLabel || log.week_label || '-';
  const currentStatus = log.status || '';
  openModal(`
      <div class="modal-header">
        <span class="modal-title">อัปเดตสถานะ — ${truckNumber}</span>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px;font-size:13px;color:#555">
          ${type} · ${weekLabel}
        </div>
        <div class="form-group">
          <label class="form-label required">สถานะใหม่</label>
          <select id="ts-new-status" class="form-control">
            <option value="ยังไม่ได้ทำ"   ${currentStatus==='ยังไม่ได้ทำ'   ?'selected':''}>ยังไม่ได้ทำ</option>
            <option value="โทรแจ้งแล้วรับทราบ" ${currentStatus==='โทรแจ้งแล้วรับทราบ'?'selected':''}>โทรแจ้งแล้วรับทราบ</option>
            <option value="ทำแล้ว"        ${currentStatus==='ทำแล้ว'        ?'selected':''}>ทำแล้ว</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">หมายเหตุ</label>
          <input type="text" id="ts-update-note" class="form-control" placeholder="หมายเหตุ (ถ้ามี)">
        </div>
        <div class="form-group">
          <label class="form-label">แนบรูป</label>
          <label class="btn btn-outline" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            📎 เลือกรูป
            <input type="file" id="ts-update-photos" accept="image/*" multiple style="display:none" onchange="previewTsPhotos()">
          </label>
          <div id="ts-photo-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
          <button class="btn btn-ghost" onclick="closeModal()">ยกเลิก</button>
          <button class="btn btn-primary" onclick="submitTrackUpdate('${logId}')">💾 บันทึก</button>
        </div>
      </div>
  `);
}

function previewTsPhotos() {
  const files = document.getElementById('ts-update-photos').files;
  const preview = document.getElementById('ts-photo-preview');
  preview.innerHTML = '';
  Array.from(files).forEach(f => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f);
    img.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0';
    preview.appendChild(img);
  });
}

async function submitTrackUpdate(logId) {
  const newStatus  = document.getElementById('ts-new-status').value;
  const note       = document.getElementById('ts-update-note').value.trim();
  const photoFiles = document.getElementById('ts-update-photos').files;

  showLoading(true);
  try {
    let photoUrls = [];
    if (photoFiles.length) {
      const filesData = await filesToBase64(photoFiles);
      const upRes = await callGAS('uploadPhotosToLog', S.token, logId, filesData, 'MaintenanceLogs');
      if (upRes.success) photoUrls = upRes.urls || [];
    }
    const r = await callGAS('updateMaintenanceStatus', S.token, logId, newStatus, note);
    if (r.success) {
      showToast('อัปเดตสถานะเรียบร้อย', 'success');
      closeModal();
      await loadTrackStatus();
    } else {
      showToast(r.error || 'เกิดข้อผิดพลาด', 'error');
    }
  } catch(e) {
    showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

function openBulkUpdateStatusModal() {
  const logs = (window._tsLogs || []).filter(log => {
    const done = log.status === 'ทำแล้ว' || log.status === 'ทำหลังเตือน';
    return !done || hasRole('manager');
  });
  if (!logs.length) {
    showToast('ไม่มีรายการที่อัปเดตได้', 'info');
    return;
  }
  openModal(`
    <div class="modal-header">
      <span class="modal-title">อัปเดตทั้งหมด (${logs.length} รายการ)</span>
      <button class="modal-close" onclick="closeModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="bulk-update-list">
        ${logs.map((log, i) => `
          <div class="bulk-update-row">
            <div class="bulk-update-meta">
              <strong>${log.truckNumber || log.truck_number || '-'}</strong>
              <span>${log.type || '-'} · ${log.weekLabel || log.week_label || '-'}</span>
            </div>
            <select class="form-control bulk-status" data-id="${log.id}">
              <option value="ยังไม่ได้ทำ" ${log.status==='ยังไม่ได้ทำ'?'selected':''}>ยังไม่ได้ทำ</option>
              <option value="โทรแจ้งแล้วรับทราบ" ${log.status==='โทรแจ้งแล้วรับทราบ'?'selected':''}>โทรแจ้งแล้วรับทราบ</option>
              <option value="ทำแล้ว" ${log.status==='ทำแล้ว'?'selected':''}>ทำแล้ว</option>
            </select>
            <input class="form-control bulk-note" data-id="${log.id}" placeholder="หมายเหตุ">
          </div>
        `).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">ยกเลิก</button>
      <button class="btn btn-primary" onclick="submitBulkTrackUpdate()">บันทึกทั้งหมด</button>
    </div>
  `, 'modal-xl');
}

async function submitBulkTrackUpdate() {
  const updates = Array.from(document.querySelectorAll('.bulk-status')).map(sel => {
    const id = sel.dataset.id;
    const note = document.querySelector(`.bulk-note[data-id="${id}"]`)?.value.trim() || '';
    return { id, status: sel.value, notes: note };
  });
  if (!updates.length) return;
  showLoading(true);
  const r = await callGAS('updateMaintenanceStatusesBulk', S.token, updates);
  showLoading(false);
  if (r.success) {
    showToast(`อัปเดต ${r.updatedCount || updates.length} รายการ`, 'success');
    closeModal();
    await loadTrackStatus();
    await loadNotifications();
  } else {
    const msg = r.errors?.length ? r.errors.map(e => e.error).join(', ') : r.error;
    showToast(msg || 'อัปเดตไม่สำเร็จ', 'error');
  }
}
