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
  yearlyCf: null,
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
  yearlyCashflow(y){ return this.call(`/api/yearly-cashflow/${y}`) },
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
  $('year-prev').onclick = () => { changeYear(S.year - 1) };
  $('year-next').onclick = () => { changeYear(S.year + 1) };
  $('today-btn').onclick = () => {
    const now = new Date();
    S.year = now.getFullYear();
    S.month = now.getMonth() + 1;
    S.trends = null; S.yearly = null; S.yearlyCf = null;
    updateMonthLabel();
    updateMonthGrid();
    $('month-dd').classList.add('hidden');
    loadMonthData();
  };
  updateMonthLabel();
  updateMonthGrid();
}
function changeYear(y) {
  S.year = y;
  S.trends = null; S.yearly = null; S.yearlyCf = null;
  updateMonthLabel();
  updateMonthGrid();
  // 异步拉新一年的趋势数据, 更新月份点的"有数据"标记
  API.trends(y).then(data => { S.trends = data; updateMonthGrid(); }).catch(()=>{});
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
  const tabAtStart = S.tab;
  const monthAtStart = S.month;
  c.innerHTML = '<div class="loading-spinner">加载中...</div>';
  try {
    const [sum, recs] = await Promise.all([
      API.summary(S.year, S.month),
      API.records(S.year, S.month, S.user)
    ]);
    // 守卫: 用户已切换 Tab 或月份就不渲染 (避免异步结果污染其他页面)
    if (S.tab !== tabAtStart || S.month !== monthAtStart) return;
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
  const tabAtStart = S.tab;
  c.innerHTML = '<div class="loading-spinner">加载图表...</div>';
  try {
    if (!S.trends || S.trends.year !== S.year) S.trends = await API.trends(S.year);
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

    // 守卫: 用户已切换 Tab 就不继续绘制图表 (避免图表实例覆盖其他页面)
    if (S.tab !== tabAtStart) return;

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
  const tabAtStart = S.tab;
  c.innerHTML = '<div class="loading-spinner">加载...</div>';
  try {
    if (!S.records || S.records.length === 0) S.records = await API.records(S.year, S.month, S.user);
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
    // 守卫: 用户已切换 Tab 就不渲染 (避免表单覆盖其他页面)
    if (S.tab !== tabAtStart) return;
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
  const tabAtStart = S.tab;
  const yearAtStart = S.year;
  c.innerHTML = '<div class="loading-spinner">加载...</div>';
  try {
    // 并行加载所需数据 (性能优化)
    const fetchTrends = (!S.trends || S.trends.year !== S.year);
    const fetchYearly = (!S.yearly || S.yearly.year !== S.year);
    const fetchYearlyCf = (!S.yearlyCf || S.yearlyCf.year !== S.year);
    const [t, allRecs, y, cf] = await Promise.all([
      fetchTrends ? API.trends(S.year) : Promise.resolve(S.trends),
      API.records(S.year, S.month, ''),
      fetchYearly ? API.yearly(S.year) : Promise.resolve(S.yearly),
      fetchYearlyCf ? API.yearlyCashflow(S.year) : Promise.resolve(S.yearlyCf)
    ]);

    // 守卫: 用户已切换 Tab 或年份就不渲染
    if (S.tab !== tabAtStart || S.year !== yearAtStart) return;

    S.trends = t;
    S.yearly = y;
    S.yearlyCf = cf;

    let html = '';

    // === 月度记录列表 ===
    html += `<div class="sec-title">${S.year}年月度记录</div>`;
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
    if (!hasAny) html += '<div class="empty">暂无历史记录，先去录入页填点数据吧</div>';

    // === 月度家庭明细 (新增) ===
    html += `<div class="sec-title">${S.month}月 · 家庭明细（两人合计）</div>`;
    html += buildFamilyMonthDetail(allRecs, S.templates);

    // === 年度财务总结 ===
    const ch = y.changes;
    const fmtCh = (v) => {
      const sign = v >= 0 ? '+' : '';
      const color = v >= 0 ? COLORS.teal : COLORS.red;
      return `<span style="color:${color}">${sign}¥${fmt(v)}</span>`;
    };
    const sumLiabBeginning = y.beginning.mortgage + y.beginning.other_debt;
    const sumLiabEnding = y.ending.mortgage + y.ending.other_debt;

    html += `<div class="sec-title">${S.year}年 · 年度财务总结</div>`;
    html += `
      <div class="yearly-table">
        <div class="yt-head"><div class="yt-c">项目</div><div class="yt-c">年初</div><div class="yt-c">年末</div><div class="yt-c">变化</div></div>
        <div class="yt-row"><div class="yt-c">现金</div><div class="yt-c">¥${fmt(y.beginning.cash)}</div><div class="yt-c">¥${fmt(y.ending.cash)}</div><div class="yt-c">${fmtCh(ch.cash)}</div></div>
        <div class="yt-row"><div class="yt-c">投资资产</div><div class="yt-c">¥${fmt(y.beginning.investment)}</div><div class="yt-c">¥${fmt(y.ending.investment)}</div><div class="yt-c">${fmtCh(ch.investment)}</div></div>
        <div class="yt-row"><div class="yt-c">实物资产</div><div class="yt-c">¥${fmt(y.beginning.physical)}</div><div class="yt-c">¥${fmt(y.ending.physical)}</div><div class="yt-c">${fmtCh(ch.physical)}</div></div>
        <div class="yt-row total"><div class="yt-c">总资产</div><div class="yt-c">¥${fmt(y.beginning.totalAssets)}</div><div class="yt-c">¥${fmt(y.ending.totalAssets)}</div><div class="yt-c">${fmtCh(ch.totalAssets)}</div></div>
        <div class="yt-row"><div class="yt-c">负债</div><div class="yt-c">¥${fmt(sumLiabBeginning)}</div><div class="yt-c">¥${fmt(sumLiabEnding)}</div><div class="yt-c">${fmtCh(-ch.totalLiab)}</div></div>
        <div class="yt-row total"><div class="yt-c">净资产</div><div class="yt-c">¥${fmt(y.beginning.netWorth)}</div><div class="yt-c">¥${fmt(y.ending.netWorth)}</div><div class="yt-c">${fmtCh(ch.netWorth)}</div></div>
      </div>
    `;

    // === 年度收入支出 ===
    const incomeItems = Object.entries(cf.income);
    const expenseItems = Object.entries(cf.expense);
    html += `<div class="sec-title">${S.year}年 · 年度收入支出</div>`;
    html += `<div class="yearly-table yt-2col">`;
    html += `<div class="yt-head"><div class="yt-c">项目</div><div class="yt-c">金额</div></div>`;
    if (incomeItems.length === 0 && expenseItems.length === 0) {
      html += `<div class="yt-row"><div class="yt-c" style="grid-column:1/-1;text-align:center;color:#888">暂无收入支出记录</div></div>`;
    } else {
      if (incomeItems.length > 0) {
        for (const [name, amt] of incomeItems) {
          html += `<div class="yt-row"><div class="yt-c">${name}</div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(amt)}</div></div>`;
        }
        html += `<div class="yt-row total"><div class="yt-c">全年收入</div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(cf.totalIncome)}</div></div>`;
      }
      if (expenseItems.length > 0) {
        for (const [name, amt] of expenseItems) {
          html += `<div class="yt-row"><div class="yt-c">${name}</div><div class="yt-c" style="color:${COLORS.red}">¥${fmt(amt)}</div></div>`;
        }
        html += `<div class="yt-row total"><div class="yt-c">全年支出</div><div class="yt-c" style="color:${COLORS.red}">¥${fmt(cf.totalExpense)}</div></div>`;
      }
      const surplusColor = cf.totalSurplus >= 0 ? COLORS.purple : COLORS.red;
      html += `<div class="yt-row total" style="background:#faf8f0"><div class="yt-c" style="font-weight:700">全年净结余</div><div class="yt-c" style="color:${surplusColor};font-weight:700">¥${fmt(cf.totalSurplus)}</div></div>`;
    }
    html += `</div>`;

    // === 年度家庭明细 (新增) - 12月资产负债快照 + 全年收支累计 ===
    // 12月记录 = 年末资产负债快照
    let decRecs;
    if (S.month === 12) {
      decRecs = allRecs; // 当前就是12月，复用
    } else {
      decRecs = await API.records(S.year, 12, '');
      // 再次守卫
      if (S.tab !== tabAtStart || S.year !== yearAtStart) return;
    }
    html += `<div class="sec-title">${S.year}年 · 全年家庭明细</div>`;
    html += buildFamilyYearDetail(decRecs, cf, S.templates);

    c.innerHTML = html;
  } catch(e) { console.error(e); c.innerHTML = '<div class="empty">加载失败</div>' }
}

/* === Family Detail Builders === */
// 给定某月所有记录（两人合计），生成家庭明细 HTML（资产负债 + 现金流两张表）
function buildFamilyMonthDetail(records, templates) {
  // 按 section/category/item_name 聚合
  const agg = {};
  (records || []).forEach(r => {
    if (!agg[r.section]) agg[r.section] = {};
    if (!agg[r.section][r.category]) agg[r.section][r.category] = {};
    if (!agg[r.section][r.category][r.item_name]) agg[r.section][r.category][r.item_name] = 0;
    agg[r.section][r.category][r.item_name] += Number(r.amount);
  });

  let html = '';

  // ===== 家庭资产负债表 =====
  html += '<div class="yearly-table yt-3col">';
  html += '<div class="yt-head"><div class="yt-c">分类</div><div class="yt-c">项目</div><div class="yt-c">金额</div></div>';
  let totalAssets = 0, totalLiab = 0, hasBal = false;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg.balance && agg.balance[cat] && agg.balance[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) {
        catHas = true; hasBal = true;
        html += `<div class="yt-row"><div class="yt-c">${CAT[cat]}</div><div class="yt-c">${t.item_name}</div><div class="yt-c">¥${fmt(val)}</div></div>`;
      }
    });
    if (catHas) {
      html += `<div class="yt-row total"><div class="yt-c">${CAT[cat]}小计</div><div class="yt-c"></div><div class="yt-c">¥${fmt(subTotal)}</div></div>`;
    }
    if (cat !== 'mortgage' && cat !== 'other_debt') totalAssets += subTotal;
    else totalLiab += subTotal;
  });
  if (hasBal) {
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.teal}">资产合计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(totalAssets)}</div></div>`;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.coral}">负债合计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.coral}">¥${fmt(totalLiab)}</div></div>`;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.purple}">净资产</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.purple}">¥${fmt(totalAssets - totalLiab)}</div></div>`;
  } else {
    html += '<div class="yt-row"><div class="yt-c" style="grid-column:1/-1;text-align:center;color:#b4b2a9">暂无资产负债数据</div></div>';
  }
  html += '</div>';

  // ===== 家庭现金流表 =====
  html += '<div class="yearly-table yt-3col" style="margin-top:14px">';
  html += '<div class="yt-head"><div class="yt-c">分类</div><div class="yt-c">项目</div><div class="yt-c">金额</div></div>';
  let totalIncome = 0, totalExpense = 0, hasFlow = false;
  FLOW_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'cashflow' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg.cashflow && agg.cashflow[cat] && agg.cashflow[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) {
        catHas = true; hasFlow = true;
        html += `<div class="yt-row"><div class="yt-c">${CAT[cat]}</div><div class="yt-c">${t.item_name}</div><div class="yt-c">¥${fmt(val)}</div></div>`;
      }
    });
    if (catHas) {
      html += `<div class="yt-row total"><div class="yt-c">${CAT[cat]}小计</div><div class="yt-c"></div><div class="yt-c">¥${fmt(subTotal)}</div></div>`;
    }
    if (cat === 'income') totalIncome = subTotal; else totalExpense = subTotal;
  });
  if (hasFlow) {
    const surplus = totalIncome - totalExpense;
    const sColor = surplus >= 0 ? COLORS.purple : COLORS.red;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${sColor}">本月结余</div><div class="yt-c"></div><div class="yt-c" style="color:${sColor}">¥${fmt(surplus)}</div></div>`;
    if (totalIncome > 0) {
      const rate = Math.round(surplus / totalIncome * 100);
      html += `<div class="yt-row"><div class="yt-c">储蓄率</div><div class="yt-c"></div><div class="yt-c">${rate}%</div></div>`;
    }
  } else {
    html += '<div class="yt-row"><div class="yt-c" style="grid-column:1/-1;text-align:center;color:#b4b2a9">暂无收支数据</div></div>';
  }
  html += '</div>';

  return html;
}

