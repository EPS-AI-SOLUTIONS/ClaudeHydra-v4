import { describe, expect, it } from 'vitest';
import { isTelemetryEnabled } from '../useSettings';

describe('useSettings — isTelemetryEnabled', () => {
  it('returns true by default when localStorage key is not set', () => {
    localStorage.removeItem('claude-hydra-telemetry');
    expect(isTelemetryEnabled()).toBe(true);
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
