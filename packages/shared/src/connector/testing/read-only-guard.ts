import ts from 'typescript';

import type { Connector } from '../connector.js';

// The guard of the read-only invariant (ADR-0001): a personal account is only ever read.
// The connector interface is the one place where the system touches such an account, so it
// must offer no way to send a message, mark one as read, add a friend or change a setting.
//
// A convention does not survive a busy afternoon, so the surface of `Connector` is pinned
// here and checked three ways:
//
// 1. At compile time. `CONNECTOR_SURFACE` must satisfy `Record<keyof Connector, …>`: a
//    member added to the interface and not listed here, or listed here and not in the
//    interface, fails `pnpm typecheck`.
// 2. In `pnpm test`, against the source. connector.test.ts parses connector.ts and fails
//    unless `Connector` is one interface that extends nothing and has exactly the members
//    listed here, each of the listed kind and type. It also fails when any callable in the
//    module, in any interface, has a name that starts with a verb of `FORBIDDEN_VERBS`.
// 3. In `pnpm test`, against an implementation. `assertReadOnlyConnector(instance)` fails
//    when the object an implementation hands out has any public member beyond this list.
//    Callers are typed against `Connector`, but an extra public method or an exposed
//    platform client would still be one cast away. Every implementation's tests call it.
//
// So adding a capability takes an edit to connector.ts and a matching edit to this file,
// and a reviewer who sees this file in a diff knows what is being asked.
//
// BEFORE YOU ADD A MEMBER: it must only start, stop or observe. If it makes the platform do
// something that the user's contacts, or the user's other devices, could notice (a message,
// a read receipt, a reaction, a friend or group change, a profile or setting change), it
// does not belong here, whatever it is called. That needs a new ADR that supersedes
// ADR-0001, not a longer list.
//
// What the guard cannot do: judge what a method does. A method with a harmless name and a
// harmful body passes. The list of verbs catches the honest mistake; review catches the
// rest, and this file is where review looks.

interface SurfaceMember {
  /** `property` is data; `method` can be called. */
  readonly kind: 'property' | 'method';
  /** The declared type of a property, or the return type of a method, as written. */
  readonly type: string;
}

/** Every member `Connector` may have. Nothing else may be reachable on an implementation. */
export const CONNECTOR_SURFACE = {
  platform: { kind: 'property', type: 'Platform' },
  startLink: { kind: 'method', type: 'Promise<void>' },
  cancelLink: { kind: 'method', type: 'Promise<void>' },
  restore: { kind: 'method', type: 'Promise<void>' },
  disconnect: { kind: 'method', type: 'Promise<DisconnectResult>' },
} as const satisfies Record<keyof Connector, SurfaceMember>;

const surface: Readonly<Record<string, SurfaceMember>> = CONNECTOR_SURFACE;

/**
 * Verbs that name an action on the account. No callable in the connector module may have a
 * name that starts with one, as a whole camelCase word: `sendMessage` and `send` are
 * refused, `sender` is not.
 */
export const FORBIDDEN_VERBS = [
  // Messages.
  'send',
  'reply',
  'post',
  'push',
  'publish',
  'forward',
  'react',
  'unsend',
  'recall',
  'upload',
  // Read state.
  'mark',
  'read',
  'ack',
  'acknowledge',
  // Friends, groups, contacts.
  'add',
  'remove',
  'invite',
  'join',
  'leave',
  'kick',
  'block',
  'unblock',
  'follow',
  'unfollow',
  'accept',
  'reject',
  'create',
  // Profile and settings.
  'update',
  'set',
  'change',
  'edit',
  'rename',
  'mute',
  'unmute',
  'pin',
  'unpin',
] as const;

const forbiddenName = new RegExp(`^(?:${FORBIDDEN_VERBS.join('|')})(?=[A-Z0-9_]|$)`);

/** Whether a member name starts with a forbidden verb. */
export function isForbiddenName(name: string): boolean {
  return forbiddenName.test(name);
}

function parse(sourceText: string): ts.SourceFile {
  return ts.createSourceFile('source.ts', sourceText, ts.ScriptTarget.Latest, true);
}

function typeText(node: ts.TypeNode | undefined, file: ts.SourceFile): string {
  return node === undefined ? '(none)' : node.getText(file).replace(/\s+/g, ' ');
}

/**
 * Checks the declaration of `Connector` in the given source against `CONNECTOR_SURFACE`.
 * Returns one line per violation; an empty list means the declaration is as pinned.
 */
