-- Two more patterns (#393) : Short Into Resistance, Short Into VWAP. Placed before DISCRETIONARY so
-- the enum reads in the same order as `Pattern.kt`.
ALTER TYPE pattern ADD VALUE 'SIR' BEFORE 'DISCRETIONARY';
ALTER TYPE pattern ADD VALUE 'SIV' BEFORE 'DISCRETIONARY';
