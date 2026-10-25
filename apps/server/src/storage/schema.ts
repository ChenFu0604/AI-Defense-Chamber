export const workspaceSchema = `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, created_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  origin TEXT NOT NULL CHECK(origin IN ('current','snapshot')), data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE TABLE IF NOT EXISTS project_versions (
  project_id TEXT NOT NULL REFERENCES projects(id), updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)), PRIMARY KEY(project_id, updated_at)
);
CREATE TABLE IF NOT EXISTS project_analyses (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), mode TEXT NOT NULL,
  created_at TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE INDEX IF NOT EXISTS analyses_project ON project_analyses(project_id, created_at);
CREATE TABLE IF NOT EXISTS defense_sessions (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE INDEX IF NOT EXISTS sessions_project ON defense_sessions(project_id, created_at);
CREATE TABLE IF NOT EXISTS defense_questions (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES defense_sessions(id),
  ordinal INTEGER NOT NULL, judge_id TEXT NOT NULL, question_type TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)), UNIQUE(session_id, ordinal)
);
CREATE TABLE IF NOT EXISTS defense_answers (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES defense_sessions(id),
  question_id TEXT NOT NULL REFERENCES defense_questions(id), ordinal INTEGER NOT NULL,
  request_id TEXT NOT NULL, judge_id TEXT NOT NULL, content TEXT NOT NULL,
  created_at TEXT NOT NULL, status TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  UNIQUE(session_id, ordinal), UNIQUE(session_id, request_id)
);
CREATE TABLE IF NOT EXISTS defense_reports (
  id TEXT NOT NULL UNIQUE, session_id TEXT PRIMARY KEY REFERENCES defense_sessions(id),
  project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL,
  overall_score REAL, source_fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE TABLE IF NOT EXISTS improvement_tasks (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
  report_id TEXT NOT NULL REFERENCES defense_reports(id), session_id TEXT NOT NULL REFERENCES defense_sessions(id),
  improvement_index INTEGER NOT NULL, updated_at TEXT NOT NULL, data_json TEXT NOT NULL CHECK(json_valid(data_json)),
  UNIQUE(report_id, improvement_index)
);
CREATE TABLE IF NOT EXISTS workspace_operations (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result_json TEXT NOT NULL CHECK(json_valid(result_json))
);
CREATE TABLE IF NOT EXISTS legacy_imports (
  filename TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, imported_at TEXT NOT NULL
);
`
