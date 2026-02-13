/**
 * Store global reativo — gerencia estado da aplicação.
 * Suporta listeners para mudanças de estado.
 */
class Store {
  constructor(estadoInicial = {}) {
    this._estado = { ...estadoInicial };
    this._listeners = new Set();
  }

  /** Retorna cópia do estado atual */
  getEstado() {
    return { ...this._estado };
  }

  /** Retorna valor de uma chave específica */
  get(chave) {
    return this._estado[chave];
  }

  /** Atualiza estado parcialmente e notifica listeners */
  set(parcial) {
    const anterior = { ...this._estado };
    Object.assign(this._estado, parcial);
    for (const cb of this._listeners) {
      try {
        cb(this._estado, anterior);
      } catch {
        // evita que erro de listener quebre o fluxo
      }
    }
  }

  /** Reseta estado para valor inicial */
  reset(estadoInicial = {}) {
    this.set(estadoInicial);
  }

  /** Registra listener de mudança, retorna função de desregistro */
  onChange(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }
}

// Store global singleton para o wizard
const wizardStore = new Store({
  etapaAtual: 1,
  arquivoImportado: null,
  dadosPreview: null,
  configEnvio: null,
  jobId: null,
  waConectado: false,
});

if (typeof window !== 'undefined') {
  window.wizardStore = wizardStore;
}

module.exports = { Store, wizardStore };
