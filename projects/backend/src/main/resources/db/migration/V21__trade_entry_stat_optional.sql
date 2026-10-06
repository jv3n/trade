-- A trade no longer needs a stat (#633) : an import, a session typed after the fact. The FK stays
-- ON DELETE RESTRICT — a NULL passes it, and a stat still holding trades is not deleted from under them.
ALTER TABLE trade_entry ALTER COLUMN stat_entry_id DROP NOT NULL;
