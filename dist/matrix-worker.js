importScripts('matrix-core.js');
self.onmessage = async event => {
  const { action, payload } = event.data;
  try {
    let result;
    const options = { ...payload.options, onProgress: value => self.postMessage({ type: 'progress', value }) };
    if (action === 'parse') result = await SNPMatrix.parse(payload.text, options);
    else if (action === 'build') result = await SNPMatrix.build(payload.parsed, options);
    else if (action === 'qc') result = await SNPMatrix.qc(payload.matrix, payload.config);
    else throw Error('未知矩阵操作');
    const transfers = result?.values ? [result.values.buffer, result.y.buffer] : [];
    self.postMessage({ type: 'done', result }, transfers);
  } catch (error) { self.postMessage({ type: 'error', message: error.message, issues: error.issues || [] }); }
};
