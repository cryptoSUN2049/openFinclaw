import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Alert, AlertCondition } from "./alert-engine.js";

/**
 * SQLite persistence layer for AlertEngine.
 * Uses DatabaseSync + WAL mode, matching the pattern in paper-store.ts.
 */
export class AlertStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.createTables();
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        condition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        triggered_at TEXT,
        notified INTEGER NOT NULL DEFAULT 0,
        message TEXT
      )
    `);
  }

  loadAll(): Alert[] {
    const stmt = this.db.prepare("SELECT * FROM alerts ORDER BY created_at ASC");
    const rows = stmt.all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: row.id as string,
      condition: JSON.parse(row.condition_json as string) as AlertCondition,
      createdAt: row.created_at as string,
      triggeredAt: (row.triggered_at as string | null) ?? undefined,
      notified: (row.notified as number) === 1,
      message: (row.message as string | null) ?? undefined,
    }));
  }

  insert(alert: Alert): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO alerts (id, condition_json, created_at, triggered_at, notified, message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      alert.id,
      JSON.stringify(alert.condition),
      alert.createdAt,
      alert.triggeredAt ?? null,
      alert.notified ? 1 : 0,
      alert.message ?? null,
    );
  }

  remove(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM alerts WHERE id = ?");
    const result = stmt.run(id);
    return result.changes > 0;
  }

  updateTriggered(id: string, triggeredAt: string): void {
    const stmt = this.db.prepare("UPDATE alerts SET triggered_at = ? WHERE id = ?");
    stmt.run(triggeredAt, id);
  }

  close(): void {
    this.db.close();
  }
}
