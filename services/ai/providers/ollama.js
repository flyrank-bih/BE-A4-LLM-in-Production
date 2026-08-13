// Ollama implementation of the AI provider interface: generate({ prompt, json })
const { createError } = require('../errors');

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'llama3.2';

function getConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  return { baseUrl, model };
}

function createOllamaProvider() {
  return {
    name: 'ollama',
    async generate({ prompt, json = false }) {
      const { baseUrl, model } = getConfig();
      const body = {
        model,
        prompt,
        stream: false,
      };
      if (json) {
        body.format = 'json';
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw createError(`AI request failed: ${err.message}`, 502);
      }

      const data = await response.json();
      if (!response.ok) {
        throw createError(data?.error || `AI request failed (${response.status})`, 502);
      }

      const text = data?.response ?? '';
      if (!text) {
        throw createError('AI returned an empty response', 502);
      }

      return { provider: 'ollama', model, text };
    },
  };
}

module.exports = { createOllamaProvider };
