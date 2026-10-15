import { afterEach, describe, expect, it, vi } from 'vitest';
import { askGroq, GROQ_URL, parseAiAnswer, systemPrompt, testGroq, validateKey } from '../src/ai/groq';

const KEY = 'gsk_' + 'a'.repeat(40);
const good = {
  category: 'sexual_threat', serious: true, risk: 'high',
  summary: 'This is a threat of sexual violence against your family.',
  why: ['“ill fuck ur entire family”'], do: ['Save the chat', 'Report at cybercrime.gov.in'], dont: ['Do not reply'],
  technical: ['Unknown numbers are often second numbers of someone you know.'],
  legal: [{ law: 'BNS 2023', section: '351(3)', why: 'Threat of grave harm' }, { law: 'IPC', section: '506', why: 'old code' }, { law: 'BNS 2023', section: '999', why: 'made up' }],
  replies: [], rewrite: null,
};

afterEach(() => vi.unstubAllGlobals());

describe('Groq answer validation', () => {
  it('keeps only verified law sections and counts the rest as dropped', () => {
    const a = parseAiAnswer(JSON.stringify(good), 'm');
    expect(a.legal).toEqual([{ law: 'BNS 2023', section: '351(3)', why: 'Threat of grave harm' }]);
    expect(a.droppedLegal).toBe(2);
    expect(a.category).toBe('sexual_threat');
  });

  it('strips legal and technical sections when the AI says it is not serious', () => {
    const a = parseAiAnswer(JSON.stringify({ ...good, category: 'abuse', serious: false, risk: 'low' }), 'm');
    expect(a.legal).toEqual([]);
    expect(a.technical).toEqual([]);
  });

  it('recovers JSON wrapped in text, rejects garbage and unknown enums', () => {
    expect(parseAiAnswer('Sure! ' + JSON.stringify(good) + ' hope that helps', 'm').summary).toMatch(/threat/);
    expect(() => parseAiAnswer('no json here', 'm')).toThrow(/JSON/);
    expect(() => parseAiAnswer('{"summary": ""}', 'm')).toThrow(/summary/);
    const odd = parseAiAnswer(JSON.stringify({ ...good, category: 'banana', risk: 'apocalyptic' }), 'm');
    expect(odd.category).toBe('other');
    expect(odd.risk).toBe('low');
  });

  it('limits list lengths', () => {
    const a = parseAiAnswer(JSON.stringify({ ...good, do: Array(20).fill('x'), replies: Array(9).fill('y') }), 'm');
    expect(a.do).toHaveLength(6);
    expect(a.replies).toHaveLength(2);
  });

  it('the prompt contains the verified law list and the abuse rule', () => {
    const p = systemPrompt('safety');
    expect(p).toMatch(/351\(4\)/);
    expect(p).toMatch(/NO legal list/);
  });

  it('validates the key format', () => {
    expect(validateKey('')).toMatch(/Add your Groq API key/);
    expect(validateKey('sk-123')).toMatch(/gsk_/);
    expect(validateKey(KEY)).toBeNull();
  });
});

describe('Groq HTTP calls (mocked fetch)', () => {
  it('sends the documented request and parses the reply', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('openai/gpt-oss-120b');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
      expect(JSON.parse(body.messages[1].content).message).toBe('ill fuck ur entire family');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(good) } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const a = await askGroq({ mode: 'safety', text: 'ill fuck ur entire family', local: {} }, { apiKey: KEY, model: 'openai/gpt-oss-120b' });
    expect(fetchMock.mock.calls[0][0]).toBe(GROQ_URL);
    expect(a.risk).toBe('high');
  });

  it('turns HTTP errors into clear messages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })));
    await expect(askGroq({ mode: 'safety', text: 'x', local: {} }, { apiKey: KEY, model: 'm' })).rejects.toThrow(/API key \(401\)/);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(askGroq({ mode: 'safety', text: 'x', local: {} }, { apiKey: KEY, model: 'm' })).rejects.toThrow(/rate limit/);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(askGroq({ mode: 'safety', text: 'x', local: {} }, { apiKey: KEY, model: 'm' })).rejects.toThrow(/Could not reach Groq/);
  });

  it('never calls the network without a valid key', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(askGroq({ mode: 'safety', text: 'x', local: {} }, { apiKey: '', model: 'm' })).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it('connection test reports missing models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'openai/gpt-oss-20b' }] }), { status: 200 })));
    await expect(testGroq({ apiKey: KEY, model: 'openai/gpt-oss-120b' })).rejects.toThrow(/isn’t available/);
    await expect(testGroq({ apiKey: KEY, model: 'openai/gpt-oss-20b' })).resolves.toMatch(/Connected/);
  });
});
