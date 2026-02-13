/**
 * Barramento de eventos — pub/sub para comunicação entre componentes.
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /** Registra listener para evento, retorna função de desregistro */
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event).delete(callback);
  }

  /** Remove listener específico de um evento */
  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  /** Emite evento para todos os listeners registrados */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(data);
  }
}

module.exports = { EventBus };
