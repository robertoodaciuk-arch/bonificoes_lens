const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] preload.js loaded');

contextBridge.exposeInMainWorld('api', {
  importPreview: (payload) => {
    console.log('[Preload] Calling import:preview', payload);
    return ipcRenderer.invoke('import:preview', payload);
  },
  importCommit: (payload) => {
    console.log('[Preload] Calling import:commit', payload);
    return ipcRenderer.invoke('import:commit', payload);
  },
  pickImportFile: () => {
    console.log('[Preload] Calling import:pickFile');
    return ipcRenderer.invoke('import:pickFile');
  },
  contacts: {
    getAll: () => ipcRenderer.invoke('contacts:getAll'),
    create: (data) => ipcRenderer.invoke('contacts:create', data),
    update: (id, data) => ipcRenderer.invoke('contacts:update', { id, data }),
    delete: (id) => ipcRenderer.invoke('contacts:delete', id),
    findMatch: (sellerName) => ipcRenderer.invoke('contacts:findMatch', sellerName),
    getUnmatchedReports: (importId) => ipcRenderer.invoke('contacts:getUnmatchedReports', importId),
    linkReport: (reportId, contactId) => ipcRenderer.invoke('contacts:linkReport', { reportId, contactId }),
    pickImportFile: () => ipcRenderer.invoke('contacts:pickImportFile'),
    importPreview: (payload) => ipcRenderer.invoke('contacts:importPreview', payload),
    importCommit: (payload) => ipcRenderer.invoke('contacts:importCommit', payload),
  },
  wa: {
    getStatus: () => ipcRenderer.invoke('wa:getStatus'),
    getQr: () => ipcRenderer.invoke('wa:getQr'),
    connect: () => ipcRenderer.invoke('wa:connect'),
    logout: () => ipcRenderer.invoke('wa:logout'),
    sendText: (to, text) => ipcRenderer.invoke('wa:sendText', { to, text }),
    sendMedia: (to, caption, mediaPath, mediaType) => ipcRenderer.invoke('wa:sendMedia', { to, caption, mediaPath, mediaType }),
  },
  reportsGenerate: (payload) => ipcRenderer.invoke('reports:generate', payload),
  dispatch: {
    createJob: (importId, config) => ipcRenderer.invoke('dispatch:create-job', importId, config),
    start: (jobId) => ipcRenderer.invoke('dispatch:start', jobId),
    pause: () => ipcRenderer.invoke('dispatch:pause'),
    resume: (jobId) => ipcRenderer.invoke('dispatch:resume', jobId),
    stop: () => ipcRenderer.invoke('dispatch:stop'),
    retryFailed: (jobId) => ipcRenderer.invoke('dispatch:retry-failed', jobId),
    getStatus: () => ipcRenderer.invoke('dispatch:get-status'),
    getJobs: () => ipcRenderer.invoke('dispatch:get-jobs'),
    getDashboard: (jobId) => ipcRenderer.invoke('dispatch:get-dashboard', jobId),
  },
  runtime: {
    isProduction: !process.defaultApp && process.env.MOCK_WHATSAPP !== 'true',
    enableTestHooks: process.env.MOCK_WHATSAPP === 'true',
  },
});