// 给定12月所有记录 + 全年收支累计，生成年度家庭明细 HTML
function buildFamilyYearDetail(decRecs, cf, templates) {
  // 聚合12月资产负债（年末快照）
  const agg = {};
  (decRecs || []).forEach(r => {
    if (r.section !== 'balance') return;
    if (!agg[r.category]) agg[r.category] = {};
    if (!agg[r.category][r.item_name]) agg[r.category][r.item_name] = 0;
    agg[r.category][r.item_name] += Number(r.amount);
  });

  let html = '';

  // ===== 年末资产负债快照 =====
  html += '<div class="yearly-table yt-3col">';
  html += '<div class="yt-head"><div class="yt-c">分类</div><div class="yt-c">项目</div><div class="yt-c">年末值</div></div>';
  let totalAssets = 0, totalLiab = 0, hasBal = false;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg[cat] && agg[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) {
        catHas = true; hasBal = true;
        html += `<div class="yt-row"><div class="yt-c">${CAT[cat]}</div><div class="yt-c">${t.item_name}</div><div class="yt-c">¥${fmt(val)}</div></div>`;
      }
    });
    if (catHas) {
      html += `<div class="yt-row total"><div class="yt-c">${CAT[cat]}小计</div><div class="yt-c"></div><div class="yt-c">¥${fmt(subTotal)}</div></div>`;
    }
    if (cat !== 'mortgage' && cat !== 'other_debt') totalAssets += subTotal;
    else totalLiab += subTotal;
  });
  if (hasBal) {
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.teal}">资产合计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(totalAssets)}</div></div>`;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.coral}">负债合计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.coral}">¥${fmt(totalLiab)}</div></div>`;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${COLORS.purple}">净资产</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.purple}">¥${fmt(totalAssets - totalLiab)}</div></div>`;
  } else {
    html += '<div class="yt-row"><div class="yt-c" style="grid-column:1/-1;text-align:center;color:#b4b2a9">12月暂无资产负债数据</div></div>';
  }
  html += '</div>';

  // ===== 全年收支累计 =====
  html += '<div class="yearly-table yt-3col" style="margin-top:14px">';
  html += '<div class="yt-head"><div class="yt-c">分类</div><div class="yt-c">项目</div><div class="yt-c">全年合计</div></div>';
  const incomeItems = Object.entries(cf.income);
  const expenseItems = Object.entries(cf.expense);
  if (incomeItems.length === 0 && expenseItems.length === 0) {
    html += '<div class="yt-row"><div class="yt-c" style="grid-column:1/-1;text-align:center;color:#b4b2a9">暂无收支数据</div></div>';
  } else {
    if (incomeItems.length > 0) {
      incomeItems.forEach(([name, amt]) => {
        html += `<div class="yt-row"><div class="yt-c">${CAT.income}</div><div class="yt-c">${name}</div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(amt)}</div></div>`;
      });
      html += `<div class="yt-row total"><div class="yt-c">${CAT.income}小计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.teal}">¥${fmt(cf.totalIncome)}</div></div>`;
    }
    if (expenseItems.length > 0) {
      expenseItems.forEach(([name, amt]) => {
        html += `<div class="yt-row"><div class="yt-c">${CAT.expense}</div><div class="yt-c">${name}</div><div class="yt-c" style="color:${COLORS.red}">¥${fmt(amt)}</div></div>`;
      });
      html += `<div class="yt-row total"><div class="yt-c">${CAT.expense}小计</div><div class="yt-c"></div><div class="yt-c" style="color:${COLORS.red}">¥${fmt(cf.totalExpense)}</div></div>`;
    }
    const surplus = cf.totalIncome - cf.totalExpense;
    const sColor = surplus >= 0 ? COLORS.purple : COLORS.red;
    html += `<div class="yt-row total"><div class="yt-c" style="color:${sColor}">全年结余</div><div class="yt-c"></div><div class="yt-c" style="color:${sColor}">¥${fmt(surplus)}</div></div>`;
    if (cf.totalIncome > 0) {
      const rate = Math.round(surplus / cf.totalIncome * 100);
      html += `<div class="yt-row"><div class="yt-c">储蓄率</div><div class="yt-c"></div><div class="yt-c">${rate}%</div></div>`;
    }
  }
  html += '</div>';

  return html;
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

