import { Prisma } from '@prisma/client';

/**
 * Models that implement soft delete via the `deletedAt` column.
 * Excluded: Authentication, Bookmark, Document (per database-design.md §4).
 */
const SOFT_DELETE_MODELS = new Set<string>([
  'User',
  'Company',
  'Category',
  'Job',
  'Application',
]);

type ArgsWithWhere = { where?: Record<string, unknown> } & Record<
  string,
  unknown
>;

/**
 * Prisma Client Extension that:
 *  1. Auto-filters `deletedAt: null` on read queries (`find*`, `count`,
 *     `aggregate`, `groupBy`).
 *  2. Converts `delete` / `deleteMany` calls into soft-delete updates that
 *     set `deletedAt = now()`.
 *
 * Hard delete is still possible via `$executeRaw` if absolutely required.
 */
export const softDeleteExtension = Prisma.defineExtension((client) => {
  return client.$extends({
    name: 'softDelete',
    query: {
      $allModels: {
        async findUnique({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async findUniqueOrThrow({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async findFirst({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async findFirstOrThrow({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async findMany({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async count({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async aggregate({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async groupBy({ model, args, query }) {
          return SOFT_DELETE_MODELS.has(model)
            ? query(withNotDeleted(args))
            : query(args);
        },
        async delete({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const a = args as unknown as ArgsWithWhere;
          const delegate = (
            client as unknown as Record<
              string,
              { update: (x: unknown) => unknown }
            >
          )[lowerFirst(model)];
          return delegate.update({
            where: a.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany({ model, args, query }) {
          if (!SOFT_DELETE_MODELS.has(model)) return query(args);
          const a = args as unknown as ArgsWithWhere;
          const delegate = (
            client as unknown as Record<
              string,
              { updateMany: (x: unknown) => unknown }
            >
          )[lowerFirst(model)];
          return delegate.updateMany({
            where: injectNotDeletedWhere(a.where),
            data: { deletedAt: new Date() },
          });
        },
      },
    },
  });
});

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function withNotDeleted<T>(args: T): T {
  const a = args as unknown as ArgsWithWhere;
  const next: ArgsWithWhere = {
    ...a,
    where: injectNotDeletedWhere(a.where),
  };
  return next as unknown as T;
}

function injectNotDeletedWhere(
  where: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!where) return { deletedAt: null };
  // Respect explicit deletedAt filter if caller already specified one.
  if ('deletedAt' in where) return where;
  return { ...where, deletedAt: null };
}
