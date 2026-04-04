import { describe, expect, it } from 'vitest';
import { isTelemetryEnabled } from '../useSettings';

describe('useSettings — isTelemetryEnabled', () => {
  it('returns false by default when localStorage key is not set (opt-in)', () => {
    localStorage.removeItem('claude-hydra-telemetry');
    expect(isTelemetryEnabled()).toBe(false);
  });

  it('returns true when localStorage value is "true"', () => {
    localStorage.setItem('claude-hydra-telemetry', 'true');
    expect(isTelemetryEnabled()).toBe(true);
    localStorage.removeItem('claude-hydra-telemetry');
  });

  it('returns false when localStorage value is "false"', () => {
    localStorage.setItem('claude-hydra-telemetry', 'false');
    expect(isTelemetryEnabled()).toBe(false);
    localStorage.removeItem('claude-hydra-telemetry');
  });
});
