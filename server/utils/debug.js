const DEBUG = process.env.DEBUG === 'true';
const dbg = (...args) => { if (DEBUG) console.log('[DEBUG]', ...args); };

module.exports = dbg;
