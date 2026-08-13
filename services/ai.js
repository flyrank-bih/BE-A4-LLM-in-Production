// AI service — thin client that sends a prompt to Gemini and returns the text.
const { OPTIONS_COUNT, parseQuizJson } = require('./quizSchema');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';

const QUIZ_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctAnswer: { type: 'STRING' },
        },
        required: ['question', 'options', 'correctAnswer'],
      },
    },
  },
  required: ['questions'],
};

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    const error = new Error('GEMINI_API_KEY is not set');
    error.status = 500;
    throw error;
  }

  return { apiKey, model };
}

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => part.text)
    .filter(Boolean)
    .join('');
}

async function generateText(prompt, options = {}) {
  const { apiKey, model } = getConfig();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  };
  if (options.generationConfig) {
    body.generationConfig = options.generationConfig;
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const error = new Error(`Gemini request failed: ${err.message}`);
    error.status = 502;
    throw error;
  }

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Gemini request failed (${response.status})`);
    error.status = response.status >= 400 && response.status < 600 ? response.status : 502;
    throw error;
  }

  const text = extractText(data);
  if (!text) {
    const error = new Error('Gemini returned an empty response');
    error.status = 502;
    throw error;
  }

  return { model, text };
}

async function generateQuiz({ topic, difficulty, amount }) {
  const prompt = [
    `Generate a multiple-choice trivia quiz about ${topic}.`,
    `Difficulty: ${difficulty}.`,
    `Create exactly ${amount} questions.`,
    `Each question must have exactly ${OPTIONS_COUNT} distinct options.`,
    'correctAnswer must be copied exactly from one of the options.',
    'Return JSON only, with this shape:',
    '{"questions":[{"question":"...","options":["...","...","...","..."],"correctAnswer":"..."}]}',
  ].join(' ');

  const { model, text } = await generateText(prompt, {
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: QUIZ_RESPONSE_SCHEMA,
    },
  });

  const quiz = parseQuizJson(text, amount);
  return { model, questions: quiz.questions };
}

module.exports = { generateText, generateQuiz };
