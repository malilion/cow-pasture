import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const exec = promisify(execFile);
const finalErrors = new Set(['deployment_failed', 'deployment_perms_error', 'deployment_content_failed', 'deployment_cancelled', 'deployment_lost']);

export async function archiveDocs(docsDir, archive) {
  await writeFile(join(docsDir, '.nojekyll'), '', { flag: 'a' });
  // Match upload-pages-artifact@v3: the artifact service compresses this plain tar
  // into ZIP. A gzip tar inside ZIP is rejected by Pages (actions/upload-pages-artifact#71).
  await exec('tar', ['--dereference', '--hard-dereference', '--directory', resolve(docsDir),
    '--exclude=.git', '--exclude=.github', '-cf', archive, '.']);
}
async function actionsClients(env) {
  for (const key of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_RUN_ID',
    'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_RESULTS_URL']) {
    if (!env[key]) throw new Error(`缺少 ${key}；請從 workflow 的本機 JavaScript action 執行。`);
  }
  // Runner-only packages: keep package.json dependency-free and import lazily for local checks.
  const [{ DefaultArtifactClient }, core, github] = await Promise.all([
    import('@actions/artifact'), import('@actions/core'), import('@actions/github'),
  ]);
  return { artifact: new DefaultArtifactClient(), core, octokit: github.getOctokit(env.GITHUB_TOKEN, { request: { timeout: 15_000 } }) };
}

