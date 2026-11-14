import {
  boolean,
  date,
  doublePrecision,
  integer,
  jsonb,
  nullable,
  oneOf,
  text,
  time,
  timestamptz,
  uuid,
  withDefault,
  type AnyColumn,
  type KyselyTable,
} from './columns.js';

// The tables of design §4.2 as the migrations leave them: one descriptor per column. The
// query builder's types are derived from this file, and the database test fails when it
// disagrees with the migrated database. A migration that adds, removes or changes a column
// changes its descriptor here in the same commit.
//
// The conventions (identifiers, defaults, which columns have a CHECK, delete behaviour) are
// recorded in design §14 under 工具與專案結構.

const id = () => withDefault(uuid());
const createdAt = () => withDefault(timestamptz());
const updatedAt = () => withDefault(timestamptz());

/** `user_id` is on every business table; the data-access layer scopes every query by it. */
const userId = () => uuid();

const agentChannel = () => oneOf('app', 'line_oa', 'whatsapp_oa');
const changeActor = () => oneOf('pipeline', 'agent', 'user');
const oaPlatform = () => oneOf('line', 'whatsapp');

/** A score between 0 and 1. */
const confidence = () => doublePrecision();

export const tables = {
  // --- Identity and consent ---
  users: {
    id: id(),
    google_sub: text(),
    email: text(),
    display_name: text(),
    created_at: createdAt(),
  },
  /** The beta invite list. Not user data: it is keyed by a lower-case email address. */
  invites: {
    email: text(),
    created_at: createdAt(),
  },
  /** Published consent documents. Not user data. */
  consent_documents: {
    type: text(),
    version: text(),
    title: text(),
    url: text(),
    published_at: timestamptz(),
  },
  consent_records: {
    id: id(),
    user_id: userId(),
    type: text(),
    version: text(),
    accepted_at: timestamptz(),
  },
  refresh_tokens: {
    token_hash: text(),
    user_id: userId(),
    /** The identifier the app generated on the device; not a row of `devices`. */
    device_id: text(),
    family_id: uuid(),
    expires_at: timestamptz(),
    revoked_at: nullable(timestamptz()),
  },
  devices: {
    user_id: userId(),
    device_id: text(),
    platform: oneOf('ios', 'android'),
    fcm_token: text(),
    updated_at: updatedAt(),
  },
  user_settings: {
    user_id: userId(),
    retention_days: integer(),
    time_zone: text(),
    quiet_hours_start: time(),
    quiet_hours_end: time(),
    notify_task_reminders: boolean(),
    notify_scam_alerts: boolean(),
    notify_connection_status: boolean(),
    notify_agent_results: boolean(),
  },

  // --- LINE connection and messages ---
  line_connections: {
    user_id: userId(),
    status: oneOf('not_linked', 'connected', 'reconnecting', 'expired'),
    /** Plain, by decision (ADR-0005). */
    credentials: nullable(jsonb()),
    linked_at: nullable(timestamptz()),
    last_event_at: nullable(timestamptz()),
  },
  line_link_sessions: {
    id: id(),
    user_id: userId(),
    status: oneOf(
      'pending',
      'awaiting_scan',
      'awaiting_verification',
      'completed',
      'failed',
      'expired',
      'cancelled',
    ),
    qr_payload: nullable(text()),
    verification_code: nullable(text()),
    failure_reason: nullable(text()),
    expires_at: timestamptz(),
  },
  conversations: {
    id: id(),
    user_id: userId(),
    platform: oneOf('line'),
    external_id: text(),
    type: oneOf('direct', 'group', 'official_account'),
    name: text(),
    /** NULL applies the default of the conversation type. */
    ingestion_override: nullable(oneOf('include', 'exclude')),
    first_seen_at: timestamptz(),
    last_message_at: nullable(timestamptz()),
  },
  messages: {
    id: id(),
    user_id: userId(),
    conversation_id: uuid(),
    external_id: text(),
    sender_external_id: text(),
    sender_name: text(),
    direction: oneOf('incoming', 'outgoing'),
    content_type: text(),
    /** Plain, by decision (ADR-0005). NULL for a message that is not text. */
    text: nullable(text()),
    sent_at: timestamptz(),
    received_at: timestamptz(),
  },
  pipeline_windows: {
    id: id(),
    user_id: userId(),
    conversation_id: uuid(),
    status: text(),
    first_message_at: timestamptz(),
    last_message_at: timestamptz(),
    message_count: integer(),
    /** NULL while the window is unprocessed; a conversation has at most one such window. */
    processed_at: nullable(timestamptz()),
  },

  // --- Tasks and reminders ---
  tasks: {
    id: id(),
    user_id: userId(),
    title: text(),
    date: date(),
    time: nullable(time()),
    all_day: boolean(),
    category: text(),
    status: oneOf('active', 'completed', 'cancelled'),
    source: oneOf('pipeline', 'user', 'agent'),
    confidence: nullable(confidence()),
    user_modified: boolean(),
    source_conversation_id: nullable(uuid()),
    /** Becomes NULL when the source message is deleted (ADR-0004). */
    source_message_id: nullable(uuid()),
    trip_id: nullable(uuid()),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  task_proposals: {
    id: id(),
    user_id: userId(),
    kind: oneOf('create', 'update', 'cancel'),
    task_id: nullable(uuid()),
    proposed: jsonb(),
    confidence: confidence(),
    status: oneOf('pending', 'accepted', 'rejected', 'superseded'),
    source_conversation_id: nullable(uuid()),
    /** Becomes NULL when the source message is deleted (ADR-0004). */
    source_message_id: nullable(uuid()),
    created_at: createdAt(),
  },
  task_changes: {
    id: id(),
    user_id: userId(),
    task_id: uuid(),
    actor: changeActor(),
    before: nullable(jsonb()),
    after: nullable(jsonb()),
    created_at: createdAt(),
    reverted_at: nullable(timestamptz()),
  },
  reminders: {
    id: id(),
    user_id: userId(),
    task_id: uuid(),
    remind_at: timestamptz(),
    status: oneOf('scheduled', 'sent', 'cancelled'),
    origin: oneOf('ai', 'user'),
    user_modified: boolean(),
  },

  // --- Suspicious messages ---
  scam_alerts: {
    id: id(),
    user_id: userId(),
    conversation_id: uuid(),
    category: text(),
    confidence: confidence(),
    level: oneOf('high', 'medium'),
    /** One sentence written by the model. It never quotes the message (ADR-0009). */
    reason: text(),
    status: oneOf('open', 'dismissed'),
    feedback: nullable(oneOf('not_scam', 'confirmed_scam')),
    /** Becomes NULL when the source message is deleted (ADR-0004). */
    source_message_id: nullable(uuid()),
    created_at: createdAt(),
  },

  // --- Travel ---
  trips: {
    id: id(),
    user_id: userId(),
    name: text(),
    destination: text(),
    start_date: date(),
    end_date: date(),
    time_zone: text(),
    status: oneOf('planning', 'confirmed', 'completed', 'cancelled'),
    notes: nullable(text()),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  itinerary_items: {
    id: id(),
    user_id: userId(),
    trip_id: uuid(),
    date: date(),
    start_time: time(),
    end_time: nullable(time()),
    type: text(),
    title: text(),
    notes: nullable(text()),
    place: nullable(jsonb()),
    transport: nullable(jsonb()),
    position: integer(),
  },
  trip_changes: {
    id: id(),
    user_id: userId(),
    trip_id: uuid(),
    /** The changed item, or NULL for a change to the trip itself. Not a foreign key. */
    item_id: nullable(uuid()),
    actor: changeActor(),
    before: nullable(jsonb()),
    after: nullable(jsonb()),
    created_at: createdAt(),
    reverted_at: nullable(timestamptz()),
  },

  // --- Agent ---
  memory_entries: {
    id: id(),
    user_id: userId(),
    content: text(),
    source_channel: agentChannel(),
    created_at: createdAt(),
    updated_at: updatedAt(),
  },
  agent_conversations: {
    id: id(),
    user_id: userId(),
    channel: agentChannel(),
    title: nullable(text()),
    created_at: createdAt(),
    last_message_at: nullable(timestamptz()),
  },
  agent_messages: {
    id: id(),
    user_id: userId(),
    conversation_id: uuid(),
    role: oneOf('user', 'assistant'),
    channel: agentChannel(),
    content: text(),
    status: oneOf('completed', 'in_progress', 'failed'),
    created_at: createdAt(),
  },
  agent_runs: {
    id: id(),
    user_id: userId(),
    conversation_id: uuid(),
    status: text(),
    started_at: timestamptz(),
    finished_at: nullable(timestamptz()),
    delivery: nullable(text()),
  },

  // --- Official accounts ---
  oa_bindings: {
    user_id: userId(),
    platform: oaPlatform(),
    external_user_id: text(),
    bound_at: timestamptz(),
  },
  oa_binding_codes: {
    code_hash: text(),
    user_id: userId(),
    platform: oaPlatform(),
    expires_at: timestamptz(),
    used_at: nullable(timestamptz()),
  },
  whatsapp_outbound_log: {
    id: id(),
    /** NULL for a reply to a sender who is not bound, and after the user is deleted. */
    user_id: nullable(userId()),
    kind: text(),
    sent_at: timestamptz(),
  },

  // --- Notifications ---
  notifications: {
    id: id(),
    user_id: userId(),
    type: text(),
    title: text(),
    ref_type: nullable(text()),
    /** The identifier of the resource `ref_type` names. Not a foreign key. */
    ref_id: nullable(uuid()),
    read_at: nullable(timestamptz()),
    created_at: createdAt(),
  },
} satisfies Record<string, Record<string, AnyColumn>>;

export type TableName = keyof typeof tables;

/** The database as the query builder sees it: `Kysely<Database>`. */
export type Database = { [Name in TableName]: KyselyTable<(typeof tables)[Name]> };

/**
 * Tables that hold no user data and so have no `user_id`: the invite list and the published
 * consent documents. Every other table is a business table and is scoped by user.
 */
export const GLOBAL_TABLES = [
  'invites',
  'consent_documents',
] as const satisfies readonly TableName[];
