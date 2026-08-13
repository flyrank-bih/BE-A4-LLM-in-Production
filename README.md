# Task API

A simple Express CRUD API for managing tasks, backed by SQLite.

## Why SQLite?

SQLite was chosen because it is a real SQL database that still fits a small local project:

- No separate database server to install or run — just a library (`better-sqlite3`) and a file
- Data survives server restarts (unlike the previous in-memory array)
- Synchronous API, which keeps the Express handlers simple (no `async`/`await` for queries)
- Enough SQL to practice `SELECT`, `INSERT`, `UPDATE`, and `DELETE` without the overhead of Postgres or MySQL

## Database file

Tasks are stored in **`tasks.db`** in the project root (the same folder as `index.js`).

The file is created automatically the first time the app starts. It is listed in `.gitignore`, so each machine keeps its own copy.

## Getting started

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

For auto-reload while editing:

```bash
npm run dev
```

The API runs at `http://localhost:3000`.

OpenAPI docs (Swagger UI) are at [http://localhost:3000/docs](http://localhost:3000/docs). The spec lives in `openapi.json`.

### Example SQL query

On startup (and whenever you list tasks), the app runs queries like this to read every row:

```sql
SELECT id, title, done, created_at, updated_at FROM tasks ORDER BY id;
```

That is the same data you get from `GET /tasks`. Each task also stores `created_at` and `updated_at` (set on insert; `updated_at` is refreshed on every successful `PUT`).

## Endpoints

### `GET /`

Returns metadata about the API.

**Response**

```json
{
  "name": "Task API",
  "version": "1.0",
  "endpoints": ["/tasks"]
}
```

**Example**

```bash
curl http://localhost:3000/
```

### `GET /health`

Health check endpoint.

**Response**

```json
{
  "status": "ok"
}
```

**Example**

```bash
curl http://localhost:3000/health
```

### `GET /tasks`

Returns all tasks. Optional query parameters filter the list (the part after `?` — filters, not addresses).

| Query | Example | Effect |
|-------|---------|--------|
| `done` | `?done=true` | Only finished tasks |
| `done` | `?done=false` | Only open tasks |
| `search` | `?search=milk` | Title contains the word (case-insensitive) |

Filters can be combined: `?done=false&search=book`

**Response**

```json
[
  {
    "id": 1,
    "title": "Buy groceries",
    "done": false,
    "created_at": "2026-07-24 09:15:00",
    "updated_at": "2026-07-24 09:15:00"
  },
  {
    "id": 2,
    "title": "Walk the dog",
    "done": true,
    "created_at": "2026-07-24 09:15:00",
    "updated_at": "2026-07-24 10:02:11"
  },
  {
    "id": 3,
    "title": "Read a book",
    "done": false,
    "created_at": "2026-07-24 09:15:00",
    "updated_at": "2026-07-24 09:15:00"
  }
]
```

**Example**

```bash
curl http://localhost:3000/tasks
curl "http://localhost:3000/tasks?done=true"
curl "http://localhost:3000/tasks?search=milk"
```

### `GET /stats`

Returns counts computed in SQL with `COUNT()` (not by looping in JavaScript).

**Response**

```json
{ "total": 7, "done": 3, "open": 4 }
```

**Example**

```bash
curl http://localhost:3000/stats
```

### `POST /reset`

Clears the database and restores the three seed example tasks (with fresh timestamps). Useful for demos and testing.

**Response (200)**

```json
[
  {
    "id": 1,
    "title": "Buy groceries",
    "done": false,
    "created_at": "2026-07-24 12:00:00",
    "updated_at": "2026-07-24 12:00:00"
  },
  {
    "id": 2,
    "title": "Walk the dog",
    "done": true,
    "created_at": "2026-07-24 12:00:00",
    "updated_at": "2026-07-24 12:00:00"
  },
  {
    "id": 3,
    "title": "Read a book",
    "done": false,
    "created_at": "2026-07-24 12:00:00",
    "updated_at": "2026-07-24 12:00:00"
  }
]
```

**Example**

```bash
curl -X POST http://localhost:3000/reset
```

### `GET /tasks/:id`

Returns a single task by id.

**Response (200)**

```json
{ "id": 1, "title": "Buy groceries", "done": false, "created_at": "2026-07-24 09:15:00", "updated_at": "2026-07-24 09:15:00" }
```

**Response (404)**

```json
{ "error": "Task 99 not found" }
```

**Example**

```bash
curl http://localhost:3000/tasks/1
curl http://localhost:3000/tasks/99
```

### `POST /tasks`

Creates a new task.

**Request body**

```json
{ "title": "Buy milk" }
```

**Response (201)**

```json
{ "id": 4, "title": "Buy milk", "done": false, "created_at": "2026-07-24 11:20:00", "updated_at": "2026-07-24 11:20:00" }
```

**Response (400)**

```json
{ "error": "title is required and cannot be empty" }
```

**Example**

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy milk"}'
```

### `PUT /tasks/:id`

Updates a task's `title` and/or `done`. Send one or both fields; omitted fields stay unchanged.

**Request body**

```json
{ "title": "Buy oat milk", "done": true }
```

**Response (200)**

```json
{ "id": 1, "title": "Buy oat milk", "done": true, "created_at": "2026-07-24 09:15:00", "updated_at": "2026-07-24 11:45:00" }
```

**Response (400)**

```json
{ "error": "request body must include title and/or done" }
```

**Response (404)**

```json
{ "error": "Task 99 not found" }
```

**Example**

```bash
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"done": true}'
```

### `DELETE /tasks/:id`

Deletes a task.

**Response (204)**

Empty body — success, nothing to return.

**Response (404)**

```json
{ "error": "Task 99 not found" }
```

**Example**

```bash
curl -X DELETE http://localhost:3000/tasks/1
```
