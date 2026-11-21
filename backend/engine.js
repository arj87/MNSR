'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const enginePath = path.join(__dirname, '../cpp/build/mnsr_engine');

/**
 * Run a command on the C++ engine binary.
 * Sends JSON.stringify(commandObj) + '\n' to stdin, reads one JSON line from stdout.
 * @param {object} commandObj
 * @returns {Promise<object>}
 */
function runCommand(commandObj) {
  return new Promise((resolve, reject) => {
    // Check binary existence first
    if (!fs.existsSync(enginePath)) {
      return reject(new Error(`Engine binary not found at: ${enginePath}. Build the C++ engine first.`));
    }

    let proc;
    try {
      proc = spawn(enginePath, [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (spawnErr) {
      return reject(new Error(`Failed to spawn engine: ${spawnErr.message}`));
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { proc.kill('SIGKILL'); } catch (_) {}
        reject(new Error('Engine command timed out after 10 seconds'));
      }
    }, 10000);

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      // Once we have a full line, resolve
      const newlineIdx = stdout.indexOf('\n');
      if (newlineIdx !== -1 && !settled) {
        settled = true;
        clearTimeout(timeout);
        try { proc.kill('SIGTERM'); } catch (_) {}
        const line = stdout.slice(0, newlineIdx).trim();
        try {
          const result = JSON.parse(line);
          resolve(result);
        } catch (parseErr) {
          reject(new Error(`Failed to parse engine response: ${parseErr.message}. Raw: ${line.slice(0, 200)}`));
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Engine process error: ${err.message}`));
      }
    });

    proc.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Engine exited with code ${code}. Stderr: ${stderr.slice(0, 500)}`));
        } else {
          // Try to parse whatever we got
          const line = stdout.trim();
          if (line) {
            try {
              resolve(JSON.parse(line));
            } catch (e) {
              reject(new Error(`Engine closed without valid JSON output. Raw: ${line.slice(0, 200)}`));
            }
          } else {
            reject(new Error('Engine closed with no output'));
          }
        }
      }
    });

    // Write command to stdin
    try {
      const payload = JSON.stringify(commandObj) + '\n';
      proc.stdin.write(payload, (writeErr) => {
        if (writeErr && !settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Failed to write to engine stdin: ${writeErr.message}`));
        }
      });
      proc.stdin.end();
    } catch (writeErr) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Exception writing to engine stdin: ${writeErr.message}`));
      }
    }
  });
}

/**
 * Check if the engine binary exists.
 * @returns {boolean}
 */
function engineExists() {
  try {
    return fs.existsSync(enginePath);
  } catch (_) {
    return false;
  }
}

module.exports = { runCommand, enginePath, engineExists };
