/* Browser-local SNP import and descriptive QC. No training or association tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SNPMatrix = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const LIMITS = { bytes: 10 * 1024 * 1024, cells: 2000000, samples: 100000, columns: 50000 };
  class MatrixError extends Error {
    constructor(message, issues = []) { super(message); this.name = 'MatrixError'; this.issues = issues; }
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));
  function checkAbort(signal) { if (signal?.aborted) throw new DOMException('导入已取消', 'AbortError'); }
  function detect(text) {
    const first = text.split(/\r\n|\r|\n/).find(line => line.trim()) || '';
    const counts = { ',': 0, '\t': 0, ';': 0 }; let quoted = false;
    for (let i = 0; i < first.length; i++) {
      if (first[i] === '"') { if (quoted && first[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted && first[i] in counts) counts[first[i]]++;
    }
    const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    return counts[best] ? best : 'whitespace';
  }
  async function parse(text, options = {}) {
    text = text.replace(/^\uFEFF/, '');
    if (!text.trim()) throw new MatrixError('文件为空；需要表头和至少 2 个样本。');
    if (text.length > LIMITS.bytes) throw new MatrixError('文本超过 10 MB，请分批导入。');
    if (text.includes('\u0000')) throw new MatrixError('文件包含零字节，请转换为 UTF-8 文本。');
    const delimiter = options.delimiter && options.delimiter !== 'auto' ? options.delimiter : detect(text);
    if (![',', '\t', ';', 'whitespace'].includes(delimiter)) throw new MatrixError('不支持的分隔符。');
    const records = []; let cells = 0;
    function add(values, line) {
      if (values.every(v => v === '')) return;
      if (values.length > LIMITS.columns) throw new MatrixError('列数超过 50,000，请拆分矩阵。');
      cells += values.length;
      if (cells > LIMITS.cells) throw new MatrixError('超过 2,000,000 个单元格，请拆分矩阵。');
      if (records.length > LIMITS.samples) throw new MatrixError('超过 100,000 个样本。');
      records.push({ values, line });
    }
    if (delimiter === 'whitespace') {
      const lines = text.split(/\r\n|\r|\n/);
      for (let i = 0; i < lines.length; i++) {
        if (i % 1000 === 0) { checkAbort(options.signal); await pause(); }
        if (!lines[i].trim()) continue;
        if (lines[i].includes('"')) throw new MatrixError('空白分隔文本不支持带引号字段；请转为 CSV / TSV。');
        add(lines[i].trim().split(/\s+/), i + 1);
      }
    } else {
      let row = [], value = '', inQuote = false, closed = false, line = 1, startLine = 1;
      for (let i = 0; i < text.length; i++) {
        if (i % 100000 === 0) { checkAbort(options.signal); options.onProgress?.(Math.round(i / text.length * 100)); await pause(); }
        const c = text[i];
        if (inQuote) {
          if (c === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else { inQuote = false; closed = true; } }
          else { value += c; if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++; }
          continue;
        }
        if (c === '"') {
          if (value !== '' || closed) throw new MatrixError(`第 ${line} 行：引号必须位于字段开头。`);
          inQuote = true;
        } else if (c === delimiter) { row.push(value.trim()); value = ''; closed = false; }
        else if (c === '\r' || c === '\n') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(value.trim()); add(row, startLine); row = []; value = ''; closed = false; line++; startLine = line;
        } else {
          if (closed && !/\s/.test(c)) throw new MatrixError(`第 ${line} 行：结束引号后存在无效字符。`);
          value += c;
        }
      }
      if (inQuote) throw new MatrixError(`第 ${startLine} 行：引号未闭合。`);
      row.push(value.trim()); add(row, startLine);
    }
    checkAbort(options.signal);
    if (records.length < 3) throw new MatrixError('至少需要一行表头和 2 个样本；不支持 SNP 按行的转置矩阵。');
    const header = records.shift().values;
    if (header.length < 2) throw new MatrixError('至少需要样本 ID 和一个 SNP 列；检查分隔符是否正确。');
    const seen = new Set();
    for (const name of header) {
      if (!name || /[\r\n]/.test(name)) throw new MatrixError('表头不能为空或包含换行。');
      if (seen.has(name)) throw new MatrixError(`表头重复：${name}`);
      seen.add(name);
    }
    const issues = records.filter(r => r.values.length !== header.length).slice(0, 30).map(r => ({ line: r.line, column: '整行', message: `实际 ${r.values.length} 列，应为 ${header.length} 列` }));
    if (issues.length) throw new MatrixError('行列数不一致；请检查尾部分隔符、缺失字段或分隔符设置。', issues);
    return { header, records, delimiter };
  }
  const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  async function build(parsed, options = {}) {
    const { header, records } = parsed;
    const idColumn = Number(options.idColumn), phenotypeColumn = options.phenotypeColumn === '' || options.phenotypeColumn === null || options.phenotypeColumn === undefined ? -1 : Number(options.phenotypeColumn);
    const excluded = new Set((options.excluded || []).map(Number));
    if (!Number.isInteger(idColumn) || idColumn < 0 || idColumn >= header.length || (phenotypeColumn !== -1 && (!Number.isInteger(phenotypeColumn) || phenotypeColumn < 0 || phenotypeColumn >= header.length || idColumn === phenotypeColumn))) throw new MatrixError('样本 ID 与表型必须映射到不同的有效列；描述性质控可不选择表型列。');
    if (!['hardcall', 'dosage'].includes(options.genotypeMode || 'hardcall')) throw new MatrixError('请选择有效的基因型编码。');
    if (phenotypeColumn !== -1 && !['01', '12'].includes(options.phenotypeMode || '01')) throw new MatrixError('请选择有效的表型编码。');
    if ([...excluded].some(i => !Number.isInteger(i) || i < 0 || i >= header.length || i === idColumn || i === phenotypeColumn)) throw new MatrixError('忽略列不能包含样本 ID 或表型列。');
    const snpColumns = header.map((_, i) => i).filter(i => i !== idColumn && i !== phenotypeColumn && !excluded.has(i));
    if (!snpColumns.length) throw new MatrixError('至少保留一个 SNP 列。');
    const missingTokens = new Set(['', ...(options.missingTokens || ['NA', 'NaN', '.'])].map(v => v.trim().toUpperCase()));
    for (const token of missingTokens) if (token && numberPattern.test(token) && Number(token) >= 0 && Number(token) <= 2) throw new MatrixError('缺失标记不能使用 0–2 范围内的有效基因型。');
    const n = records.length, m = snpColumns.length, values = new Float64Array(n * m), y = new Uint8Array(n), ids = [], samples = [], issues = [], seen = new Set(), variants = snpColumns.map(i => ({ id: header[i], sourceColumn: i, called: 0, missing: 0, sum: 0, min: Infinity, max: -Infinity }));
    const pushIssue = issue => { if (issues.length < 30) issues.push(issue); };
    for (let i = 0; i < n; i++) {
      if (i % 250 === 0) { checkAbort(options.signal); options.onProgress?.(Math.round(i / n * 100)); await pause(); }
      const r = records[i], id = r.values[idColumn], pheno = phenotypeColumn === -1 ? null : r.values[phenotypeColumn];
      if (!id || /[\r\n\u0000-\u001f]/.test(id)) pushIssue({ line: r.line, column: header[idColumn], message: '样本 ID 为空或包含控制字符' });
      if (seen.has(id)) pushIssue({ line: r.line, column: header[idColumn], message: `重复样本 ID：${id}` });
      seen.add(id); ids.push(id);
      const allowed = options.phenotypeMode === '12' ? ['1', '2'] : ['0', '1'];
      if (phenotypeColumn !== -1 && !allowed.includes(pheno)) pushIssue({ line: r.line, column: header[phenotypeColumn], message: `表型应为 ${allowed.join(' / ')}，实际为“${pheno || '空白'}”；缺失表型需先处理，或选择“仅描述性质控”` });
      y[i] = phenotypeColumn === -1 ? 0 : (pheno === allowed[1] ? 1 : 0);
      let missing = 0;
      for (let j = 0; j < m; j++) {
        const raw = r.values[snpColumns[j]], v = variants[j];
        if (missingTokens.has(raw.toUpperCase())) { values[i * m + j] = NaN; missing++; v.missing++; continue; }
        const x = numberPattern.test(raw) ? Number(raw) : NaN;
        if (!Number.isFinite(x) || x < 0 || x > 2 || ((options.genotypeMode || 'hardcall') === 'hardcall' && !Number.isInteger(x))) {
          pushIssue({ line: r.line, column: v.id, message: `非法基因型“${raw}”：${options.genotypeMode === 'dosage' ? '剂量必须在 0–2' : '硬调用必须是 0、1、2'}` });
        }
        values[i * m + j] = x; v.called++; v.sum += x; v.min = Math.min(v.min, x); v.max = Math.max(v.max, x);
      }
      samples.push({ id, phenotype: phenotypeColumn === -1 ? null : y[i], missing, missingRate: missing / m, line: r.line });
    }
    checkAbort(options.signal);
    if (issues.length) throw new MatrixError('输入存在错误，矩阵尚未导入。显示前 30 项，请修正后重试。', issues);
    variants.forEach(v => finishVariant(v, n));
    const phenotypeAvailable = phenotypeColumn !== -1;
    const cases = phenotypeAvailable ? y.reduce((a, v) => a + v, 0) : null, totalMissing = samples.reduce((a, s) => a + s.missing, 0);
    const warnings = [];
    if (!phenotypeAvailable) warnings.push('未提供表型：已完成描述性质控；病例/对照模型演示不可用。');
    else if (!cases || cases === n) warnings.push('只有一个表型类别：可进行描述性质控，无法进行病例/对照模型评估。');
    if (variants.some(v => !v.called)) warnings.push('包含全缺失位点，质控时会剔除。');
    if (variants.some(v => v.constant)) warnings.push('包含无变异位点（基因型恒定），质控时会剔除。');
    if (parsed.delimiter === 'whitespace') warnings.push('空白分隔格式不能表达空单元格，缺失值须明确写为 NA。');
    if (snpColumns.some(i => ['sample_id','phenotype'].includes(header[i]))) throw new MatrixError('未映射的 sample_id / phenotype 列必须放入忽略列，避免规范矩阵出现重复列名。');
    return { ids, y, values, samples, variants, inputHeader: header, n, m, cases, controls: phenotypeAvailable ? n - cases : null, phenotypeAvailable, totalMissing, missingRate: totalMissing / (n * m), warnings, options: { ...options, signal: undefined, onProgress: undefined }, delimiter: parsed.delimiter };
  }
  function finishVariant(v, n) {
    v.missingRate = n ? v.missing / n : 1;
    v.countedAF = v.called ? v.sum / (2 * v.called) : null;
    v.maf = v.countedAF === null ? null : Math.min(v.countedAF, 1 - v.countedAF);
    v.constant = v.called > 0 && v.min === v.max;
    delete v.min; delete v.max;
  }
  async function qc(matrix, config, options = {}) {
    const { maf, missing, sampleMissing } = config;
    if (![maf, missing, sampleMissing].every(Number.isFinite) || maf < 0 || maf > .5 || missing < 0 || missing > 1 || sampleMissing < 0 || sampleMissing > 1) throw new MatrixError('质控阈值不合法。');
    const keptSamples = matrix.samples.map((s, i) => ({ s, i })).filter(({ s }) => s.missingRate <= sampleMissing).map(({ i }) => i);
    const variants = matrix.variants.map(v => ({ id: v.id, called: 0, missing: 0, sum: 0, min: Infinity, max: -Infinity }));
    for (let k = 0; k < keptSamples.length; k++) {
      if (k % 250 === 0) { checkAbort(options.signal); await pause(); }
      const i = keptSamples[k];
      for (let j = 0; j < matrix.m; j++) { const x = matrix.values[i * matrix.m + j], v = variants[j]; if (Number.isNaN(x)) v.missing++; else { v.called++; v.sum += x; v.min = Math.min(v.min, x); v.max = Math.max(v.max, x); } }
    }
    const keptVariants = [];
    variants.forEach((v, j) => {
      finishVariant(v, keptSamples.length); v.reasons = [];
      if (!v.called) v.reasons.push('全缺失或无保留样本');
      if (v.constant) v.reasons.push('无变异');
      if (v.missingRate > missing) v.reasons.push('位点缺失率超阈值');
      if (v.maf !== null && v.maf + 1e-12 < maf) v.reasons.push('MAF 低于阈值');
      v.pass = !v.reasons.length; if (v.pass) keptVariants.push(j);
    });
    const cases = matrix.phenotypeAvailable ? keptSamples.reduce((a, i) => a + matrix.y[i], 0) : null;
    return { keptSamples, keptVariants, variants, cases, controls: matrix.phenotypeAvailable ? keptSamples.length - cases : null, config: { maf, missing, sampleMissing } };
  }
  function csvCell(value, protectFormulas = true) {
    if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))) return 'NA';
    let s = String(value);
    if (protectFormulas && typeof value === 'string' && /^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(rows, { protectFormulas = true } = {}) { return '\uFEFF' + rows.map(row => row.map(v => csvCell(v, protectFormulas)).join(',')).join('\r\n'); }
  return { LIMITS, MatrixError, detect, parse, build, qc, csv, csvCell };
});
