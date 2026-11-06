/* Exact numerical-tree inference for the exported multiclass sklearn model. */
(function (root) {
  'use strict';
  function predict(model, inputs) {
    if (inputs.length !== model.features.length || inputs.some(value => !Number.isFinite(value))) {
      throw new Error('유한한 속도·발사각·방향 값을 입력하세요.');
    }
    const scores = model.baseline.slice();
    for (const [classIndex, nodes] of model.trees) {
      let index = 0;
      while (!nodes[index][5]) {
        const node = nodes[index];
        index = inputs[node[1]] <= node[2] ? node[3] : node[4];
      }
      // sklearn predictor leaf values already include the learning rate.
      scores[classIndex] += nodes[index][0];
    }
    const maximum = Math.max(...scores);
    const weights = scores.map(score => Math.exp(score - maximum));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(weight => weight / total);
  }
  root.HitPredictEngine = { predict };
})(typeof window === 'undefined' ? globalThis : window);