export function inspectConnectorDeclaration(sourceText: string): string[] {
  const file = parse(sourceText);
  const declarations = file.statements
    .filter((statement) => ts.isInterfaceDeclaration(statement))
    .filter((declaration) => declaration.name.text === 'Connector');
  const [declaration] = declarations;
  if (declaration === undefined || declarations.length !== 1) {
    return [`Connector must be declared exactly once, as an interface`];
  }

  const violations: string[] = [];
  if (declaration.heritageClauses !== undefined) {
    violations.push('Connector must not extend another interface');
  }

  const seen = new Set<string>();
  for (const member of declaration.members) {
    if (!ts.isMethodSignature(member) && !ts.isPropertySignature(member)) {
      violations.push('Connector has a member that is neither a method nor a property');
      continue;
    }
    if (!ts.isIdentifier(member.name)) {
      violations.push('Connector has a member whose name is not a plain identifier');
      continue;
    }
    const name = member.name.text;
    seen.add(name);
    const pinned = surface[name];
    if (pinned === undefined) {
      violations.push(`Connector has a member that is not pinned: ${name}`);
      continue;
    }
    if (member.questionToken !== undefined) {
      violations.push(`${name} must not be optional`);
    }
    const kind = ts.isMethodSignature(member) ? 'method' : 'property';
    if (kind !== pinned.kind) {
      violations.push(`${name} must be a ${pinned.kind}, not a ${kind}`);
    }
    const type = typeText(member.type, file);
    if (type !== pinned.type) {
      violations.push(`${name} must have the type ${pinned.type}, not ${type}`);
    }
    const readonly = member.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword,
    );
    if (kind === 'property' && readonly !== true) {
      violations.push(`${name} must be readonly`);
    }
  }
  for (const name of Object.keys(surface)) {
    if (!seen.has(name)) violations.push(`Connector lacks the pinned member ${name}`);
  }
  return violations;
}

function isFunction(node: ts.Node | undefined): boolean {
  return node !== undefined && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function mentionsFunctionType(node: ts.TypeNode | undefined): boolean {
  if (node === undefined) return false;
  if (ts.isFunctionTypeNode(node) || ts.isConstructorTypeNode(node)) return true;
  return (
    ts.forEachChild(node, (child) => ts.isTypeNode(child) && mentionsFunctionType(child)) === true
  );
}

/** The name of the node when it declares something that can be called. */
function callableName(node: ts.Node): string | undefined {
  let name: ts.PropertyName | ts.BindingName | undefined;
  if (
    ts.isMethodSignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  ) {
    name = node.name;
  } else if (ts.isPropertySignature(node)) {
    if (mentionsFunctionType(node.type)) name = node.name;
  } else if (ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) {
    if (mentionsFunctionType(node.type) || isFunction(node.initializer)) name = node.name;
  } else if (ts.isPropertyAssignment(node)) {
    if (isFunction(node.initializer)) name = node.name;
  }
  if (name === undefined) return undefined;
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/**
 * Finds the callables in the given source whose name starts with a forbidden verb: methods
 * and function-typed properties of any interface, type or class, and functions. Returns
 * their names.
 */
export function findForbiddenCallables(sourceText: string): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    const name = callableName(node);
    if (name !== undefined && isForbiddenName(name)) found.push(name);
    ts.forEachChild(node, visit);
  };
  visit(parse(sourceText));
  return found;
}

/**
 * Checks what is reachable on an object that an implementation hands out as its
 * `Connector`: its own members and those of its prototypes. Returns one line per violation.
 *
 * Implementations keep their helpers and their platform client out of reach, in a closure
 * or in `#private` fields. A TypeScript `private` member is still a property at run time
 * and is reported.
 */
export function inspectConnectorInstance(instance: object): string[] {
  const violations: string[] = [];
  const names = new Set<string>();
  for (
    let object: object | null = instance;
    object !== null && object !== Object.prototype;
    object = Object.getPrototypeOf(object) as object | null
  ) {
    for (const key of Reflect.ownKeys(object)) {
      if (typeof key === 'symbol') {
        violations.push(`the connector has a symbol-keyed member: ${key.toString()}`);
      } else if (key !== 'constructor') {
        names.add(key);
      }
    }
  }

  const values = instance as Record<string, unknown>;
  for (const name of names) {
    const pinned = surface[name];
    if (pinned === undefined) {
      violations.push(`the connector has a public member that is not pinned: ${name}`);
      continue;
    }
    const kind = typeof values[name] === 'function' ? 'method' : 'property';
    if (kind !== pinned.kind) {
      violations.push(`${name} must be a ${pinned.kind}, not a ${kind}`);
    }
  }
  for (const name of Object.keys(surface)) {
    if (!names.has(name)) violations.push(`the connector lacks the pinned member ${name}`);
  }
  return violations;
}

/**
 * Throws when the object has any public member beyond `CONNECTOR_SURFACE`. The tests of
 * every `Connector` implementation call this on the object its factory returns.
 */
export function assertReadOnlyConnector(connector: Connector): void {
  const violations = inspectConnectorInstance(connector);
  if (violations.length > 0) {
    throw new Error(`Not a read-only connector:\n- ${violations.join('\n- ')}`);
  }
}
