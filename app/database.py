import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "jenn.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS workflows (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            name         TEXT NOT NULL,
            type         TEXT NOT NULL,
            grade        TEXT NOT NULL DEFAULT 'both',
            context      TEXT,
            instructions TEXT,
            doc_ids      TEXT DEFAULT '[]',
            rubric       TEXT,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS outputs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id   INTEGER NOT NULL,
            version       INTEGER NOT NULL DEFAULT 1,
            html          TEXT NOT NULL,
            teacher_html  TEXT,
            slideshow_html TEXT,
            notes         TEXT,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS curriculum_docs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            filename    TEXT NOT NULL UNIQUE,
            filepath    TEXT NOT NULL,
            title       TEXT,
            subject     TEXT,
            grade       TEXT,
            tags        TEXT DEFAULT '[]',
            description TEXT,
            added_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS context_notes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL,
            category    TEXT DEFAULT 'general',
            active      INTEGER DEFAULT 1,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS suggestions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT NOT NULL,
            status      TEXT DEFAULT 'new',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS students (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            grade      TEXT NOT NULL,
            active     INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id       INTEGER NOT NULL,
            student_id        INTEGER,
            filepath          TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            ai_name_guess     TEXT,
            confidence        TEXT DEFAULT 'low',
            status            TEXT DEFAULT 'needs_review',
            created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES students(id)
        );

        CREATE TABLE IF NOT EXISTS grades (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER NOT NULL UNIQUE,
            score        REAL,
            max_score    REAL,
            feedback     TEXT,
            breakdown    TEXT,
            graded_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id          TEXT PRIMARY KEY,
            workflow_id INTEGER NOT NULL,
            output_id   INTEGER,
            status      TEXT DEFAULT 'pending',
            progress    TEXT DEFAULT 'Queued...',
            error       TEXT,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS lesson_topics (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT NOT NULL,
            grade      TEXT NOT NULL DEFAULT 'both',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS conversations (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            title      TEXT NOT NULL DEFAULT 'New Chat',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS messages (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            api_role        TEXT NOT NULL,
            api_content     TEXT NOT NULL,
            display_role    TEXT NOT NULL,
            display_content TEXT NOT NULL,
            tool_name       TEXT,
            tool_use_id     TEXT,
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );
    """)
    conn.commit()

    # Migrations for existing DBs
    for migration in [
        "ALTER TABLE workflows ADD COLUMN rubric TEXT",
        "ALTER TABLE outputs ADD COLUMN teacher_html TEXT",
        "ALTER TABLE outputs ADD COLUMN slideshow_html TEXT",
        "ALTER TABLE outputs ADD COLUMN status TEXT DEFAULT 'complete'",
        "ALTER TABLE outputs ADD COLUMN slideshow_json TEXT",
        "ALTER TABLE workflows ADD COLUMN topic_id INTEGER REFERENCES lesson_topics(id)",
    ]:
        try:
            conn.execute(migration)
            conn.commit()
        except Exception:
            pass

    conn.close()
    print(f"Database initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
