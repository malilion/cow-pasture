// Keep the runner's JavaScript action context and credentials in this process.
const core = require('@actions/core');
import('../../../scripts/market-loop.mjs')
  .then(module => module.runMarketLoop())
  .catch(error => core.setFailed(error.message));
