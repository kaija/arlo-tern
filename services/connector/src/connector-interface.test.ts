import { ConnectorError, type ConnectorHost } from '@arlo-tern/shared/connector';
import {
  assertReadOnlyConnector,
  createFakeConnector,
  MemorySessionStore,
} from '@arlo-tern/shared/connector/testing';
import { describe, expect, it } from 'vitest';

// The connector interface and its fake live in the shared package so that this service's
// tests, and those of other packages, can use them. This checks that both paths resolve
// from here; the fake's own tests are next to it.
describe('the connector interface, seen from the connector service', () => {
  it('resolves, with a fake that is read-only and can be driven from a test', async () => {
    const states: string[] = [];
    const host: ConnectorHost = {
      sessions: new MemorySessionStore(),
      onLinkState: (event) => void states.push(event.status),
      onConnectionState: (event) => void states.push(event.state),
      onMessage: (event) => void states.push(event.message.content.type),
    };
    const line = createFakeConnector();
    const connector = line.create(host);
    assertReadOnlyConnector(connector);

    await connector.startLink({ userId: 'user-1', linkSessionId: 'link-1' });
    await line.completeLink('link-1');
    await line.deliverMessage('user-1', { content: { type: 'sticker' } });
    expect(states).toEqual(['completed', 'connected', 'sticker']);

    await expect(connector.restore('user-1')).rejects.toBeInstanceOf(ConnectorError);
  });
});
