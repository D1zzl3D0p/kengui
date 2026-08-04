import { describe, expect, it } from 'vitest';
import {
  compareApiVersion,
  evaluateVersionHandshake,
  parseMajor,
} from './version';

describe('parseMajor', () => {
  it('parses vN and bare numbers', () => {
    expect(parseMajor('v1')).toBe(1);
    expect(parseMajor('v2')).toBe(2);
    expect(parseMajor('3')).toBe(3);
    expect(parseMajor('2.5')).toBe(2);
    expect(parseMajor('V4')).toBe(4);
  });

  it('returns null for missing or unparseable input', () => {
    expect(parseMajor(null)).toBeNull();
    expect(parseMajor(undefined)).toBeNull();
    expect(parseMajor('')).toBeNull();
    expect(parseMajor('latest')).toBeNull();
  });
});

describe('compareApiVersion', () => {
  it('matches equal majors as compatible', () => {
    expect(compareApiVersion('v1', 'v1')).toBe('compatible');
    expect(compareApiVersion('v2', '2.9')).toBe('compatible');
  });

  it('detects newer and older servers', () => {
    expect(compareApiVersion('v1', 'v2')).toBe('server-newer');
    expect(compareApiVersion('v2', 'v1')).toBe('server-older');
  });

  it('returns unknown when either side is unparseable', () => {
    expect(compareApiVersion('v1', null)).toBe('unknown');
    expect(compareApiVersion('v1', 'weird')).toBe('unknown');
    expect(compareApiVersion('', 'v1')).toBe('unknown');
  });
});

describe('evaluateVersionHandshake', () => {
  it('is quiet when compatible', () => {
    const result = evaluateVersionHandshake('v1', 'v1');
    expect(result.compatibility).toBe('compatible');
    expect(result.warning).toBeNull();
  });

  it('warns and names both versions when the server is newer', () => {
    const result = evaluateVersionHandshake('v3', 'v1');
    expect(result.compatibility).toBe('server-newer');
    expect(result.warning).toContain('v3');
    expect(result.warning).toContain('v1');
    expect(result.server).toBe('v3');
    expect(result.builtFor).toBe('v1');
  });

  it('warns when the server is older', () => {
    expect(evaluateVersionHandshake('v1', 'v2').compatibility).toBe('server-older');
    expect(evaluateVersionHandshake('v1', 'v2').warning).not.toBeNull();
  });

  it('stays quiet on unknown to avoid false alarms', () => {
    const result = evaluateVersionHandshake(null, 'v1');
    expect(result.compatibility).toBe('unknown');
    expect(result.warning).toBeNull();
  });
});
