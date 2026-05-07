// Cloudflare Worker - weight_xmt 提交代理
const GH_OWNER = 'yumeAlexLee';
const GH_REPO = 'weight_xmt';
const GH_BRANCH = 'main';
const CSV_PATH = 'data/weight.csv';

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUtf8(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    try {
      const body = await request.json();
      const { date, weight, note } = body;
      if (!date || !weight) {
        return new Response(JSON.stringify({ error: 'Missing date or weight' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const GH_TOKEN = env.GH_PAT;
      if (!GH_TOKEN) {
        return new Response(JSON.stringify({ error: 'GH_PAT not configured' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const apiBase = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${CSV_PATH}`;
      const headers = {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'cloudflare-worker',
      };

      // Step 1: Read CSV
      const getResp = await fetch(apiBase, { headers });
      const getStatus = getResp.status;

      if (!getResp.ok) {
        const text = await getResp.text();
        return new Response(JSON.stringify({
          error: `GitHub GET failed (${getStatus})`,
          detail: text.substring(0, 200),
        }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }

      const csvData = await getResp.json();
      const currentContent = base64ToUtf8(csvData.content);
      const sha = csvData.sha;

      // Step 2: Append new line
      const noteStr = note ? `,${note}` : ',';
      const newLine = `${date},${weight}${noteStr}\n`;
      const newContent = currentContent + newLine;

      // Step 3: Write back
      const putResp = await fetch(apiBase, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `add weight: ${date} ${weight}kg`,
          content: utf8ToBase64(newContent),
          sha,
          branch: GH_BRANCH,
        }),
      });

      const putData = await putResp.json();

      if (putData.content) {
        return new Response(JSON.stringify({ success: true, message: '✅ 记录成功！' }), {
          status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } else {
        return new Response(JSON.stringify({
          error: putData.message || '写入失败',
          detail: JSON.stringify(putData).substring(0, 200),
        }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack.substring(0, 300) }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};