/* === Excel Export === */
// 列宽辅助: ws['!cols'] 控制导出 Excel 的列宽
function setCols(ws, widths){ ws['!cols'] = widths.map(w => ({wch:w})); return ws }

window.exportExcel = async function(type) {
  toast('正在生成...');
  try {
    const wb = XLSX.utils.book_new();
    if (type === 'month') {
      // 当月导出: 猪猪 + 嘟嘟 + 家庭汇总 + 家庭明细 (4 sheets)
      const [allRecs, sum] = await Promise.all([
        API.records(S.year, S.month, ''),
        S.summary ? Promise.resolve(S.summary) : API.summary(S.year, S.month)
      ]);
      ['猪猪','嘟嘟'].forEach(user => {
        const userRecs = allRecs.filter(r => r.user_name === user);
        XLSX.utils.book_append_sheet(wb, buildSheet(userRecs, S.templates), user);
      });
      XLSX.utils.book_append_sheet(wb, buildSummarySheet(sum), '家庭汇总');
      XLSX.utils.book_append_sheet(wb, buildFamilyMonthDetailSheet(allRecs, S.templates), '家庭明细');
      XLSX.writeFile(wb, `家庭财务_${S.year}年${S.month}月.xlsx`);
    } else {
      // 全年导出: 年度财务总结 + 年度收入支出 + 年度家庭明细 + 月度趋势 (4 sheets)
      const t = (S.trends && S.trends.year === S.year) ? S.trends : await API.trends(S.year);
      const y = (S.yearly && S.yearly.year === S.year) ? S.yearly : await API.yearly(S.year);
      const cf = (S.yearlyCf && S.yearlyCf.year === S.year) ? S.yearlyCf : await API.yearlyCashflow(S.year);
      S.trends = t; S.yearly = y; S.yearlyCf = cf;
      // 12月记录作为年末资产负债快照
      const decRecs = await API.records(S.year, 12, '');
      XLSX.utils.book_append_sheet(wb, buildYearlySummarySheet(y), '年度财务总结');
      XLSX.utils.book_append_sheet(wb, buildYearlyCashflowSheet(cf), '年度收入支出');
      XLSX.utils.book_append_sheet(wb, buildFamilyYearDetailSheet(decRecs, cf, S.templates), '年度家庭明细');
      XLSX.utils.book_append_sheet(wb, buildTrendsSheet(t), '月度趋势');
      XLSX.writeFile(wb, `家庭财务_${S.year}年全年.xlsx`);
    }
    toast('导出成功');
  } catch(e) { console.error(e); toast('导出失败: ' + (e.message||'')) }
};

