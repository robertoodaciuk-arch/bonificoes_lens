class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(data);
  }
}

module.exports = { EventBus };
