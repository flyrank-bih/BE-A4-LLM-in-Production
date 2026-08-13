// Gemini implementation of the AI provider interface: generate({ prompt, json })
const { createError } = require('../errors');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.AI_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw createError('GEMINI_API_KEY is not set', 500);
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

function extractUsage(data) {
  const meta = data?.usageMetadata ?? {};
  const inputTokens = meta.promptTokenCount ?? null;
  const totalTokens = meta.totalTokenCount ?? null;
  const outputTokens =
    totalTokens != null && inputTokens != null
      ? Math.max(0, totalTokens - inputTokens)
      : (meta.candidatesTokenCount ?? null);

  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? (inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null),
  };
}

function createGeminiProvider() {
  return {
    name: 'gemini',
    async generate({ prompt, json = false }) {
      const { apiKey, model } = getConfig();
      const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
      };
      if (json) {
        body.generationConfig = { responseMimeType: 'application/json' };
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
        throw createError(`AI request failed: ${err.message}`, 502);
      }

      const data = await response.json();
      const usage = extractUsage(data);
      if (!response.ok) {
        const error = createError(data?.error?.message || `AI request failed (${response.status})`, 502);
        error.provider = 'gemini';
        error.model = model;
        error.usage = usage;
        throw error;
      }

      const text = extractText(data);
      if (!text) {
        const error = createError('AI returned an empty response', 502);
        error.provider = 'gemini';
        error.model = model;
        error.usage = usage;
        throw error;
      }

      return { provider: 'gemini', model, text, usage };
    },
  };
}

module.exports = { createGeminiProvider };
