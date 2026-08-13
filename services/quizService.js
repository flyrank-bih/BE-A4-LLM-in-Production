// Quiz service — builds the prompt, asks the AI abstraction, then validates the result.
const { generate } = require('./ai');
const { OPTIONS_COUNT, parseQuizJson } = require('./quizSchema');
const { emptyUsage, logQuizUsage } = require('./ai/usage');

function buildQuizPrompt({ topic, difficulty, amount }) {
  return [
    `Generate a multiple-choice trivia quiz about ${topic}.`,
    `Difficulty: ${difficulty}.`,
    `Create exactly ${amount} questions.`,
    `Each question must have exactly ${OPTIONS_COUNT} distinct options.`,
    'correctAnswer must be copied exactly from one of the options.',
    'Return JSON only, with this shape:',
    '{"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":"..."}]}',
  ].join(' ');
}

async function createQuiz({ topic, difficulty, amount }) {
  const attempt = 1;
  const startedAt = Date.now();
  let provider;
  let model;
  let usage = emptyUsage();

  try {
    const result = await generate({
      prompt: buildQuizPrompt({ topic, difficulty, amount }),
      json: true,
    });

    provider = result.provider;
    model = result.model;
    usage = result.usage || emptyUsage();

    const quiz = parseQuizJson(result.text, amount);

    logQuizUsage({
      success: true,
      provider,
      model,
      questions: quiz.questions.length,
      usage,
      durationMs: Date.now() - startedAt,
      attempt,
    });

    return {
      topic,
      difficulty,
      questions: quiz.questions,
      provider,
      model,
    };
  } catch (err) {
    logQuizUsage({
      success: false,
      provider: err.provider || provider,
      model: err.model || model,
      questions: amount,
      usage: err.usage || usage,
      durationMs: Date.now() - startedAt,
      attempt,
      error: err.message,
    });
    throw err;
  }
}

module.exports = { createQuiz };
