// Quiz schema — the shape we accept from Gemini. JSON.parse alone is not enough.
const { z } = require('zod');

const OPTIONS_COUNT = 4;

const quizQuestionSchema = z
  .object({
    question: z.string({ error: 'question is required' }).trim().min(1, 'question is required'),
    options: z
      .array(z.string().trim().min(1, 'option cannot be empty'), { error: 'options is required' })
      .length(OPTIONS_COUNT, `each question must have exactly ${OPTIONS_COUNT} options`),
    correctAnswer: z
      .string({ error: 'correctAnswer is required' })
      .trim()
      .min(1, 'correctAnswer is required'),
  })
  .refine((question) => question.options.includes(question.correctAnswer), {
    message: 'correctAnswer must match one of the options',
    path: ['correctAnswer'],
  });

function createQuizSchema(amount) {
  return z.object({
    questions: z
      .array(quizQuestionSchema, { error: 'questions is required' })
      .length(amount, `quiz must contain exactly ${amount} questions`),
  });
}

function unwrapJsonText(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function formatQuizIssues(error) {
  return error.issues.map((issue) => issue.message).join('; ');
}

function parseQuizJson(text, amount) {
  let parsed;
  try {
    parsed = JSON.parse(unwrapJsonText(text));
  } catch {
    const error = new Error('Gemini returned invalid JSON');
    error.status = 502;
    throw error;
  }

  const result = createQuizSchema(amount).safeParse(parsed);
  if (!result.success) {
    const error = new Error(`Gemini quiz failed validation: ${formatQuizIssues(result.error)}`);
    error.status = 502;
    throw error;
  }

  return result.data;
}

module.exports = {
  OPTIONS_COUNT,
  createQuizSchema,
  parseQuizJson,
};
