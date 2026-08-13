// Task API — Express CRUD server for tasks, backed by SQLite.
// Stages 0–5 of the W3 assignment, plus the optional extras.
require('dotenv').config({ quiet: true });
const express = require('express');
const Database = require('better-sqlite3'); // sync SQLite driver (no async/await needed)
const swaggerUi = require('swagger-ui-express');
const openapi = require('./openapi.json');
const { generateText, generateQuiz } = require('./services/ai');
const app = express();
const port = 3000;

// Express needs this to parse JSON request bodies.
app.use(express.json());

// ---------------------------------------------------------------------------
// SQLite database — opens (or creates) tasks.db in this folder.
// ---------------------------------------------------------------------------
const db = new Database('tasks.db');

// Create the table on first run. Safe to call every time — IF NOT EXISTS
// means it does nothing when the table is already there.
// SQLite has no real boolean type, so done is stored as 0/1 (INTEGER).
// created_at / updated_at are stored as TEXT (YYYY-MM-DD HH:MM:SS).
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// Existing tasks.db files may predate the timestamp columns — add them if missing.
// ALTER TABLE only allows constant defaults, so we backfill with datetime('now').
const taskColumns = db.prepare('PRAGMA table_info(tasks)').all().map((c) => c.name);
if (!taskColumns.includes('created_at')) {
  db.exec(`ALTER TABLE tasks ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`);
  db.exec(`UPDATE tasks SET created_at = datetime('now') WHERE created_at = ''`);
}
if (!taskColumns.includes('updated_at')) {
  db.exec(`ALTER TABLE tasks ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`);
  db.exec(`UPDATE tasks SET updated_at = datetime('now') WHERE updated_at = ''`);
}

const SEED_TASKS = [
  { id: 1, title: 'Buy groceries', done: false },
  { id: 2, title: 'Walk the dog', done: true },
  { id: 3, title: 'Read a book', done: false },
];

const insertSeedTask = db.prepare('INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)');

function seedTasks(tasks) {
  for (const task of tasks) {
    // Convert JS boolean → 0/1 for SQLite. Timestamps use column defaults.
    insertSeedTask.run(task.id, task.title, task.done ? 1 : 0);
  }
}

// Seed only when empty, so restarting the server won't duplicate rows.
const countTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks');
if (countTasks.get().count === 0) {
  db.transaction(seedTasks)(SEED_TASKS);
}

// Wipe the table and restore the three example tasks (fresh timestamps).
function resetTasks() {
  const clear = db.prepare('DELETE FROM tasks');
  const reset = db.transaction((tasks) => {
    clear.run();
    seedTasks(tasks);
  });
  reset(SEED_TASKS);
}

// ---------------------------------------------------------------------------
// Stage 5 — Swagger UI at /docs
// ---------------------------------------------------------------------------
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

// ---------------------------------------------------------------------------
// Stage 1 — the front door
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    name: 'Task API',
    version: '1.0',
    endpoints: ['/tasks', '/stats', '/reset', '/trivia/question', '/quiz'],
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// Trivia — prove the API → AI service → Gemini → response path.
// ---------------------------------------------------------------------------
app.get('/trivia/question', async (req, res) => {
  const prompt = 'Generate one trivia question about JavaScript.';

  try {
    const { model, text } = await generateText(prompt);
    res.json({ prompt, model, text });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: err.message });
  }
});

const QUIZ_DIFFICULTIES = ['easy', 'medium', 'hard'];
const QUIZ_AMOUNT_MIN = 1;
const QUIZ_AMOUNT_MAX = 10;

function validateQuizRequest(body) {
  const { topic, difficulty, amount } = body ?? {};

  if (topic === undefined || topic === null || String(topic).trim() === '') {
    return { error: 'topic is required and cannot be empty' };
  }
  if (typeof topic !== 'string') {
    return { error: 'topic must be a string' };
  }

  if (difficulty === undefined || difficulty === null || String(difficulty).trim() === '') {
    return { error: 'difficulty is required' };
  }
  const normalizedDifficulty = String(difficulty).trim().toLowerCase();
  if (!QUIZ_DIFFICULTIES.includes(normalizedDifficulty)) {
    return { error: `difficulty must be one of: ${QUIZ_DIFFICULTIES.join(', ')}` };
  }

  if (amount === undefined || amount === null) {
    return { error: 'amount is required' };
  }
  if (!Number.isInteger(amount) || amount < QUIZ_AMOUNT_MIN || amount > QUIZ_AMOUNT_MAX) {
    return { error: `amount must be an integer between ${QUIZ_AMOUNT_MIN} and ${QUIZ_AMOUNT_MAX}` };
  }

  return {
    value: {
      topic: topic.trim(),
      difficulty: normalizedDifficulty,
      amount,
    },
  };
}

