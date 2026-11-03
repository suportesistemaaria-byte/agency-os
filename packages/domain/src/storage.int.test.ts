import { afterAll, describe, expect, it } from 'vitest';
import { closeAll } from '@aos/db';
import { PostgresStorage } from './storage';
import { hasDb } from './test-helpers';

describe.skipIf(!hasDb())('storage em Postgres (deploy sem R2)', () => {
  afterAll(closeAll);
  it('grava e lê os mesmos bytes; repetir a chave não sobrescreve', async () => {
    const st = new PostgresStorage();
    const key = `ws/teste/file/x/${crypto.randomUUID()}/a.bin`;
    await st.put(key, new Uint8Array([1, 2, 3, 250]));
    await st.put(key, new Uint8Array([9]));
    expect([...(await st.get(key))]).toEqual([1, 2, 3, 250]);
    await expect(st.get('inexistente')).rejects.toThrow();
  });
  it('recusa arquivo acima de 25 MB', async () => {
    await expect(
      new PostgresStorage().put('ws/x/grande', new Uint8Array(25 * 1024 * 1024 + 1)),
    ).rejects.toThrow(/25 MB/);
  });
});
