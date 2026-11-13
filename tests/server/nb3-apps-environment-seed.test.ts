// @vitest-environment node
import { describe, expect, it } from 'vitest';
import seed from '../../database/main/seeds/202611130001_ds_nb3_apps_environment.js';

type Row = Record<string, unknown>;

/** Just enough of the query builder for the seed: one table per call, `where` filters on equality and `is null`. */
function fakeQuery(tables: Record<string, Row[]>) {
  const builder = (table: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let patch: Row | null = null;
    const matching = () =>
      (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    const chain = {
      select: () => chain,
      set: (values: Row) => {
        patch = values;
        return chain;
      },
      where: (column: string, op: string, value: unknown) => {
        filters.push((row) =>
          op === 'is' ? row[column] == null : row[column] === value,
        );
        return chain;
      },
      execute: () => {
        const rows = matching();
        if (patch) for (const row of rows) Object.assign(row, patch);
        return Promise.resolve(rows);
      },
      executeTakeFirst: () => Promise.resolve(matching()[0]),
    };
    return chain;
  };
  return { selectFrom: builder, updateTable: builder };
}

describe('seed 202611130001: give old NB3 App rows their environment', () => {
  it('fills only rows without one, from the App, and leaves unknown Apps alone', async () => {
    const tables = {
      dsNb3Apps: [
        { appId: 'a', environmentId: null },
        { appId: 'b', environmentId: 'kept' },
        { appId: 'gone', environmentId: null },
      ],
      relApps: [
        { id: 'a', environmentId: 'env-1' },
        { id: 'b', environmentId: 'env-2' },
      ],
    };
    const run = () => seed.run({ query: fakeQuery(tables) } as never);
    await run();
    expect(tables.dsNb3Apps.map((row) => row.environmentId)).toEqual([
      'env-1',
      'kept',
      null,
    ]);
    // Running it again changes nothing.
    await run();
    expect(tables.dsNb3Apps.map((row) => row.environmentId)).toEqual([
      'env-1',
      'kept',
      null,
    ]);
  });
});
