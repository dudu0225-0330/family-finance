const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

const query = (text, params) => pool.query(text, params);

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS item_templates (
  id SERIAL PRIMARY KEY,
  section TEXT NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS records (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  section TEXT NOT NULL,
  category TEXT NOT NULL,
  item_name TEXT NOT NULL,
  amount DOUBLE PRECISION DEFAULT 0,
  note TEXT,
  UNIQUE(user_name, year, month, section, category, item_name)
);
`;

const DEFAULT_TEMPLATES = [
  ['balance', 'cash', '银行活期', 1],
  ['balance', 'cash', '微信余额', 2],
  ['balance', 'cash', '货币基金', 3],
  ['balance', 'investment', '股票', 1],
  ['balance', 'investment', '基金', 2],
  ['balance', 'investment', '债券理财', 3],
  ['balance', 'investment', '黄金', 4],
  ['balance', 'physical', '房产', 1],
  ['balance', 'mortgage', '房贷', 1],
  ['balance', 'other_debt', '信用贷', 1],
  ['balance', 'other_debt', '花呗信用卡', 2],
  ['cashflow', 'income', '工资', 1],
  ['cashflow', 'income', '副业', 2],
  ['cashflow', 'income', '投资收益', 3],
  ['cashflow', 'expense', '房租', 1],
  ['cashflow', 'expense', '房贷', 2],
  ['cashflow', 'expense', '食物', 3],
  ['cashflow', 'expense', '交通', 4],
  ['cashflow', 'expense', '娱乐', 5],
  ['cashflow', 'expense', '购物', 6],
  ['cashflow', 'expense', '学习', 7],
];

async function init() {
  await pool.query(SCHEMA_SQL);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM item_templates');
  if (rows[0].c === 0) {
    for (const [section, category, item_name, sort_order] of DEFAULT_TEMPLATES) {
      await pool.query(
        'INSERT INTO item_templates (section, category, item_name, sort_order) VALUES ($1, $2, $3, $4)',
        [section, category, item_name, sort_order]
      );
    }
  }

  const { rows: pwdRows } = await pool.query("SELECT value FROM config WHERE key = 'password'");
  if (pwdRows.length === 0) {
    const defaultPwd = process.env.APP_PASSWORD || 'family123';
    await pool.query("INSERT INTO config (key, value) VALUES ('password', $1)", [defaultPwd]);
  }
}

module.exports = { pool, query, init };
