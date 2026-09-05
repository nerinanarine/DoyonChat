import { RunRegistry } from '../src/registry';

describe('RunRegistry conversation in-flight guard', () => {
  it('tracks conversationId on created runs', () => {
    const registry = new RunRegistry(10, 60_000);
    const record = registry.create('run-1', 'conv-1');
    expect(record.conversationId).toBe('conv-1');
    expect(registry.create('run-2').conversationId).toBeUndefined();
    registry.dispose();
  });

  it('detects an active run for the same conversation', () => {
    const registry = new RunRegistry(10, 60_000);
    registry.create('run-1', 'conv-1');
    expect(registry.hasActiveRunForConversation('conv-1')).toBe(true);
    expect(registry.hasActiveRunForConversation('conv-2')).toBe(false);
    registry.dispose();
  });

  it('releases the guard once the run is no longer running', () => {
    const registry = new RunRegistry(10, 60_000);
    registry.create('run-1', 'conv-1');
    registry.complete('run-1', 'done');
    expect(registry.hasActiveRunForConversation('conv-1')).toBe(false);

    registry.create('run-2', 'conv-2');
    registry.fail('run-2', 'timeout');
    expect(registry.hasActiveRunForConversation('conv-2')).toBe(false);
    registry.dispose();
  });

  it('does not block different conversations running concurrently', () => {
    const registry = new RunRegistry(10, 60_000);
    registry.create('run-1', 'conv-1');
    registry.create('run-2', 'conv-2');
    expect(registry.hasActiveRunForConversation('conv-1')).toBe(true);
    expect(registry.hasActiveRunForConversation('conv-2')).toBe(true);
    registry.dispose();
  });

  it('caps stored events and marks truncation', () => {
    const registry = new RunRegistry(10, 60_000);
    registry.create('run-1');
    for (let i = 0; i < 2005; i++) {
      registry.appendEvent('run-1', { type: 'message_update', index: i });
    }
    const record = registry.get('run-1');
    expect(record?.events).toHaveLength(2000);
    expect(record?.truncated).toBe(true);
    expect(record?.events[0]).toEqual({ type: 'message_update', index: 0 });
    registry.dispose();
  });
});