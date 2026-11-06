// The runner injects ACTIONS_RUNTIME_TOKEN / ACTIONS_RESULTS_URL into JavaScript actions,
// not shell steps. Inherit them without printing or persisting any credentials.
const { spawn } = require('node:child_process');
const child = spawn('node', ['scripts/market-loop.mjs'], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
