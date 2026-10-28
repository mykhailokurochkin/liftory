import { expect, it } from 'vitest';
import { RateLimit } from './rate-limit.js';

it('limits per key and expires the window without an unbounded map', () => {
  let time = 0;
  const limiter = new RateLimit(2, 1000, () => time);
  expect(limiter.allow('a')).toBe(true);
  expect(limiter.allow('a')).toBe(true);
  expect(limiter.allow('a')).toBe(false);
  expect(limiter.allow('b')).toBe(true);
  time = 1000;
  expect(limiter.allow('a')).toBe(true);
  for (let n = 0; n < 999; n++) expect(limiter.allow('new-' + n)).toBe(true);
  expect(limiter.allow('overflow')).toBe(false);
  time = 2000;
  expect(limiter.allow('overflow')).toBe(true);
});
