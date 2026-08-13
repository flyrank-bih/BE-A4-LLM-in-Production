// Groq implementation of the AI provider interface: generate({ prompt, json })
const { createError } = require('../errors');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

function getConfig() {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw createError('GROQ_API_KEY is not set', 500);
  }

  return { apiKey, model };
}

function createGroqProvider() {
  return {
    name: 'groq',
    async generate({ prompt, json = false }) {
      const { apiKey, model } = getConfig();

      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
      };
      if (json) {
        body.response_format = { type: 'json_object' };
      }

      let response;
      try {
        response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw createError(`AI request failed: ${err.message}`, 502);
      }

      const data = await response.json();
      const usage = {
        inputTokens: data?.usage?.prompt_tokens ?? null,
        outputTokens: data?.usage?.completion_tokens ?? null,
        totalTokens: data?.usage?.total_tokens ?? null,
      };
      if (!response.ok) {
        const error = createError(data?.error?.message || `AI request failed (${response.status})`, 502);
        error.provider = 'groq';
        error.model = model;
        error.usage = usage;
        throw error;
      }

      const text = data?.choices?.[0]?.message?.content ?? '';
      if (!text) {
        const error = createError('AI returned an empty response', 502);
        error.provider = 'groq';
        error.model = model;
        error.usage = usage;
        throw error;
      }

      return { provider: 'groq', model, text, usage };
    },
  };
}

module.exports = { createGroqProvider };
