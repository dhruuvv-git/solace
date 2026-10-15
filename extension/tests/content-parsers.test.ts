import { describe, expect, it } from 'vitest';
import { parseCount, parsePrePlain, profileFromPath, readCounts } from '../src/content/parsers';
import { validateToBackground, platformFromUrl, bytesToBase64, base64ToBytes } from '../src/shared/messaging';

describe('WhatsApp parsing', () => {
  it('reads sender and time from data-pre-plain-text', () => {
    expect(parsePrePlain('[10:21, 15/10/2026] Ravi Kumar: ')).toEqual({ time: '10:21, 15/10/2026', sender: 'Ravi Kumar' });
    expect(parsePrePlain('[9:05 pm, 3/1/2026] +91 98765 43210: ')).toEqual({ time: '9:05 pm, 3/1/2026', sender: '+91 98765 43210' });
    expect(parsePrePlain('garbage')).toEqual({});
    expect(parsePrePlain(null)).toEqual({});
  });
});

describe('Instagram parsing', () => {
  it('recognises profile paths only', () => {
    expect(profileFromPath('/priya.k/')).toBe('priya.k');
    expect(profileFromPath('/explore/')).toBeNull();
    expect(profileFromPath('/p/abc123/')).toBeNull();
    expect(profileFromPath('/direct/inbox/')).toBeNull();
  });
  it('parses counts with K/M/lakh and separators', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('12.5K')).toBe(12500);
    expect(parseCount('1.2M')).toBe(1200000);
    expect(parseCount('3 lakh')).toBe(300000);
    expect(parseCount('87')).toBe(87);
    expect(readCounts('priya.k\nFollow\n12 posts\n1,045 followers\n2,300 following')).toEqual({ posts: 12, followers: 1045, following: 2300 });
    expect(readCounts('no numbers here')).toEqual({ posts: null, followers: null, following: null });
  });
});

describe('message validation (untrusted content-script input)', () => {
  it('accepts well-formed and rejects malformed messages', () => {
    expect(validateToBackground({ type: 'TL_ANALYZE_TEXT', mode: 'kind', text: 'hi' })).not.toBeNull();
    expect(validateToBackground({ type: 'TL_ANALYZE_TEXT', mode: 'eval', text: 'hi' })).toBeNull();
    expect(validateToBackground({ type: 'TL_ANALYZE_TEXT', mode: 'kind', text: 'x'.repeat(20001) })).toBeNull();
    expect(validateToBackground({ type: 'TL_UNKNOWN' })).toBeNull();
    expect(validateToBackground(null)).toBeNull();
    expect(validateToBackground({ type: 'TL_PROFILE_REVIEW', profile: { username: 'a', url: 'https://www.instagram.com/a/', imageUrl: 'javascript:alert(1)' } })).toBeNull();
    expect(validateToBackground({ type: 'TL_PROFILE_REVIEW', profile: { username: 'a', url: 'https://www.instagram.com/a/', followers: -1 } })).toBeNull();
    expect(validateToBackground({ type: 'TL_PROFILE_REVIEW', profile: { username: 'a', url: 'https://www.instagram.com/a/', followers: 10, imageUrl: 'https://scontent.cdninstagram.com/x.jpg' } })).not.toBeNull();
  });
  it('platform detection and base64 round trip', () => {
    expect(platformFromUrl('https://web.whatsapp.com/')).toBe('whatsapp');
    expect(platformFromUrl('https://www.instagram.com/x/')).toBe('instagram');
    expect(platformFromUrl('https://evil.com/web.whatsapp.com')).toBe('web');
    const b = new Uint8Array([0, 1, 2, 250, 255]);
    expect(base64ToBytes(bytesToBase64(b))).toEqual(b);
  });
});
