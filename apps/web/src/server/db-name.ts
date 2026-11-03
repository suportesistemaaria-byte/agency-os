import 'server-only';
import { eq } from 'drizzle-orm';
import { schema as s } from '@aos/db';
import { read, type Ctx } from '@aos/domain';

export const db = {
  async workspaceName(ctx: Ctx) {
    return read(
      ctx,
      async (tx) =>
        (
          await tx
            .select({ n: s.workspaces.name })
            .from(s.workspaces)
            .where(eq(s.workspaces.id, ctx.workspaceId))
        )[0]?.n ?? '',
    );
  },
};
