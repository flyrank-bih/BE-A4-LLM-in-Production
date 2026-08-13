// Quiz service — builds the prompt, asks the AI abstraction, then validates the result.
const { generate } = require('./ai');
const { OPTIONS_COUNT, parseQuizJson } = require('./quizSchema');

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
  const { text, model, provider } = await generate({
    prompt: buildQuizPrompt({ topic, difficulty, amount }),
    json: true,
  });

  const quiz = parseQuizJson(text, amount);

  return {
    topic,
    difficulty,
    questions: quiz.questions,
    provider,
    model,
  };
}

module.exports = { createQuiz };