app.post('/quiz', async (req, res) => {
  const parsed = validateQuizRequest(req.body);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  try {
    const { model, questions } = await generateQuiz(parsed.value);
    res.json({
      topic: parsed.value.topic,
      difficulty: parsed.value.difficulty,
      questions,
      model,
    });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: err.message });
  }
});

// Convert a SQLite row (done is 0/1) into the JSON shape the API returns.
function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const TASK_COLUMNS = 'id, title, done, created_at, updated_at';

// ---------------------------------------------------------------------------
// Stage 2 — Read: list + single task (with optional filtering/search extras)
// ---------------------------------------------------------------------------
app.get('/tasks', (req, res) => {
  // Start with every row; optional filters narrow the SQL below.
  let sql = `SELECT ${TASK_COLUMNS} FROM tasks WHERE 1=1`;
  const params = [];

  // Extras: GET /tasks?done=true  → only finished (or only open) tasks.
  if (req.query.done !== undefined) {
    if (req.query.done !== 'true' && req.query.done !== 'false') {
      return res.status(400).json({ error: 'done must be true or false' });
    }
    sql += ' AND done = ?';
    params.push(req.query.done === 'true' ? 1 : 0);
  }

  // Extras: GET /tasks?search=milk → tasks whose title contains the word.
  if (req.query.search !== undefined) {
    const word = String(req.query.search).trim();
    if (word === '') {
      return res.status(400).json({ error: 'search must not be empty' });
    }
    sql += ' AND LOWER(title) LIKE ?';
    params.push(`%${word.toLowerCase()}%`);
  }

  sql += ' ORDER BY id';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(rowToTask));
});

// ---------------------------------------------------------------------------
// Extras — stats. Declared before "/tasks/:id" so "stats" isn't read as an id.
// ---------------------------------------------------------------------------
app.get('/stats', (req, res) => {
  // COUNT() in SQL — no loading every row into JavaScript to tally.
  const stats = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN done = 1 THEN 1 END) AS done,
        COUNT(CASE WHEN done = 0 THEN 1 END) AS open
      FROM tasks
    `
    )
    .get();

  res.json(stats);
});

// Extras — reset back to the 3 example tasks. Handy for demos.
app.post('/reset', (req, res) => {
  resetTasks();
  const rows = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY id`).all();
  res.json(rows.map(rowToTask));
});

// ---------------------------------------------------------------------------
// Stage 3 — Create
// ---------------------------------------------------------------------------
app.post('/tasks', (req, res) => {
  const { title } = req.body;

  if (title === undefined || title === null || String(title).trim() === '') {
    return res.status(400).json({ error: 'title is required and cannot be empty' });
  }

  // Insert a new row; SQLite assigns the next id and timestamp defaults.
  const result = db
    .prepare('INSERT INTO tasks (title, done) VALUES (?, 0)')
    .run(String(title).trim());

  const row = db
    .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`)
    .get(result.lastInsertRowid);

  res.status(201).json(rowToTask(row));
});

app.get('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id);

  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  res.json(rowToTask(row));
});

// ---------------------------------------------------------------------------
// Stage 4 — Update & Delete (SQL)
// ---------------------------------------------------------------------------
app.put('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  // Load the current row first so we can 404, then merge partial updates.
  const row = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id);

  if (!row) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  const { title, done } = req.body ?? {};
  const hasTitle = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'title');
  const hasDone = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'done');

  // Client may send title, done, or both — at least one is required.
  if (!hasTitle && !hasDone) {
    return res.status(400).json({ error: 'request body must include title and/or done' });
  }

  // Start from existing values; overwrite only fields present in the body.
  let nextTitle = row.title;
  let nextDone = row.done;

  if (hasTitle) {
    if (title === null || String(title).trim() === '') {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    nextTitle = String(title).trim();
  }

  if (hasDone) {
    if (typeof done !== 'boolean') {
      return res.status(400).json({ error: 'done must be a boolean' });
    }
    // SQLite stores done as 0/1, not true/false.
    nextDone = done ? 1 : 0;
  }

  // Bump updated_at whenever the row changes; created_at stays as-is.
  db.prepare(
    `UPDATE tasks SET title = ?, done = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(nextTitle, nextDone, id);

  const updated = db.prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ?`).get(id);
  res.json(rowToTask(updated));
});

app.delete('/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  // run() returns { changes } — how many rows were actually deleted.
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);

  if (result.changes === 0) {
    return res.status(404).json({ error: `Task ${id} not found` });
  }

  // 204 = success, no response body.
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Stage 0 — start the server
// ---------------------------------------------------------------------------
app.listen(port, () => {
  console.log(`CRUD API listening on port ${port}`);
});