// 个人 sheet: 资产负债表 + 月度收支明细
function buildSheet(recs, templates) {
  const map = {};
  recs.forEach(r => { map[r.section+'|'+r.category+'|'+r.item_name] = r.amount });
  const rows = [['家庭资产负债表','',''],['分类','项目','金额']];
  let totalAssets = 0, totalLiab = 0;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0;
    items.forEach(t => {
      const val = map['balance|'+cat+'|'+t.item_name] || 0;
      subTotal += val;
      rows.push([CAT[cat], t.item_name, val]);
    });
    rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat === 'mortgage' || cat === 'other_debt') totalLiab += subTotal;
    else totalAssets += subTotal;
  });
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
  return setCols(XLSX.utils.aoa_to_sheet(rows), [14, 20, 14]);
}

// 家庭汇总 sheet: 资产/负债/净资产 + 收入/支出/结余 + 储蓄率
function buildSummarySheet(s) {
  const rows = [
    [`家庭财务汇总 (${S.year}年${S.month}月)`, '', ''],
    ['项目', '金额', ''],
    ['现金', s.cash, ''],
    ['投资', s.investment, ''],
    ['实物资产', s.physical, ''],
    ['资产合计', s.totalAssets, ''],
    ['房贷', s.mortgage, ''],
    ['其他负债', s.other_debt, ''],
    ['负债合计', s.totalLiab, ''],
    ['净资产', s.netWorth, ''],
    [],
    ['收入', s.income, ''],
    ['支出', s.expense, ''],
    ['结余', s.surplus, '']
  ];
  if (s.income > 0) rows.push(['储蓄率', Math.round(s.surplus/s.income*100)+'%', '']);
  return setCols(XLSX.utils.aoa_to_sheet(rows), [16, 14, 10]);
}

