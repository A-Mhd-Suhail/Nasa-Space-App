-- Audit events are append-only: block UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION moonnav_audit_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION moonnav_audit_immutable();
--> statement-breakpoint
-- Scenarios are immutable inputs: new versions are new rows.
CREATE OR REPLACE FUNCTION moonnav_scenario_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'scenarios are immutable; create a new version';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER scenarios_no_update BEFORE UPDATE ON scenarios
  FOR EACH ROW EXECUTE FUNCTION moonnav_scenario_immutable();
