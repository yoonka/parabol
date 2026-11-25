const cp = require('child_process')

const getCommitHash = () => {
  try {
    return cp
      .execSync('git rev-parse HEAD', {stdio: ['ignore', 'pipe', 'ignore']})
      .toString()
      .trim()
  } catch {
    // Fallback when .git is not available (e.g. Docker or Railway builds)
    return process.env.COMMIT_HASH || process.env.RAILWAY_GIT_COMMIT_SHA || 'unknown'
  }
}

module.exports = getCommitHash