// 家庭明细 sheet (当月两人合计): 资产负债明细 + 现金流明细
function buildFamilyMonthDetailSheet(records, templates) {
  const agg = {};
  (records || []).forEach(r => {
    if (!agg[r.section]) agg[r.section] = {};
    if (!agg[r.section][r.category]) agg[r.section][r.category] = {};
    if (!agg[r.section][r.category][r.item_name]) agg[r.section][r.category][r.item_name] = 0;
    agg[r.section][r.category][r.item_name] += Number(r.amount);
  });
  const rows = [
    [`家庭资产负债明细 (两人合计 ${S.year}年${S.month}月)`, '', ''],
    ['分类', '项目', '金额']
  ];
  let totalAssets = 0, totalLiab = 0;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg.balance && agg.balance[cat] && agg.balance[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) { catHas = true; rows.push([CAT[cat], t.item_name, val]); }
    });
    if (catHas) rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat === 'mortgage' || cat === 'other_debt') totalLiab += subTotal;
    else totalAssets += subTotal;
  });
  rows.push(['', '资产合计', totalAssets]);
  rows.push(['', '负债合计', totalLiab]);
  rows.push(['', '净资产', totalAssets - totalLiab]);
  rows.push([]);
  rows.push([`家庭收支明细 (两人合计 ${S.year}年${S.month}月)`, '', '']);
  rows.push(['分类', '项目', '金额']);
  let totalIncome = 0, totalExpense = 0;
  FLOW_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'cashflow' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg.cashflow && agg.cashflow[cat] && agg.cashflow[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) { catHas = true; rows.push([CAT[cat], t.item_name, val]); }
    });
    if (catHas) rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat === 'income') totalIncome = subTotal; else totalExpense = subTotal;
  });
  rows.push(['', '本月结余', totalIncome - totalExpense]);
  if (totalIncome > 0) rows.push(['', '储蓄率', Math.round((totalIncome-totalExpense)/totalIncome*100)+'%']);
  return setCols(XLSX.utils.aoa_to_sheet(rows), [14, 20, 14]);
}

