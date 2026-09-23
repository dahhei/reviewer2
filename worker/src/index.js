// Proxies the reviewer2 app's Together AI calls so the API key stays server-side.
// Routes are fixed (not a generic passthrough) so a caller can't request an
// arbitrary model or max_tokens and run up the Together bill.

const ALLOWED_ORIGINS = new Set([
  'https://reviewertwo.web.app',
  'https://reviewertwo.firebaseapp.com',
  'http://localhost:3000',
]);

const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';
const MAX_TOKENS = 300;

// Verify these against Together's live model list (dashboard, or GET /v1/models)
// before relying on them — both replace models Together has since retired.
const REVIEWER_MODEL = 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
const EDITOR_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo';

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function jsonError(message, status, cors) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function validateTemperature(temperature) {
  return typeof temperature === 'number' && temperature >= 0 && temperature <= 1
    ? temperature
    : 0.7;
}

async function callTogether(env, body, cors) {
  const togetherRes = await fetch(TOGETHER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.TOGETHER_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await togetherRes.text();
  return new Response(text, {
    status: togetherRes.status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (request.method !== 'POST') {
      return jsonError('Not found', 404, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonError('Invalid JSON body', 400, cors);
    }

    const temperature = validateTemperature(body.temperature);
    const { pathname } = new URL(request.url);

    if (pathname === '/api/review') {
      if (!Array.isArray(body.messages)) {
        return jsonError('messages must be an array', 400, cors);
      }
      return callTogether(env, {
        model: REVIEWER_MODEL,
        messages: body.messages,
        temperature,
        max_tokens: MAX_TOKENS,
      }, cors);
    }

    if (pathname === '/api/editor-decision') {
      if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
        return jsonError('prompt must be a non-empty string', 400, cors);
      }
      return callTogether(env, {
        model: EDITOR_MODEL,
        messages: [{ role: 'user', content: body.prompt }],
        temperature,
        max_tokens: MAX_TOKENS,
      }, cors);
    }

    return jsonError('Not found', 404, cors);
  },
};
