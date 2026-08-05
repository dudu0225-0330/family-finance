const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query, init } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'family-finance-secret-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: '未登录' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;
    const { rows } = await query("SELECT value FROM config WHERE key = 'password'");
    if (rows.length === 0 || password !== rows[0].value) {
      return res.status(401).json({ error: '密码错误' });
    }
    const token = jwt.sign({ authed: true }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.post('/api/password', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: '密码至少4位' });
    await query("UPDATE config SET value = $1 WHERE key = 'password'", [password]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.get('/api/templates', auth, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM item_templates ORDER BY section, category, sort_order');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.post('/api/templates', auth, async (req, res) => {
  try {
    const { section, category, item_name } = req.body;
    if (!section || !category || !item_name) return res.status(400).json({ error: '参数缺失' });
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM item_templates WHERE section=$1 AND category=$2',
      [section, category]
    );
    const sortOrder = maxRows[0].m + 1;
    const { rows } = await query(
      'INSERT INTO item_templates (section, category, item_name, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
      [section, category, item_name, sortOrder]
    );
    res.json({ id: rows[0].id });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.put('/api/templates/:id', auth, async (req, res) => {
  try {
    const { item_name } = req.body;
    await query('UPDATE item_templates SET item_name = $1 WHERE id = $2', [item_name, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.delete('/api/templates/:id', auth, async (req, res) => {
  try {
    await query('DELETE FROM item_templates WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.get('/api/records/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { user } = req.query;
    let rows;
    if (user) {
      const r = await query('SELECT * FROM records WHERE user_name=$1 AND year=$2 AND month=$3', [user, year, month]);
      rows = r.rows;
    } else {
      const r = await query('SELECT * FROM records WHERE year=$1 AND month=$2', [year, month]);
      rows = r.rows;
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.put('/api/records/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { user, records } = req.body;
    if (!user || !records) return res.status(400).json({ error: '参数缺失' });

    const client = await require('./db').pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM records WHERE user_name=$1 AND year=$2 AND month=$3', [user, year, month]);
      for (const r of records) {
        if (r.amount !== 0 || r.note) {
          await client.query(
            `INSERT INTO records (user_name, year, month, section, category, item_name, amount, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [user, year, month, r.section, r.category, r.item_name, r.amount || 0, r.note || null]
          );
        }
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

async function calcMonthSummary(year, month) {
  const { rows } = await query('SELECT * FROM records WHERE year=$1 AND month=$2', [year, month]);
  const s = {
    cash: 0, investment: 0, physical: 0,
    mortgage: 0, other_debt: 0,
    income: 0, expense: 0
  };
  for (const r of rows) {
    if (r.section === 'balance') {
      if (s.hasOwnProperty(r.category)) s[r.category] += Number(r.amount);
    } else if (r.section === 'cashflow') {
      if (s.hasOwnProperty(r.category)) s[r.category] += Number(r.amount);
    }
  }
  const totalAssets = s.cash + s.investment + s.physical;
  const totalLiab = s.mortgage + s.other_debt;
  return {
    cash: round(s.cash), investment: round(s.investment), physical: round(s.physical),
    mortgage: round(s.mortgage), other_debt: round(s.other_debt),
    totalAssets: round(totalAssets), totalLiab: round(totalLiab),
    netWorth: round(totalAssets - totalLiab),
    income: round(s.income), expense: round(s.expense),
    surplus: round(s.income - s.expense)
  };
}

function round(n) { return Math.round(n * 100) / 100; }

app.get('/api/summary/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const summary = await calcMonthSummary(Number(year), Number(month));
    res.json({ year: Number(year), month: Number(month), ...summary });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.get('/api/trends/:year', auth, async (req, res) => {
  try {
    const year = Number(req.params.year);
    const months = [];
    const totalAssets = [], totalLiab = [], netWorth = [], totalIncome = [], totalExpense = [];

    for (let m = 1; m <= 12; m++) {
      months.push(m);
      const s = await calcMonthSummary(year, m);
      totalAssets.push(s.totalAssets);
      totalLiab.push(s.totalLiab);
      netWorth.push(s.netWorth);
      totalIncome.push(s.income);
      totalExpense.push(s.expense);
    }

    res.json({ year, months, totalAssets, totalLiab, netWorth, totalIncome, totalExpense });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.get('/api/yearly/:year', auth, async (req, res) => {
  try {
    const year = Number(req.params.year);
    const jan = await calcMonthSummary(year, 1);
    const dec = await calcMonthSummary(year, 12);

    let totalIncome = 0, totalExpense = 0;
    for (let m = 1; m <= 12; m++) {
      const s = await calcMonthSummary(year, m);
      totalIncome += s.income;
      totalExpense += s.expense;
    }

    res.json({
      year,
      beginning: jan,
      ending: dec,
      changes: {
        cash: round(dec.cash - jan.cash),
        investment: round(dec.investment - jan.investment),
        physical: round(dec.physical - jan.physical),
        mortgage: round(dec.mortgage - jan.mortgage),
        other_debt: round(dec.other_debt - jan.other_debt),
        netWorth: round(dec.netWorth - jan.netWorth),
        totalAssets: round(dec.totalAssets - jan.totalAssets),
        totalLiab: round(dec.totalLiab - jan.totalLiab)
      },
      cashflow: {
        income: round(totalIncome),
        expense: round(totalExpense),
        surplus: round(totalIncome - totalExpense)
      }
    });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

app.get('/api/yearly-cashflow/:year', auth, async (req, res) => {
  try {
    const year = Number(req.params.year);
    // 累计全年每项收入/支出
    const { rows } = await query(
      "SELECT section, category, item_name, SUM(amount) as total " +
      "FROM records WHERE year=$1 AND section='cashflow' " +
      "GROUP BY section, category, item_name ORDER BY section, category, item_name",
      [year]
    );
    const income = {};
    const expense = {};
    let totalIncome = 0, totalExpense = 0;
    for (const r of rows) {
      const amt = round(Number(r.total));
      if (r.category === 'income') { income[r.item_name] = amt; totalIncome += amt; }
      else { expense[r.item_name] = amt; totalExpense += amt; }
    }
    res.json({
      year,
      income, expense,
      totalIncome: round(totalIncome),
      totalExpense: round(totalExpense),
      totalSurplus: round(totalIncome - totalExpense)
    });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

// Excel export endpoint
app.get('/api/export/:year/:month', auth, async (req, res) => {
  try {
    const { year, month } = req.params;
    const { rows: templates } = await query('SELECT * FROM item_templates ORDER BY section, category, sort_order');
    const { rows: records } = await query('SELECT * FROM records WHERE year=$1 AND month=$2', [year, month]);

    res.json({ templates, records, year: Number(year), month: Number(month) });
  } catch (e) {
    res.status(500).json({ error: '服务器错误: ' + e.message });
  }
});

async function start() {
  await init();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