// 年度财务总结 sheet: 项目/年初/年末/变化
function buildYearlySummarySheet(y) {
  const ch = y.changes;
  const sumLiabB = y.beginning.mortgage + y.beginning.other_debt;
  const sumLiabE = y.ending.mortgage + y.ending.other_debt;
  const rows = [
    [`${S.year}年 年度财务总结`, '', '', ''],
    ['项目', '年初', '年末', '变化'],
    ['现金', y.beginning.cash, y.ending.cash, ch.cash],
    ['投资资产', y.beginning.investment, y.ending.investment, ch.investment],
    ['实物资产', y.beginning.physical, y.ending.physical, ch.physical],
    ['总资产', y.beginning.totalAssets, y.ending.totalAssets, ch.totalAssets],
    ['负债', sumLiabB, sumLiabE, -(ch.totalLiab)],
    ['净资产', y.beginning.netWorth, y.ending.netWorth, ch.netWorth]
  ];
  return setCols(XLSX.utils.aoa_to_sheet(rows), [14, 14, 14, 14]);
}

// 年度收入支出 sheet: 按项目分组全年累计
function buildYearlyCashflowSheet(cf) {
  const rows = [
    [`${S.year}年 年度收入支出`, '', ''],
    ['项目', '金额', '']
  ];
  const incomeItems = Object.entries(cf.income);
  const expenseItems = Object.entries(cf.expense);
  if (incomeItems.length === 0 && expenseItems.length === 0) {
    rows.push(['暂无收入支出记录', '', '']);
  } else {
    if (incomeItems.length > 0) {
      incomeItems.forEach(([name, amt]) => rows.push([name, amt, '']));
      rows.push(['全年收入', cf.totalIncome, '']);
    }
    if (expenseItems.length > 0) {
      expenseItems.forEach(([name, amt]) => rows.push([name, amt, '']));
      rows.push(['全年支出', cf.totalExpense, '']);
    }
    rows.push(['全年净结余', cf.totalSurplus, '']);
    if (cf.totalIncome > 0) rows.push(['储蓄率', Math.round(cf.totalSurplus/cf.totalIncome*100)+'%', '']);
  }
  return setCols(XLSX.utils.aoa_to_sheet(rows), [16, 14, 10]);
}

