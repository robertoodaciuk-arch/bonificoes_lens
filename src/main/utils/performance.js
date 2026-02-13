/**
 * Monitor de performance — rastreia tempos de operações críticas.
 * Uso: const fim = perf.iniciar('importacao'); ... fim();
 */

const metricas = new Map();

/**
 * Inicia cronômetro para uma operação.
 * @param {string} operacao - Nome da operação
 * @returns {Function} Função para finalizar e registrar a métrica
 */
function iniciar(operacao) {
  const inicio = performance.now();
  return () => {
    const duracao = Math.round(performance.now() - inicio);
    registrar(operacao, duracao);
    return duracao;
  };
}

/**
 * Registra manualmente uma métrica de duração.
 * @param {string} operacao - Nome da operação
 * @param {number} duracaoMs - Duração em milissegundos
 */
function registrar(operacao, duracaoMs) {
  if (!metricas.has(operacao)) {
    metricas.set(operacao, { contagem: 0, totalMs: 0, minMs: Infinity, maxMs: 0 });
  }
  const m = metricas.get(operacao);
  m.contagem += 1;
  m.totalMs += duracaoMs;
  if (duracaoMs < m.minMs) m.minMs = duracaoMs;
  if (duracaoMs > m.maxMs) m.maxMs = duracaoMs;
}

/**
 * Retorna resumo de todas as métricas coletadas.
 * @returns {Object} Mapa de operação para estatísticas
 */
function resumo() {
  const resultado = {};
  for (const [op, m] of metricas) {
    resultado[op] = {
      contagem: m.contagem,
      mediaMs: m.contagem > 0 ? Math.round(m.totalMs / m.contagem) : 0,
      minMs: m.minMs === Infinity ? 0 : m.minMs,
      maxMs: m.maxMs,
      totalMs: m.totalMs,
    };
  }
  return resultado;
}

/** Limpa todas as métricas coletadas */
function limpar() {
  metricas.clear();
}

module.exports = { iniciar, registrar, resumo, limpar };