export async function getPagesOIDCToken({ owner, env = process.env, core, fetcher = fetch, timeoutMs = 15_000 }) {
  const audience = `https://github.com/${owner}`;
  let token;
  if (env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    // Use the runner endpoint directly so this also works outside the toolkit's process.
    const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    url.searchParams.set('audience', audience);
    let response;
    try {
      response = await fetcher(url.href, { method: 'GET',
        headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
        signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new Error('Pages OIDC token 請求失敗（網路錯誤或逾時）');
    }
    if (!response.ok) throw new Error(`Pages OIDC token 請求失敗（HTTP ${response.status}）`);
    try { token = (await response.json())?.value; }
    catch { throw new Error('Pages OIDC token 回應不是有效 JSON'); }
  } else {
    // Same owner audience as deploy-pages@v4's default runner-issued token.
    try { token = await core.getIDToken(audience); }
    catch { throw new Error('Pages OIDC token 取得失敗；請確認 workflow 有 id-token: write 權限'); }
  }
  if (typeof token !== 'string' || !token.trim()) throw new Error('Pages OIDC token 為空；未建立部署');
  return token;
}

function redactedResponseData(data, secrets) {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { /* Non-JSON response body. */ }
  }
  try {
    return JSON.stringify(data, (key, value) => {
      if (/token|authorization|cookie|secret/i.test(key)) return '[REDACTED]';
      if (typeof value === 'string') {
        for (const secret of secrets) if (secret) value = value.replaceAll(secret, '[REDACTED]');
      }
      return value;
    }) ?? 'null';
  } catch { return '"[無法序列化回應]"'; }
}

export async function deployPages({ docsDir = 'docs', cycle = 1, timeoutMs = 90_000, env = process.env,
  clients, fetcher = fetch, now = Date.now, pause = sleep, log = console.log, pack = archiveDocs } = {}) {
  const deadline = now() + timeoutMs;
  const { artifact, core, octokit } = clients ?? await actionsClients(env);
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/');
  if (!owner || !repo || !env.GITHUB_RUN_ID) throw new Error('缺少有效的 GITHUB_REPOSITORY 或 GITHUB_RUN_ID');
  const temp = await mkdtemp(join(tmpdir(), 'cow-pages-'));
  let deploymentId, oidcToken, pending = false;
  const request = async (route, payload = {}) => {
    try {
      return await octokit.request(route, { owner, repo,
        request: { timeout: route.endsWith('/cancel') ? 10_000 : Math.max(1, Math.min(15_000, deadline - now())) }, ...payload });
    } catch (error) {
      const headers = error.response?.headers ?? {};
      const limited = error.status === 429 || headers['x-ratelimit-remaining'] === '0' || /rate limit/i.test(error.message);
      log(limited ? `GitHub API 速率限制：HTTP ${error.status}，重設 ${headers['x-ratelimit-reset'] ?? '未知'}，稍候 ${headers['retry-after'] ?? '未知'} 秒。` : `GitHub Pages API 失敗：HTTP ${error.status ?? '未知'}。`);
      const secrets = [oidcToken, env.GITHUB_TOKEN, env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, env.ACTIONS_RUNTIME_TOKEN];
      log(`GitHub Pages API response.data: ${redactedResponseData(error.response?.data, secrets)}`);
      log(`GitHub Pages API x-github-request-id: ${headers['x-github-request-id'] ?? '未知'}`);
      // Do not log request payloads or raw errors: the create payload contains the OIDC token.
      throw new Error(limited ? 'GitHub API 速率限制' : `GitHub Pages API 請求失敗（${error.status ?? '網路錯誤'}）`);
    }
  };
  try {
    const archive = join(temp, 'artifact.tar');
    await pack(resolve(docsDir), archive);
    const name = `github-pages-${env.GITHUB_RUN_ID}-${cycle}-${randomUUID()}`;
    const uploaded = await artifact.uploadArtifact(name, [archive], temp, { retentionDays: 1, compressionLevel: 6 });
    const artifactId = Number(uploaded.id);
    if (!Number.isSafeInteger(artifactId) || artifactId <= 0) throw new Error('Artifact 上傳未回傳有效的數字 id');
    // Mirrors actions/deploy-pages@v4: https://github.com/actions/deploy-pages/blob/v4/src/internal/api-client.js
    oidcToken = await getPagesOIDCToken({ owner, env, core, fetcher,
      timeoutMs: Math.max(1, Math.min(15_000, deadline - now())) });
    if (now() >= deadline) throw new Error('Pages 部署預算已耗盡，未建立部署');
    const { data } = await request('POST /repos/{owner}/{repo}/pages/deployments', {
      artifact_id: artifactId, pages_build_version: `${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT ?? '1'}-${cycle}`, oidc_token: oidcToken,
    });
    deploymentId = data.id || data.status_url?.split('/').pop();
    if (!deploymentId) throw new Error('Pages 建立部署未回傳 deployment id');
    pending = true;
    const pageUrl = data.page_url || data.html_url;
    log(`Pages 部署 ${deploymentId}：${pageUrl ?? '未提供網址'}`);
    while (now() < deadline) {
      const { data: status } = await request('GET /repos/{owner}/{repo}/pages/deployments/{deploymentId}', {
        deploymentId, request: { timeout: Math.max(1, Math.min(15_000, deadline - now())) },
      });
      if (status.status === 'succeed') {
        pending = false;
        core.setOutput('page_url', pageUrl ?? '');
        log(`Pages 部署 ${deploymentId} 成功：${pageUrl ?? ''}`);
        return { id: deploymentId, pageUrl, artifactId };
      }
      if (finalErrors.has(status.status)) { pending = false; throw new Error(`Pages 部署 ${deploymentId} 失敗：${status.status}`); }
      log(`Pages 部署 ${deploymentId}：${status.status}`);
      await pause(Math.max(0, Math.min(5_000, deadline - now())));
    }
    throw new Error(`Pages 部署 ${deploymentId} 等待逾時（${timeoutMs / 1000} 秒）`);
  } finally {
    let cancelFailed = false;
    if (pending) {
      try { await request('POST /repos/{owner}/{repo}/pages/deployments/{deploymentId}/cancel', { deploymentId }); }
      catch { cancelFailed = true; log(`無法取消 Pages 部署 ${deploymentId}，停止本次工作以避免重疊部署。`); }
    }
    await rm(temp, { recursive: true, force: true });
    if (cancelFailed) throw Object.assign(new Error(`Pages 部署 ${deploymentId} 尚未確認取消`), { stopLoop: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  deployPages({}).catch(error => { console.error(error.message); process.exitCode = 1; });
}
