const { estimateCost } = require('./pricing');

function emptyUsage() {
  return { inputTokens: null, outputTokens: null, totalTokens: null };
}

function formatUsd(amount) {
  if (amount === 0) {
    return '$0.000000';
  }
  if (amount < 0.000001) {
    return `$${amount.toExponential(2)}`;
  }
  return `$${amount.toFixed(6)}`;
}

function formatToken(value) {
  return value === null || value === undefined ? 'n/a' : value;
}

function logQuizUsage({
  success,
  provider,
  model,
  questions,
  usage,
  durationMs,
  attempt,
  error,
}) {
  const cost = usage?.inputTokens == null && usage?.outputTokens == null
    ? 'n/a'
    : formatUsd(estimateCost(provider, model, usage));

  const fields = {
    provider: provider || 'unknown',
    model: model || 'unknown',
    questions: questions ?? 'n/a',
    input_tokens: formatToken(usage?.inputTokens),
    output_tokens: formatToken(usage?.outputTokens),
    total_tokens: formatToken(usage?.totalTokens),
    estimated_cost: cost,
    duration_ms: durationMs,
    attempt,
    success,
  };
  if (!success && error) {
    fields.error = error;
  }

  const title = success ? 'AI quiz generated' : 'AI quiz failed';
  const lines = [title, ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)];
  console.log(lines.join('\n'));
}

module.exports = { emptyUsage, logQuizUsage };
