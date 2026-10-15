import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
// Website implementation is plain JavaScript and currently has no declaration files.
// @ts-expect-error The test only exercises its runtime contract.
import { buildReport, emptyDraft, gaps } from '../../src/lib/report.js';
// @ts-expect-error The test only exercises its runtime contract.
import { deleteRecord, listRecords, sealFile, verifyFile } from '../../src/lib/vault.js';

type Draft = Record<string, any>;
type Evidence = { id: string; name: string; size: number; type: string; hash: string; lastModified: number | null; caption: string; isImage: boolean };
const emptyDraftForTest = emptyDraft as (user: { id: string; name: string; email: string }) => Draft;
const gapsForTest = gaps as (draft: Draft, files: Evidence[]) => Array<[string, string]>;
const buildReportForTest = buildReport as (draft: Draft, files: Evidence[], vault: unknown[]) => { photos: Evidence[]; statement: string[]; summary: Array<[string, string]> };
const sealFileForTest = sealFile as (userId: string, file: File) => Promise<Evidence>;
const listRecordsForTest = listRecords as (userId: string) => Promise<Evidence[]>;
const verifyFileForTest = verifyFile as (record: Evidence, file: File) => Promise<boolean>;

describe('website report requirements', () => {
  it('requires a date and proof, then allows optional incident details to stay blank', () => {
    const draft = emptyDraftForTest({ id: 'report-test', name: 'Dhruv', email: 'dhruv@example.com' });
    expect(gapsForTest(draft, []).filter(([severity]) => severity === 'bad').map(([, message]) => message)).toEqual([
      'Enter the date it happened or the date you found out.',
      'Add at least one photo, screenshot, or other proof file before making the report.',
    ]);

    draft.discoveredAt = '2026-10-15T17:00';
    const evidence = [{ id: 'proof-1', name: 'capture.txt', size: 4, type: 'text/plain', hash: 'abcd', lastModified: null, caption: '', isImage: false }];
    expect(gapsForTest(draft, evidence).some(([severity]) => severity === 'bad')).toBe(false);
    const report = buildReportForTest(draft, evidence, []);
    expect(report.photos).toHaveLength(1);
    expect(report.statement.join(' ')).toContain('unable to provide further details');
    expect(report.summary.find(([label]) => label === 'Date / time discovered')?.[1]).not.toBe('—');
  });
});

describe('website evidence vault', () => {
  it('seals, lists, verifies, and deletes arbitrary evidence files locally', async () => {
    const userId = `vault-test-${Date.now()}`;
    const original = new File(['original evidence'], 'evidence.bin', { type: 'application/octet-stream' });
    const record = await sealFileForTest(userId, original);

    expect((await listRecordsForTest(userId)).map((item) => item.id)).toContain(record.id);
    expect(await verifyFileForTest(record, original)).toBe(true);
    expect(await verifyFileForTest(record, new File(['changed evidence'], 'evidence.bin', { type: 'application/octet-stream' }))).toBe(false);

    await deleteRecord(record.id);
    expect(await listRecordsForTest(userId)).toEqual([]);
  });
});
