/* === Family Finance App === */
const S = {
  token: localStorage.getItem('token'),
  user: localStorage.getItem('user') || '猪猪',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  tab: 'dashboard',
  templates: [],
  summary: null,
  trends: null,
  records: null,
  charts: {},
  yearly: null,
};

const CAT = {
  cash: '现金', investment: '投资', physical: '实物资产',
  mortgage: '房贷', other_debt: '其他负债',
  income: '收入', expense: '支出'
};
const BAL_CATS = ['cash','investment','physical','mortgage','other_debt'];
const FLOW_CATS = ['income','expense'];
const COLORS = { teal:'#0F6E56', blue:'#185FA5', coral:'#993C1D', red:'#A32D2D', purple:'#534AB7', amber:'#854F0B' };

/* === API === */
const API = {
  async call(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${S.token}`, ...opts.headers }
    });
    if (res.status === 401) { location.href = 'index.html'; throw new Error('401'); }
    return res.json();
  },
  summary(y,m){ return this.call(`/api/summary/${y}/${m}`) },
  trends(y){ return this.call(`/api/trends/${y}`) },
  templates(){ return this.call('/api/templates') },
  records(y,m,u){ return this.call(`/api/records/${y}/${m}?user=${encodeURIComponent(u)}`) },
  saveRecords(y,m,u,r){ return this.call(`/api/records/${y}/${m}`,{method:'PUT',body:JSON.stringify({user:u,records:r})}) },
  addTemplate(s,c,n){ return this.call('/api/templates',{method:'POST',body:JSON.stringify({section:s,category:c,item_name:n})}) },
  delTemplate(id){ return this.call(`/api/templates/${id}`,{method:'DELETE'}) },
  yearly(y){ return this.call(`/api/yearly/${y}`) },
  changePwd(p){ return this.call('/api/password',{method:'POST',body:JSON.stringify({password:p})}) },
};

/* === Utils === */
function fmt(n) {
  if (n == null || n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e8) return (n/1e8).toFixed(2)+'亿';
  if (a >= 1e4) return (n/1e4).toFixed(2)+'万';
  return Math.round(n).toLocaleString();
}
function toWan(n){ return +(n/1e4).toFixed(1) }
function $(id){ return document.getElementById(id) }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000) }
function showModal(html){ $('modal-card').innerHTML=html; $('modal').classList.remove('hidden') }
function hideModal(){ $('modal').classList.add('hidden') }
$('modal-ov')?.addEventListener('click', hideModal);
function destroyChart(n){ if(S.charts[n]){S.charts[n].destroy();delete S.charts[n]} }

/* === Init === */
async function init() {
  if (!S.token) { location.href='index.html'; return; }
  $('user-badge').textContent = S.user;
  $('logout-btn').onclick = () => { localStorage.clear(); location.href='index.html' };
  initTabs();
  initMonthSelector();
  S.templates = await API.templates();
  await loadMonthData();
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => switchTab(btn.dataset.tab);
  });
}

function switchTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'dashboard') renderDashboard();
  else if (tab === 'trend') renderTrend();
  else if (tab === 'input') renderInput();
  else if (tab === 'history') renderHistory();
  else if (tab === 'settings') renderSettings();
}

/* === Month Selector === */
function initMonthSelector() {
  $('month-btn').onclick = () => $('month-dd').classList.toggle('hidden');
  $('year-prev').onclick = () => { S.year--; updateMonthGrid() };
  $('year-next').onclick = () => { S.year++; updateMonthGrid() };
  $('today-btn').onclick = () => {
    const now = new Date();
    S.year = now.getFullYear();
    S.month = now.getMonth() + 1;
    updateMonthLabel();
    updateMonthGrid();
    $('month-dd').classList.add('hidden');
    loadMonthData();
  };
  updateMonthLabel();
  updateMonthGrid();
}
function updateMonthLabel() { $('month-label').textContent = `${S.year}年${S.month}月` }
function updateMonthGrid() {
  $('year-disp').textContent = S.year + '年';
  const grid = $('month-grid');
  grid.innerHTML = '';
  const hasData = S.trends ? S.trends.totalAssets.map((v,i) => v > 0) : new Array(12).fill(false);
  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement('button');
    btn.textContent = m + '月';
    if (m === S.month) btn.classList.add('active');
    if (hasData[m-1]) btn.classList.add('has-data');
    btn.onclick = () => {
      S.month = m;
      updateMonthLabel();
      $('month-dd').classList.add('hidden');
      loadMonthData();
    };
    grid.appendChild(btn);
  }
}
async function loadMonthData() {
  const c = $('content');
  c.innerHTML = '<div class="loading-spinner">加载中...</div>';
  try {
    const [sum, recs] = await Promise.all([
      API.summary(S.year, S.month),
      API.records(S.year, S.month, S.user)
    ]);
    S.summary = sum;
    S.records = recs;
    if (S.tab === 'dashboard') renderDashboard();
    else if (S.tab === 'input') renderInput();
  } catch(e) { c.innerHTML = '<div class="empty">加载失败</div>' }
}

/* === Dashboard === */
function renderDashboard() {
  const s = S.summary; if (!s) return;
  const c = $('content');
  let prev = null;
  if (S.trends && S.month > 1) {
    const idx = S.month - 1;
    prev = { netWorth: S.trends.netWorth[idx-1], totalAssets: S.trends.totalAssets[idx-1], totalLiab: S.trends.totalLiab[idx-1] };
  }
  const dNet = prev ? s.netWorth - prev.netWorth : null;
  c.innerHTML = `
    <div class="net-worth-card">
      <div class="label">家庭净资产</div>
      <div class="value">¥${fmt(s.netWorth)}</div>
      ${dNet !== null ? `<div class="delta">${dNet>=0?'▲ +':'▼ '}${fmt(Math.abs(dNet))} 较上月</div>` : ''}
    </div>
    <div class="sec-title">家庭资产</div>
    <div class="card">
      <div class="card-row"><span class="name">现金</span><span class="amt pos">${fmt(s.cash)}</span></div>
      <div class="card-row"><span class="name">投资</span><span class="amt pos">${fmt(s.investment)}</span></div>
      <div class="card-row"><span class="name">实物资产</span><span class="amt pos">${fmt(s.physical)}</span></div>
      <div class="card-row total"><span class="name">资产合计</span><span class="amt pos">${fmt(s.totalAssets)}</span></div>
    </div>
    <div class="sec-title">家庭负债</div>
    <div class="card">
      <div class="card-row"><span class="name">房贷</span><span class="amt neg">${fmt(s.mortgage)}</span></div>
      <div class="card-row"><span class="name">其他负债</span><span class="amt neg">${fmt(s.other_debt)}</span></div>
      <div class="card-row total"><span class="name">负债合计</span><span class="amt neg">${fmt(s.totalLiab)}</span></div>
    </div>
    <div class="sec-title">本月现金流</div>
    <div class="flow-grid">
      <div class="flow-item income"><div class="lbl">收入</div><div class="val">${fmt(s.income)}</div></div>
      <div class="flow-item expense"><div class="lbl">支出</div><div class="val">${fmt(s.expense)}</div></div>
      <div class="flow-item surplus"><div class="lbl">结余</div><div class="val">${fmt(s.surplus)}</div></div>
    </div>
  `;
}

/* === Trend === */
async function renderTrend() {
  const c = $('content');
  c.innerHTML = '<div class="loading-spinner">加载图表...</div>';
  try {
    if (!S.trends) S.trends = await API.trends(S.year);
    const t = S.trends;
    const s = S.summary;
    const mIdx = S.month - 1;
    const hasPrev = mIdx > 0;

    // Comparison data
    const cmpItems = [
      { name:'总资产', cur:s.totalAssets, prev: hasPrev?t.totalAssets[mIdx-1]:null, good:true },
      { name:'净资产', cur:s.netWorth, prev: hasPrev?t.netWorth[mIdx-1]:null, good:true },
      { name:'总负债', cur:s.totalLiab, prev: hasPrev?t.totalLiab[mIdx-1]:null, good:false },
      { name:'总支出', cur:s.expense, prev: hasPrev?t.totalExpense[mIdx-1]:null, good:false },
    ];

    let cmpHTML = '';
    cmpItems.forEach(item => {
      let delta = null, cls = 'flat', arrow = '—';
      if (item.prev != null && item.prev > 0) {
        delta = item.cur - item.prev;
        if (delta === 0) { cls='flat'; arrow='—' }
        else {
          const isUp = delta > 0;
          const isGood = item.good ? isUp : !isUp;
          cls = isGood ? 'up' : 'down';
          arrow = isUp ? '▲' : '▼';
        }
      }
      cmpHTML += `<div class="cmp-card">
        <div class="nm">${item.name}</div>
        <div class="vl">${fmt(item.cur)}</div>
        <div class="dl ${cls}">${delta!==null?`${arrow} ${delta>=0?'+':''}${fmt(Math.abs(delta))}`:'无上月数据'}</div>
      </div>`;
    });

    // Line chart data
    const labels = t.months.map(m => m+'月');
    const lineDatasets = [
      { label:'总资产', data:t.totalAssets.map(toWan), color:COLORS.teal, dash:[] },
      { label:'总负债', data:t.totalLiab.map(toWan), color:COLORS.coral, dash:[] },
      { label:'净资产', data:t.netWorth.map(toWan), color:COLORS.purple, dash:[], width:3 },
      { label:'总支出', data:t.totalExpense.map(toWan), color:COLORS.red, dash:[5,3] },
    ];

    // Pie data
    const assetData = [
      { name:'现金', val:s.cash, color:COLORS.teal },
      { name:'投资', val:s.investment, color:COLORS.blue },
      { name:'实物资产', val:s.physical, color:COLORS.amber },
    ].filter(x => x.val > 0);
    const liabData = [
      { name:'房贷', val:s.mortgage, color:COLORS.coral },
      { name:'其他负债', val:s.other_debt, color:COLORS.red },
    ].filter(x => x.val > 0);

    c.innerHTML = `
      <div class="chart-box">
        <h3>月度趋势</h3>
        <div class="chart-legend" id="line-legend"></div>
        <div style="position:relative;width:100%;height:240px">
          <canvas id="trend-line" role="img" aria-label="月度趋势折线图">月度趋势折线图</canvas>
        </div>
      </div>
      <div class="sec-title">环比上月</div>
      <div class="cmp-grid">${cmpHTML}</div>
      <div class="sec-title" style="margin-top:20px">资产负债结构</div>
      <div class="chart-box">
        <h4 class="pie-title">资产构成</h4>
        <div style="position:relative;width:100%;max-width:260px;margin:0 auto;height:220px">
          <canvas id="asset-pie" role="img" aria-label="资产结构饼图">资产结构饼图</canvas>
        </div>
        <div id="asset-pie-leg" class="pie-leg-list"></div>
      </div>
      <div class="chart-box" style="margin-top:0">
        <h4 class="pie-title">负债构成</h4>
        <div style="position:relative;width:100%;max-width:260px;margin:0 auto;height:220px">
          <canvas id="liab-pie" role="img" aria-label="负债结构饼图">负债结构饼图</canvas>
        </div>
        <div id="liab-pie-leg" class="pie-leg-list"></div>
      </div>
    `;

    // Line chart
    destroyChart('line'); destroyChart('aPie'); destroyChart('lPie');
    const lc = new Chart($('trend-line'), {
      type:'line',
      data:{ labels, datasets: lineDatasets.map(d => ({
        label:d.label, data:d.data, borderColor:d.color, backgroundColor:d.color+'10',
        borderWidth:d.width||2, borderDash:d.dash, pointRadius:2.5, pointHoverRadius:5,
        tension:0.3, fill:false
      }))},
      options:{ responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.parsed.y+'万'}} },
        scales:{
          y:{ticks:{font:{size:10},callback:v=>v+'万'},grid:{color:'rgba(0,0,0,.04)'}},
          x:{ticks:{font:{size:10}},grid:{display:false}}
        }
      }
    });
    S.charts.line = lc;

    // Line legend
    const leg = $('line-legend');
    lineDatasets.forEach((d,i) => {
      const tag = document.createElement('span');
      tag.className = 'legend-tag' + (d.dash.length ? ' dashed' : '');
      tag.style.color = d.color;
      tag.innerHTML = `<span class="dot" style="background:${d.color}"></span>${d.label}`;
      tag.onclick = () => {
        const meta = lc.getDatasetMeta(i);
        meta.hidden = !meta.hidden; lc.update();
        tag.style.opacity = meta.hidden ? '0.3' : '1';
      };
      leg.appendChild(tag);
    });

    // Asset pie
    if (assetData.length > 0) {
      S.charts.aPie = new Chart($('asset-pie'), {
        type:'doughnut',
        data:{ labels:assetData.map(x=>x.name), datasets:[{data:assetData.map(x=>toWan(x.val)),backgroundColor:assetData.map(x=>x.color),borderWidth:2,borderColor:'#fff'}] },
        options:{ responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.label+': '+c.parsed+'万'}}} }
      });
      const leg2 = $('asset-pie-leg');
      assetData.forEach(x => {
        leg2.innerHTML += `<div class="pie-legend-item"><span class="sq" style="background:${x.color}"></span>${x.name} ${fmt(x.val)}</div>`;
      });
    } else {
      $('asset-pie-leg').innerHTML = '<div style="text-align:center;color:#b4b2a9;font-size:12px">暂无数据</div>';
    }

    // Liability pie
    if (liabData.length > 0) {
      S.charts.lPie = new Chart($('liab-pie'), {
        type:'doughnut',
        data:{ labels:liabData.map(x=>x.name), datasets:[{data:liabData.map(x=>toWan(x.val)),backgroundColor:liabData.map(x=>x.color),borderWidth:2,borderColor:'#fff'}] },
        options:{ responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.label+': '+c.parsed+'万'}}} }
      });
      const leg3 = $('liab-pie-leg');
      liabData.forEach(x => {
        leg3.innerHTML += `<div class="pie-legend-item"><span class="sq" style="background:${x.color}"></span>${x.name} ${fmt(x.val)}</div>`;
      });
    } else {
      $('liab-pie-leg').innerHTML = '<div style="text-align:center;color:#b4b2a9;font-size:12px">暂无数据</div>';
    }

  } catch(e) { c.innerHTML = '<div class="empty">加载失败</div>' }
}

/* === Input === */
async function renderInput() {
  const c = $('content');
  c.innerHTML = '<div class="loading-spinner">加载...</div>';
  try {
    if (!S.records) S.records = await API.records(S.year, S.month, S.user);
    const recs = {};
    (S.records || []).forEach(r => { recs[r.section+'|'+r.category+'|'+r.item_name] = r.amount });

    const balTpls = S.templates.filter(t => t.section === 'balance');
    const flowTpls = S.templates.filter(t => t.section === 'cashflow');

    let html = `<div style="font-size:13px;color:#888780;text-align:center;margin-bottom:16px">
      正在录入：<strong style="color:#185FA5">${S.user}</strong> · ${S.year}年${S.month}月</div>`;

    // Balance section
    html += '<div class="input-section"><h3>资产负债表</h3>';
    BAL_CATS.forEach(cat => {
      const items = balTpls.filter(t => t.category === cat);
      if (items.length === 0) return;
      let rows = '';
      let total = 0;
      items.forEach(t => {
        const key = 'balance|'+cat+'|'+t.item_name;
        const val = recs[key] || 0;
        total += val;
        rows += `<div class="input-row" data-id="${t.id}" data-sec="balance" data-cat="${cat}" data-name="${t.item_name}">
          <span class="item-name">${t.item_name}</span>
          <input type="number" class="amt-input" value="${val}" data-key="${key}" placeholder="0">
          <span class="del-btn" onclick="delItem(${t.id},'${t.item_name}')">×</span>
        </div>`;
      });
      html += `<div class="input-card">
        <div class="cat-header"><span>${CAT[cat]}</span><span class="cat-total">${fmt(total)}</span></div>
        ${rows}
        <div class="add-item" onclick="addItem('balance','${cat}')">+ 添加项目</div>
      </div>`;
    });
    html += '</div>';

    // Cash flow section
    html += '<div class="input-section"><h3>月度收支</h3>';
    FLOW_CATS.forEach(cat => {
      const items = flowTpls.filter(t => t.category === cat);
      if (items.length === 0) return;
      let rows = '';
      let total = 0;
      items.forEach(t => {
        const key = 'cashflow|'+cat+'|'+t.item_name;
        const val = recs[key] || 0;
        total += val;
        rows += `<div class="input-row" data-id="${t.id}" data-sec="cashflow" data-cat="${cat}" data-name="${t.item_name}">
          <span class="item-name">${t.item_name}</span>
          <input type="number" class="amt-input" value="${val}" data-key="${key}" placeholder="0">
          <span class="del-btn" onclick="delItem(${t.id},'${t.item_name}')">×</span>
        </div>`;
      });
      html += `<div class="input-card">
        <div class="cat-header"><span>${CAT[cat]}</span><span class="cat-total">${fmt(total)}</span></div>
        ${rows}
        <div class="add-item" onclick="addItem('cashflow','${cat}')">+ 添加项目</div>
      </div>`;
    });
    html += '</div>';

    html += `<div class="save-bar"><button onclick="saveInput()">保存</button></div>`;
    c.innerHTML = html;

    // Update totals on input
    c.querySelectorAll('.input-card').forEach(card => {
      card.querySelectorAll('.amt-input').forEach(inp => {
        inp.addEventListener('input', () => {
          let total = 0;
          card.querySelectorAll('.amt-input').forEach(i => { total += parseFloat(i.value) || 0 });
          card.querySelector('.cat-total').textContent = fmt(total);
        });
      });
    });
  } catch(e) { c.innerHTML = '<div class="empty">加载失败</div>' }
}

window.addItem = async function(section, category) {
  showModal(`
    <h3>添加项目</h3>
    <p style="font-size:13px;color:#888780;margin-bottom:12px">在「${CAT[category]}」下添加新项目</p>
    <input type="text" id="new-item-name" placeholder="项目名称" autocomplete="off">
    <div class="btns">
      <button class="cancel" onclick="hideModal()">取消</button>
      <button class="ok" id="add-ok">添加</button>
    </div>
  `);
  const inp = $('new-item-name');
  inp.focus();
  $('add-ok').onclick = async () => {
    const name = inp.value.trim();
    if (!name) { toast('请输入名称'); return }
    await API.addTemplate(section, category, name);
    S.templates = await API.templates();
    hideModal();
    toast('已添加');
    renderInput();
  };
  inp.onkeydown = (e) => { if (e.key === 'Enter') $('add-ok').click() };
};

window.delItem = async function(id, name) {
  showModal(`
    <h3>删除项目</h3>
    <p style="font-size:14px;margin-bottom:16px">确认删除「${name}」？此项目的所有历史记录也将删除。</p>
    <div class="btns">
      <button class="cancel" onclick="hideModal()">取消</button>
      <button class="ok" id="del-ok" style="background:#791f1f">删除</button>
    </div>
  `);
  $('del-ok').onclick = async () => {
    await API.delTemplate(id);
    S.templates = await API.templates();
    hideModal();
    toast('已删除');
    renderInput();
  };
};

window.saveInput = async function() {
  const rows = document.querySelectorAll('#content .input-row');
  const records = [];
  rows.forEach(row => {
    const section = row.dataset.sec;
    const category = row.dataset.cat;
    const itemName = row.dataset.name;
    const input = row.querySelector('.amt-input');
    const amount = parseFloat(input.value) || 0;
    records.push({ section, category, item_name: itemName, amount });
  });
  try {
    await API.saveRecords(S.year, S.month, S.user, records);
    S.records = await API.records(S.year, S.month, S.user);
    S.summary = await API.summary(S.year, S.month);
    S.trends = await API.trends(S.year);
    toast('保存成功');
  } catch(e) { toast('保存失败') }
};

/* === History === */
async function renderHistory() {
  const c = $('content');
  c.innerHTML = '<div class="loading-spinner">加载...</div>';
  try {
    if (!S.trends) S.trends = await API.trends(S.year);
    const t = S.trends;
    let html = `<div style="font-size:13px;color:#888780;text-align:center;margin-bottom:16px">${S.year}年月度记录</div>`;
    html += '<div class="hist-list">';
    let hasAny = false;
    for (let m = 12; m >= 1; m--) {
      const idx = m - 1;
      if (t.totalAssets[idx] === 0 && t.totalLiab[idx] === 0) continue;
      hasAny = true;
      const net = t.netWorth[idx];
      const cls = net >= 0 ? 'pos' : 'neg';
      html += `<div class="hist-item" onclick="S.month=${m};updateMonthLabel();switchTab('dashboard')">
        <span class="hm">${m}月</span>
        <span class="hv">净资产 <span class="${cls}">¥${fmt(net)}</span> · 收入 ¥${fmt(t.totalIncome[idx])} · 支出 ¥${fmt(t.totalExpense[idx])}</span>
      </div>`;
    }
    html += '</div>';
    if (!hasAny) html += '<div class="empty">暂无历史记录</div>';

    // Yearly summary
    if (hasAny) {
      S.yearly = await API.yearly(S.year);
      const y = S.yearly;
      html += `
        <div class="sec-title">年度总结</div>
        <div class="yearly-card">
          <h3>${S.year}年财务概览</h3>
          <div class="yearly-grid">
            <div class="yearly-cell"><div class="yl">年初净资产</div><div class="yv" style="color:${COLORS.purple}">¥${fmt(y.beginning.netWorth)}</div></div>
            <div class="yearly-cell"><div class="yl">年末净资产</div><div class="yv" style="color:${COLORS.purple}">¥${fmt(y.ending.netWorth)}</div></div>
            <div class="yearly-cell"><div class="yl">净增长</div><div class="yv" style="color:${y.changes.netWorth>=0?COLORS.teal:COLORS.coral}">${y.changes.netWorth>=0?'+':''}¥${fmt(y.changes.netWorth)}</div></div>
          </div>
          <div class="yearly-grid">
            <div class="yearly-cell"><div class="yl">全年收入</div><div class="yv" style="color:${COLORS.teal}">¥${fmt(y.cashflow.income)}</div></div>
            <div class="yearly-cell"><div class="yl">全年支出</div><div class="yv" style="color:${COLORS.red}">¥${fmt(y.cashflow.expense)}</div></div>
            <div class="yearly-cell"><div class="yl">全年结余</div><div class="yv" style="color:${COLORS.purple}">¥${fmt(y.cashflow.surplus)}</div></div>
          </div>
        </div>
      `;
    }
    c.innerHTML = html;
  } catch(e) { c.innerHTML = '<div class="empty">加载失败</div>' }
}

/* === Settings === */
function renderSettings() {
  const c = $('content');
  c.innerHTML = `
    <div class="sec-title">数据导出</div>
    <div class="set-list">
      <div class="set-item">
        <span class="sl">导出当月Excel</span>
        <button class="primary" onclick="exportExcel('month')">导出</button>
      </div>
      <div class="set-item">
        <span class="sl">导出全年Excel</span>
        <button onclick="exportExcel('year')">导出</button>
      </div>
    </div>
    <div class="sec-title">账户</div>
    <div class="set-list">
      <div class="set-item">
        <span class="sl">当前身份</span>
        <span class="sr">${S.user}</span>
      </div>
      <div class="set-item">
        <span class="sl">修改密码</span>
        <button onclick="changePwd()">修改</button>
      </div>
      <div class="set-item">
        <span class="sl">退出登录</span>
        <button class="danger" onclick="localStorage.clear();location.href='index.html'">退出</button>
      </div>
    </div>
    <div class="sec-title">项目管理</div>
    <div class="set-list">
      ${S.templates.map(t => `
        <div class="set-item">
          <span class="sl">${CAT[t.category] || t.category} · ${t.item_name}</span>
          <button class="danger" onclick="delItem(${t.id},'${t.item_name}')">删除</button>
        </div>
      `).join('')}
    </div>
  `;
}

window.changePwd = function() {
  showModal(`
    <h3>修改密码</h3>
    <input type="password" id="new-pwd" placeholder="新密码（至少4位）" autocomplete="off">
    <div class="btns">
      <button class="cancel" onclick="hideModal()">取消</button>
      <button class="ok" id="pwd-ok">确认</button>
    </div>
  `);
  $('new-pwd').focus();
  $('pwd-ok').onclick = async () => {
    const pwd = $('new-pwd').value;
    if (!pwd || pwd.length < 4) { toast('密码至少4位'); return }
    await API.changePwd(pwd);
    hideModal();
    toast('密码已修改');
  };
};

window.exportExcel = async function(type) {
  toast('正在生成...');
  try {
    if (type === 'month') {
      const [allRecs] = await Promise.all([API.records(S.year, S.month, '')]);
      const wb = XLSX.utils.book_new();
      ['猪猪','嘟嘟'].forEach(user => {
        const userRecs = allRecs.filter(r => r.user_name === user);
        wb.Sheets[user] = buildSheet(userRecs, S.templates);
        wb.SheetNames.push(user);
      });
      const sum = S.summary;
      wb.Sheets['家庭汇总'] = buildSummarySheet(sum);
      wb.SheetNames.push('家庭汇总');
      XLSX.writeFile(wb, `家庭财务_${S.year}年${S.month}月.xlsx`);
    } else {
      if (!S.trends) S.trends = await API.trends(S.year);
      const t = S.trends;
      const data = [['月份','总资产','总负债','净资产','总收入','总支出','结余']];
      for (let m = 1; m <= 12; m++) {
        const i = m - 1;
        data.push([m+'月', t.totalAssets[i], t.totalLiab[i], t.netWorth[i], t.totalIncome[i], t.totalExpense[i], t.totalIncome[i]-t.totalExpense[i]]);
      }
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      wb.Sheets['年度汇总'] = ws; wb.SheetNames = ['年度汇总'];
      XLSX.writeFile(wb, `家庭财务_${S.year}年全年.xlsx`);
    }
    toast('导出成功');
  } catch(e) { toast('导出失败') }
};

function buildSheet(recs, templates) {
  const map = {};
  recs.forEach(r => { map[r.section+'|'+r.category+'|'+r.item_name] = r.amount });
  const rows = [['家庭资产负债表','',''],['分类','项目','金额']];
  let totalAssets = 0;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0;
    items.forEach(t => {
      const val = map['balance|'+cat+'|'+t.item_name] || 0;
      subTotal += val;
      rows.push([CAT[cat], t.item_name, val]);
    });
    rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat !== 'mortgage' && cat !== 'other_debt') totalAssets += subTotal;
  });
  const totalLiab = (map['balance|mortgage|房贷']||0) + Object.keys(map).filter(k=>k.startsWith('balance|other_debt|')).reduce((s,k)=>s+map[k],0);
  rows.push(['','资产合计', totalAssets]);
  rows.push(['','负债合计', totalLiab]);
  rows.push(['','净资产', totalAssets - totalLiab]);
  rows.push([]);
  rows.push(['月度收支明细','','']);
  rows.push(['分类','项目','金额']);
  let totalIncome = 0, totalExpense = 0;
  FLOW_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'cashflow' && t.category === cat);
    let subTotal = 0;
    items.forEach(t => {
      const val = map['cashflow|'+cat+'|'+t.item_name] || 0;
      subTotal += val;
      rows.push([CAT[cat], t.item_name, val]);
    });
    rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat === 'income') totalIncome = subTotal; else totalExpense = subTotal;
  });
  rows.push(['','本月结余', totalIncome - totalExpense]);
  if (totalIncome > 0) rows.push(['','储蓄率', Math.round((totalIncome-totalExpense)/totalIncome*100)+'%']);
  return XLSX.utils.aoa_to_sheet(rows);
}

function buildSummarySheet(s) {
  const rows = [
    ['家庭财务汇总','',''],
    ['项目','金额'],
    ['现金', s.cash], ['投资', s.investment], ['实物资产', s.physical],
    ['资产合计', s.totalAssets],
    ['房贷', s.mortgage], ['其他负债', s.other_debt],
    ['负债合计', s.totalLiab],
    ['净资产', s.netWorth],
    [],
    ['收入', s.income], ['支出', s.expense], ['结余', s.surplus]
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

/* === Start === */
init();
