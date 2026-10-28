/**
 * One-time bootstrap of the first administrator.
 *
 *   npm run create-admin -- --email you@example.com --name "Your Name"
 *
 * The password is read from the ADMIN_PASSWORD environment variable or typed at a hidden
 * prompt — it is never hardcoded, never passed as a CLI flag (shell history) and never logged.
 * The command refuses to run if an administrator already exists; further admins are
 * promoted from the Admin → Users screen, which is audit-logged.
 */
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import config from '../config/index.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { AuditLog, User } from '../models/index.js';
import { hashPassword } from '../services/authService.js';
import { email as emailSchema, name as nameSchema, password as passwordSchema } from '../validators/common.js';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = function write(str) {
      if (str.includes(question)) rl.output.write(str);
      else rl.output.write('*');
    };
    rl.question(question, (answer) => {
      rl.output.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

export async function createFirstAdmin({ email, name, password }) {
  const e = emailSchema.parse(email);
  const n = nameSchema.parse(name);
  const p = passwordSchema.parse(password);
  if (await User.exists({ role: 'admin' })) {
    throw new Error('An administrator already exists. Promote additional admins from the Admin → Users screen.');
  }
  const existing = await User.findOne({ email: e });
  let user;
  if (existing) {
    existing.role = 'admin';
    existing.status = 'active';
    existing.emailVerified = true;
    existing.emailVerifiedAt = new Date();
    existing.passwordHash = await hashPassword(p);
    existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    user = await existing.save();
  } else {
    user = await User.create({ email: e, name: n, passwordHash: await hashPassword(p), role: 'admin', emailVerified: true, emailVerifiedAt: new Date() });
  }
  await AuditLog.create({ category: 'security', action: 'admin.bootstrap', entityType: 'User', entityId: String(user._id), actorEmail: 'cli', details: { email: e } });
  return user;
}

async function main() {
  const email = arg('--email');
  const name = arg('--name') ?? 'Administrator';
  if (!email) {
    console.error('Usage: npm run create-admin -- --email you@example.com --name "Your Name"');
    process.exit(1);
  }
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (!process.stdin.isTTY) {
      console.error('Set ADMIN_PASSWORD or run in an interactive terminal.');
      process.exit(1);
    }
    password = await promptHidden('Admin password (min 8 chars, letters + numbers): ');
    const confirm = await promptHidden('Repeat password: ');
    if (password !== confirm) {
      console.error('Passwords do not match.');
      process.exit(1);
    }
  }
  await connectDB(config.mongoUri);
  try {
    const user = await createFirstAdmin({ email, name, password });
    console.log(`Administrator ready: ${user.email}`);
  } catch (err) {
    console.error(err?.issues ? err.issues.map((i) => i.message).join('; ') : err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
