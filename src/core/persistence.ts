import type { TransactionRecord } from "../types/daraja.js";
import { InMemoryStore } from "./transactions.js";

export interface PersistentStore extends InMemoryStore {
  close(): void;
}

export async function createSqliteStore(path: string): Promise<PersistentStore> {
  let Database: typeof import("better-sqlite3");
  try {
    const mod = await import("better-sqlite3");
    Database = mod.default;
  } catch {
    throw new Error(
      "Persistence requires the optional dependency 'better-sqlite3'. Install with: npm i better-sqlite3",
    );
  }

  const db = Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      checkoutRequestID TEXT PRIMARY KEY,
      merchantRequestID TEXT NOT NULL,
      conversationID TEXT,
      originatorConversationID TEXT,
      kind TEXT NOT NULL,
      amount INTEGER NOT NULL,
      phoneNumber TEXT NOT NULL,
      shortCode TEXT NOT NULL,
      callbackUrl TEXT,
      state TEXT NOT NULL,
      resultCode INTEGER,
      resultDesc TEXT,
      mpesaReceiptNumber TEXT,
      createdAt INTEGER NOT NULL,
      completedAt INTEGER,
      callbackAttempts INTEGER NOT NULL DEFAULT 0,
      callbackDeliveredAt INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_conv ON transactions(conversationID);
    CREATE INDEX IF NOT EXISTS idx_created ON transactions(createdAt);
  `);

  class SqliteBackedStore extends InMemoryStore implements PersistentStore {
    constructor() {
      super();
      const rows = db.prepare("SELECT * FROM transactions ORDER BY createdAt DESC").all() as TransactionRecord[];
      for (const r of rows) super.put(r);
      this.on("change", (rec: TransactionRecord) => writeRow(rec));
      this.on("clear", () => db.exec("DELETE FROM transactions"));
    }
    close(): void {
      db.close();
    }
  }

  const writeStmt = db.prepare(`
    INSERT INTO transactions (
      checkoutRequestID, merchantRequestID, conversationID, originatorConversationID, kind,
      amount, phoneNumber, shortCode, callbackUrl, state, resultCode, resultDesc,
      mpesaReceiptNumber, createdAt, completedAt, callbackAttempts, callbackDeliveredAt
    ) VALUES (
      @checkoutRequestID, @merchantRequestID, @conversationID, @originatorConversationID, @kind,
      @amount, @phoneNumber, @shortCode, @callbackUrl, @state, @resultCode, @resultDesc,
      @mpesaReceiptNumber, @createdAt, @completedAt, @callbackAttempts, @callbackDeliveredAt
    )
    ON CONFLICT(checkoutRequestID) DO UPDATE SET
      state=excluded.state,
      resultCode=excluded.resultCode,
      resultDesc=excluded.resultDesc,
      mpesaReceiptNumber=excluded.mpesaReceiptNumber,
      completedAt=excluded.completedAt,
      callbackAttempts=excluded.callbackAttempts,
      callbackDeliveredAt=excluded.callbackDeliveredAt
  `);

  function writeRow(rec: TransactionRecord): void {
    writeStmt.run({
      checkoutRequestID: rec.checkoutRequestID,
      merchantRequestID: rec.merchantRequestID,
      conversationID: rec.conversationID ?? null,
      originatorConversationID: rec.originatorConversationID ?? null,
      kind: rec.kind,
      amount: rec.amount,
      phoneNumber: rec.phoneNumber,
      shortCode: rec.shortCode,
      callbackUrl: rec.callbackUrl ?? null,
      state: rec.state,
      resultCode: rec.resultCode ?? null,
      resultDesc: rec.resultDesc ?? null,
      mpesaReceiptNumber: rec.mpesaReceiptNumber ?? null,
      createdAt: rec.createdAt,
      completedAt: rec.completedAt ?? null,
      callbackAttempts: rec.callbackAttempts,
      callbackDeliveredAt: rec.callbackDeliveredAt ?? null,
    });
  }

  return new SqliteBackedStore();
}
