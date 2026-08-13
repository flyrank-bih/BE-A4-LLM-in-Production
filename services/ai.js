// AI service — thin client that sends a prompt to Gemini and returns the text.
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';

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

async function generateText(prompt) {
  const { apiKey, model } = getConfig();
  const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
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
    `Generate ${amount} ${difficulty} trivia questions about ${topic}.`,
    'Number each question.',
    'For every question, include the question text and the correct answer.',
  ].join(' ');

  return generateText(prompt);
}

module.exports = { generateText, generateQuiz };
