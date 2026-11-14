import type { Generated } from 'kysely';

// Column descriptors for schema.ts. A descriptor says three things about a column that a
// migration created: its PostgreSQL type, whether it can be NULL, and whether the database
// fills it in when an insert leaves it out. The TypeScript types of the query builder are
// derived from the descriptors, and the database test compares the same descriptors with
// the migrated database, so the types cannot drift from the migrations unnoticed.

/** The PostgreSQL types the schema uses, spelled as `information_schema` reports them. */
export type PostgresType =
  | 'uuid'
  | 'text'
  | 'boolean'
  | 'integer'
  | 'double precision'
  | 'date'
  | 'time without time zone'
  | 'timestamp with time zone'
  | 'jsonb';

export interface Column<Value, Nullable extends boolean, HasDefault extends boolean> {
  readonly type: PostgresType;
  readonly nullable: Nullable;
  readonly hasDefault: HasDefault;
  /** The values a CHECK constraint limits the column to, when it has one. */
  readonly oneOf?: readonly string[];
  /** Carries the TypeScript type only; it is never set. */
  readonly value?: Value;
}

export type AnyColumn = Column<unknown, boolean, boolean>;

/** A JSON object stored as `jsonb`. The work item that owns the column narrows its shape. */
export type JsonObject = Readonly<Record<string, unknown>>;

function column<Value>(type: PostgresType): Column<Value, false, false> {
  return { type, nullable: false, hasDefault: false };
}

export const uuid = () => column<string>('uuid');

export const text = () => column<string>('text');

/** A text column that a CHECK constraint limits to the given values. */
export function oneOf<const Values extends readonly string[]>(
  ...values: Values
): Column<Values[number], false, false> {
  return { ...column<Values[number]>('text'), oneOf: values };
}

export const boolean = () => column<boolean>('boolean');

export const integer = () => column<number>('integer');

export const doublePrecision = () => column<number>('double precision');

/** A calendar date without a time zone, read and written as `YYYY-MM-DD`. */
export const date = () => column<string>('date');

/** A local time of day without a time zone. PostgreSQL returns it as `HH:mm:ss`. */
export const time = () => column<string>('time without time zone');

export const timestamptz = () => column<Date>('timestamp with time zone');

export const jsonb = <Value = JsonObject>() => column<Value>('jsonb');

/** The column accepts NULL. */
export function nullable<Value, HasDefault extends boolean>(
  definition: Column<Value, false, HasDefault>,
): Column<Value, true, HasDefault> {
  return { ...definition, nullable: true };
}

/** The database supplies a value when an insert leaves the column out. */
export function withDefault<Value, Nullable extends boolean>(
  definition: Column<Value, Nullable, false>,
): Column<Value, Nullable, true> {
  return { ...definition, hasDefault: true };
}

type ValueOf<Value, Nullable extends boolean> = Nullable extends true ? Value | null : Value;

/** The Kysely column type of a descriptor. */
export type KyselyColumn<Definition> =
  Definition extends Column<infer Value, infer Nullable, infer HasDefault>
    ? HasDefault extends true
      ? Generated<ValueOf<Value, Nullable>>
      : ValueOf<Value, Nullable>
    : never;

/** The Kysely table type of a record of descriptors. */
export type KyselyTable<Columns> = { [Name in keyof Columns]: KyselyColumn<Columns[Name]> };
