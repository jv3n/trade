-- Floating balance corrections — fixes the "account totals drift after editing / deleting a line"
-- bug. Until now an ADJUSTMENT stored only its signed delta (target − balance at the moment of the
-- correction). That delta was frozen : editing or deleting another line later changed the derived
-- balance while the adjustment stayed put, so the balance no longer matched the reconciled target.
--
-- A correction now also records the TARGET balance the user reconciled to. The service re-floats the
-- *latest* correction whenever another line is edited or deleted, recomputing its delta so
-- `balance = Σ amount` stays equal to that target. Older corrections stay frozen (they were real
-- reconciliations at their date), and legacy ADJUSTMENT rows (target NULL) also stay frozen.
--
-- NULL = a legacy adjustment or a non-correction adjustment ; the CHECK ties a target to ADJUSTMENT
-- rows only.

ALTER TABLE account_movement
    ADD COLUMN target_balance NUMERIC(18, 2);

ALTER TABLE account_movement
    ADD CONSTRAINT account_movement_target_type_check
        CHECK (target_balance IS NULL OR type = 'ADJUSTMENT');
