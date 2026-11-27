(function () {
  const header = ['sample_id', 'phenotype', ...Array.from({ length: 8 }, (_, j) => 'rs' + (10001 + j))];
  const rows = Array.from({ length: 20 }, (_, i) => ['DEMO_' + String(i + 1).padStart(3, '0'), i % 2, ...Array.from({ length: 8 }, (_, j) => j === 7 || i === 19 || (i === 1 && j === 0) || (i === 3 && j === 1) ? 'NA' : j === 6 ? 0 : (i * 7 + j * 5 + Math.floor(i / 3)) % 3)]);
  window.SNPExamples = { text: [header, ...rows].map(row => row.join(',')).join('\n'), filename: 'SNP-DEMO-20-samples.csv', source: '合成示例矩阵' };
})();
