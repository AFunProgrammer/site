// config.js
import fs from 'fs';
import fsAsync from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import * as uuid from 'uuid';

// Load settings
// Load environment settings
const settings = JSON.parse(await fsAsync.readFile('./private/settings/private.json', 'utf8'));
// DEV - LocalHost
const envFile = JSON.parse(await fsAsync.readFile('./private/settings/local.json', 'utf8'));
// PROD - WebSite
//const envFile = JSON.parse(await fsAsync.readFile('./private/settings/website.json', 'utf8'));

// Generate PKCE values
const codeVerifier = uuid.v1() + crypto.randomBytes(32).toString("hex");
const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("hex");

// Load SSL credentials
const privateKey = fs.readFileSync(envFile.privateKeyFile, 'utf8');
const certificate = fs.readFileSync(envFile.certificateFile, 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Proxy IP ranges
const proxyDNSV4IpRanges = [];
const proxyDNSV6IpRanges = [];

// Session options
import session from 'express-session';
const sessionOptions = {
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: "lax",
  },
  resave: false,
  saveUninitialized: true,
  secret: settings.secrets.session,
  store: new session.MemoryStore(),
};

export {
  settings,
  envFile,
  codeVerifier,
  codeChallenge,
  privateKey,
  certificate,
  credentials,
  proxyDNSV4IpRanges,
  proxyDNSV6IpRanges,
  sessionOptions
};