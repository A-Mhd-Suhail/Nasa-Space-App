-- Scenarios stay immutable scientific inputs; only the display name may change (rename).
-- Any change to coordinates, times, sampling, products, definition or hash still raises.
CREATE OR REPLACE FUNCTION moonnav_scenario_immutable() RETURNS trigger AS $$
DECLARE probe scenarios;
BEGIN
  probe := NEW;
  probe.name := OLD.name;
  IF probe IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'scenarios are immutable; create a new version (only the name can be changed)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
