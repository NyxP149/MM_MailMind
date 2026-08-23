import { describe, expect, it } from 'vitest';
import { formatEmailDate, initials } from './utils.js';

describe('initials', () => {
  it('uses up to two name parts', () => {
    expect(initials('Alice Martin')).toBe('AM');
  });
});

describe('formatEmailDate', () => {
  it('formats same-day messages as a time', () => {
    expect(
      formatEmailDate('2026-08-23T08:30:00Z', new Date('2026-08-23T12:00:00Z')),
    ).toMatch(/08:30|10:30/);
  });
});