// 年度家庭明细 sheet: 12月年末资产负债快照 + 全年收支累计 (两人合计)
function buildFamilyYearDetailSheet(decRecs, cf, templates) {
  const agg = {};
  (decRecs || []).forEach(r => {
    if (r.section !== 'balance') return;
    if (!agg[r.category]) agg[r.category] = {};
    if (!agg[r.category][r.item_name]) agg[r.category][r.item_name] = 0;
    agg[r.category][r.item_name] += Number(r.amount);
  });
  const rows = [
    [`${S.year}年 年末资产负债快照 (12月 两人合计)`, '', ''],
    ['分类', '项目', '年末值']
  ];
  let totalAssets = 0, totalLiab = 0;
  BAL_CATS.forEach(cat => {
    const items = templates.filter(t => t.section === 'balance' && t.category === cat);
    let subTotal = 0, catHas = false;
    items.forEach(t => {
      const val = (agg[cat] && agg[cat][t.item_name]) || 0;
      subTotal += val;
      if (val > 0) { catHas = true; rows.push([CAT[cat], t.item_name, val]); }
    });
    if (catHas) rows.push(['', CAT[cat]+'小计', subTotal]);
    if (cat === 'mortgage' || cat === 'other_debt') totalLiab += subTotal;
    else totalAssets += subTotal;
  });
  rows.push(['', '资产合计', totalAssets]);
  rows.push(['', '负债合计', totalLiab]);
  rows.push(['', '净资产', totalAssets - totalLiab]);
  rows.push([]);
  rows.push([`${S.year}年 全年收支累计 (两人合计)`, '', '']);
  rows.push(['分类', '项目', '全年合计']);
  const incomeItems = Object.entries(cf.income);
  const expenseItems = Object.entries(cf.expense);
  if (incomeItems.length === 0 && expenseItems.length === 0) {
    rows.push(['暂无收支数据', '', '']);
  } else {
    if (incomeItems.length > 0) {
      incomeItems.forEach(([name, amt]) => rows.push(['收入', name, amt]));
      rows.push(['', '收入小计', cf.totalIncome]);
    }
    if (expenseItems.length > 0) {
      expenseItems.forEach(([name, amt]) => rows.push(['支出', name, amt]));
      rows.push(['', '支出小计', cf.totalExpense]);
    }
    rows.push(['', '全年结余', cf.totalSurplus]);
    if (cf.totalIncome > 0) rows.push(['', '储蓄率', Math.round(cf.totalSurplus/cf.totalIncome*100)+'%']);
  }
  return setCols(XLSX.utils.aoa_to_sheet(rows), [14, 20, 14]);
}

// 月度趋势 sheet: 12个月的总资产/负债/净资产/收入/支出/结余
function buildTrendsSheet(t) {
  const rows = [['月份','总资产','总负债','净资产','总收入','总支出','结余']];
  for (let m = 1; m <= 12; m++) {
    const i = m - 1;
    rows.push([m+'月', t.totalAssets[i], t.totalLiab[i], t.netWorth[i], t.totalIncome[i], t.totalExpense[i], t.totalIncome[i]-t.totalExpense[i]]);
  }
  return setCols(XLSX.utils.aoa_to_sheet(rows), [8, 14, 14, 14, 14, 14, 14]);
}

/* === Start === */
init();
