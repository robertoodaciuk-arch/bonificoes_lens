/**
 * Cliente API centralizado — encapsula chamadas IPC com tratamento de erros.
 * Todas as chamadas passam por aqui para logging e tratamento uniforme.
 */

function obterApi() {
  if (typeof window !== 'undefined' && window.api) return window.api;
  return null;
}

/**
 * Executa chamada API com tratamento de erro padronizado.
 * @param {string} nome - Nome da operação (para logs)
 * @param {Function} chamada - Função assíncrona que executa a chamada
 * @returns {Promise<{ok: boolean, dados?: any, erro?: string}>}
 */
async function executar(nome, chamada) {
  const inicio = performance.now();
  try {
    const resultado = await chamada();
    const duracao = Math.round(performance.now() - inicio);
    if (duracao > 1000) {
      console.warn(`[API] ${nome} demorou ${duracao}ms`);
    }
    return { ok: true, dados: resultado, duracaoMs: duracao };
  } catch (err) {
    const duracao = Math.round(performance.now() - inicio);
    console.error(`[API] Erro em ${nome} (${duracao}ms):`, err);
    const mensagem = err?.message || 'Erro desconhecido';
    if (typeof window !== 'undefined' && window.uiToast) {
      window.uiToast.showToast(mensagem, 'error');
    }
    return { ok: false, erro: mensagem, duracaoMs: duracao };
  }
}

/** Importação */
async function importarPreview(caminhoArquivo) {
  const api = obterApi();
  if (!api) return { ok: false, erro: 'API não disponível' };
  return executar('importarPreview', () => api.importPreview(caminhoArquivo));
}

async function importarCommit(dadosImportacao) {
  const api = obterApi();
  if (!api) return { ok: false, erro: 'API não disponível' };
  return executar('importarCommit', () => api.importCommit(dadosImportacao));
}

/** Contatos */
async function buscarContatos() {
  const api = obterApi();
  if (!api) return { ok: false, erro: 'API não disponível' };
  return executar('buscarContatos', () => api.contacts.getAll());
}

async function criarContato(dados) {
  const api = obterApi();
  if (!api) return { ok: false, erro: 'API não disponível' };
  return executar('criarContato', () => api.contacts.create(dados));
}

if (typeof window !== 'undefined') {
  window.apiClient = {
    executar,
    importarPreview,
    importarCommit,
    buscarContatos,
    criarContato,
  };
}

module.exports = {
  executar,
  importarPreview,
  importarCommit,
  buscarContatos,
  criarContato,
};
