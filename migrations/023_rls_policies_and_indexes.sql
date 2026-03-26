-- Migration 023: RLS Policies, Composite Indexes, and Idempotency Constraints
-- =============================================================================
-- This migration:
--   1. Enables RLS and adds tenant-isolation policies for key tables
--   2. Adds composite indexes for dashboard query performance
--   3. Adds a unique constraint on email_verdicts(tenant_id, message_id) for idempotency
-- =============================================================================

-- ============================================================================
-- 1. ROW-LEVEL SECURITY POLICIES
--    Each block: enable RLS, then create a "tenant_isolation" policy that
--    restricts rows to current_setting('app.current_tenant_id', true).
--    The second arg (true) makes it return NULL instead of erroring when unset.
-- ============================================================================

-- email_verdicts
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_verdicts') THEN
    EXECUTE 'ALTER TABLE email_verdicts ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'email_verdicts_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY email_verdicts_tenant_isolation ON email_verdicts
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- quarantine
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quarantine') THEN
    EXECUTE 'ALTER TABLE quarantine ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'quarantine_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY quarantine_tenant_isolation ON quarantine
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- policies
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'policies') THEN
    EXECUTE 'ALTER TABLE policies ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'policies_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY policies_tenant_isolation ON policies
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- integrations
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integrations') THEN
    EXECUTE 'ALTER TABLE integrations ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'integrations_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY integrations_tenant_isolation ON integrations
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- audit_log
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    EXECUTE 'ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audit_log_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY audit_log_tenant_isolation ON audit_log
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;

-- usage_metrics
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usage_metrics') THEN
    EXECUTE 'ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'usage_metrics_tenant_isolation') THEN
    EXECUTE 'CREATE POLICY usage_metrics_tenant_isolation ON usage_metrics
      FOR ALL USING (tenant_id::text = current_setting(''app.current_tenant_id'', true))';
  END IF;
END $$;


-- ============================================================================
-- 2. COMPOSITE INDEXES for dashboard query performance
-- ============================================================================

-- threats: filter by tenant + sort by created_at + filter by verdict
CREATE INDEX IF NOT EXISTS idx_threats_tenant_verdict
  ON threats(tenant_id, created_at DESC, verdict);

-- email_verdicts: filter by tenant + sort by created_at
CREATE INDEX IF NOT EXISTS idx_email_verdicts_tenant_created
  ON email_verdicts(tenant_id, created_at DESC);

-- integrations: filter by tenant + type + status
CREATE INDEX IF NOT EXISTS idx_integrations_tenant_type
  ON integrations(tenant_id, type, status);


-- ============================================================================
-- 3. UNIQUE CONSTRAINT for idempotent email verdict upserts (Sprint 3)
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_email_verdicts_tenant_message'
  ) THEN
    ALTER TABLE email_verdicts
      ADD CONSTRAINT uq_email_verdicts_tenant_message UNIQUE (tenant_id, message_id);
  END IF;
END $$;
