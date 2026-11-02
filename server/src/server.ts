import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';
import argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

// Support both `npm run dev` from the repository root and `npm run dev` from server/.
const envPath = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
].find(existsSync);
if (envPath) dotenv.config({ path: envPath });

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; teamId: string; role: string; csrf: string };
    }
  }
}

type AuthenticatedRequest = express.Request;

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token'],
    censor: '[Redacted]',
  },
});
const app = express();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function allowRate(key: string, limit: number, windowMs: number) { const now=Date.now(); const bucket=rateBuckets.get(key); if(!bucket||bucket.resetAt<=now){rateBuckets.set(key,{count:1,resetAt:now+windowMs});return true} if(bucket.count>=limit)return false;bucket.count++;return true; }
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((v) => v.trim()), credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(pinoHttp({ logger }));

const projectSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  teamId: { type: String, required: true, index: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 1000 },
  category: { type: String, default: 'Other', maxlength: 60 },
  status: { type: String, enum: ['active', 'paused', 'archived'], default: 'active' },
  environment: { type: String, enum: ['development', 'staging', 'production'], default: 'development' },
  aiEnabled: { type: Boolean, default: false },
  provider: { type: String, default: '' },
  model: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });
projectSchema.index({ name: 'text', slug: 'text', description: 'text' });
const Project: any = mongoose.models.Project ?? mongoose.model('Project', projectSchema);
const userSchema = new Schema({ teamId: { type: String, required: true, index: true }, email: { type: String, unique: true, required: true, lowercase: true, trim: true }, name: { type: String, required: true, trim: true }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ['owner', 'admin', 'developer', 'analyst', 'viewer'], default: 'owner' }, suspended: { type: Boolean, default: false }, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
const User: any = mongoose.models.User ?? mongoose.model('User', userSchema);
const sessionSchema = new Schema({ tokenHash: { type: String, unique: true, required: true }, userId: { type: Schema.Types.ObjectId, required: true, index: true }, csrf: { type: String, required: true }, expiresAt: { type: Date, required: true, expires: 0 }, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
const Session: any = mongoose.models.Session ?? mongoose.model('Session', sessionSchema);
const invitationSchema = new Schema({ teamId: { type: String, required: true, index: true }, email: { type: String, required: true, lowercase: true, trim: true }, role: { type: String, enum: ['admin','developer','analyst','viewer'], required: true }, tokenHash: { type: String, required: true, unique: true }, invitedBy: { type: String, required: true }, expiresAt: { type: Date, required: true }, acceptedAt: Date, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
const Invitation: any = mongoose.models.Invitation ?? mongoose.model('Invitation', invitationSchema);
const providerSchema = new Schema({ teamId: { type: String, required: true, index: true }, name: { type: String, enum: ['gemini', 'openai', 'anthropic'], required: true }, enabled: { type: Boolean, default: true }, status: { type: String, enum: ['not_tested', 'connected', 'error'], default: 'not_tested' }, encryptedApiKey: { type: String, required: true, select: false }, lastTestedAt: Date, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now } }, { versionKey: false });
providerSchema.index({ teamId: 1, name: 1 }, { unique: true });
const Provider: any = mongoose.models.Provider ?? mongoose.model('Provider', providerSchema);
const modelSchema = new Schema({ teamId: { type: String, required: true, index: true }, provider: { type: String, required: true }, modelId: { type: String, required: true }, displayName: { type: String, default: '' }, description: { type: String, default: '' }, inputTokenLimit: Number, outputTokenLimit: Number, inputPricePerMillion: { type: Number, min: 0 }, outputPricePerMillion: { type: Number, min: 0 }, pricingUpdatedAt: Date, capabilities: { type: [String], default: [] }, active: { type: Boolean, default: true }, verifiedAt: Date }, { versionKey: false });
modelSchema.index({ teamId: 1, provider: 1, modelId: 1 }, { unique: true });
const ModelRecord: any = mongoose.models.ModelRecord ?? mongoose.model('ModelRecord', modelSchema);
const pricingSchema = new Schema({ teamId: { type: String, required: true, index: true }, provider: { type: String, required: true }, modelId: { type: String, required: true }, inputPricePerMillion: { type: Number, required: true, min: 0 }, outputPricePerMillion: { type: Number, required: true, min: 0 }, effectiveAt: { type: Date, required: true }, enteredBy: String, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
pricingSchema.index({ teamId: 1, provider: 1, modelId: 1, effectiveAt: -1 });
const ModelPricing: any = mongoose.models.ModelPricing ?? mongoose.model('ModelPricing', pricingSchema);
const credentialSchema = new Schema({ teamId: { type: String, required: true, index: true }, projectId: { type: Schema.Types.ObjectId, required: true, index: true }, label: { type: String, required: true }, environment: { type: String, enum: ['development', 'staging', 'production'], required: true }, prefix: { type: String, required: true }, secretHash: { type: String, required: true }, active: { type: Boolean, default: true }, lastUsedAt: Date, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
const Credential: any = mongoose.models.ProjectCredential ?? mongoose.model('ProjectCredential', credentialSchema);
const usageSchema = new Schema({ teamId: { type: String, required: true, index: true }, projectId: { type: Schema.Types.ObjectId, required: true, index: true }, provider: String, model: String, pricingId: { type: Schema.Types.ObjectId, default: null }, inputTokens: { type: Number, default: 0 }, outputTokens: { type: Number, default: 0 }, totalTokens: { type: Number, default: 0 }, estimatedCostUsd: { type: Number, default: null }, latencyMs: Number, status: { type: String, enum: ['succeeded', 'failed'], required: true }, errorCode: String, createdAt: { type: Date, default: Date.now, index: true } }, { versionKey: false });
usageSchema.index({ teamId: 1, createdAt: -1 });
const Usage: any = mongoose.models.UsageEvent ?? mongoose.model('UsageEvent', usageSchema);
const promptSchema = new Schema({ teamId: { type: String, required: true, index: true }, title: { type: String, required: true, trim: true }, body: { type: String, required: true }, category: { type: String, default: 'General' }, tags: { type: [String], default: [] }, createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now } }, { versionKey: false });
const Prompt: any = mongoose.models.PromptTemplate ?? mongoose.model('PromptTemplate', promptSchema);
const budgetSchema = new Schema({ teamId: { type: String, required: true, index: true }, projectId: { type: Schema.Types.ObjectId, required: true }, monthlyLimitUsd: { type: Number, required: true, min: 0 }, dailyLimitUsd: { type: Number, default: 0, min: 0 }, monthSpentUsd: { type: Number, default: 0 }, monthReservedUsd: { type: Number, default: 0 }, daySpentUsd: { type: Number, default: 0 }, dayReservedUsd: { type: Number, default: 0 }, monthKey: String, dayKey: String, hardLimit: { type: Boolean, default: true }, updatedAt: { type: Date, default: Date.now } }, { versionKey: false });
budgetSchema.index({ teamId: 1, projectId: 1 }, { unique: true });
const Budget: any = mongoose.models.Budget ?? mongoose.model('Budget', budgetSchema);
const budgetReservationSchema = new Schema({ teamId: { type: String, required: true, index: true }, budgetId: { type: Schema.Types.ObjectId, required: true }, requestId: { type: String, required: true, unique: true }, amountUsd: { type: Number, required: true }, monthKey: { type: String, required: true }, dayKey: { type: String, required: true }, state: { type: String, enum: ['reserved','committed','released','expired'], default: 'reserved' }, expiresAt: { type: Date, required: true }, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
budgetReservationSchema.index({ teamId:  1, state: 1, expiresAt: 1 });
const BudgetReservation: any = mongoose.models.BudgetReservation ?? mongoose.model('BudgetReservation', budgetReservationSchema);
const notificationSchema = new Schema({ teamId: { type: String, required: true, index: true }, dedupeKey: String, type: { type: String, required: true }, title: { type: String, required: true }, message: { type: String, required: true }, readAt: Date, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
notificationSchema.index({ teamId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
const Notification: any = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema);
const auditSchema = new Schema({ teamId: { type: String, required: true, index: true }, actorId: String, action: { type: String, required: true }, resourceType: String, resourceId: String, metadata: { type: Schema.Types.Mixed, default: {} }, createdAt: { type: Date, default: Date.now } }, { versionKey: false });
const Audit: any = mongoose.models.AuditLog ?? mongoose.model('AuditLog', auditSchema);
const settingSchema = new Schema({ teamId: { type: String, required: true, unique: true }, name: { type: String, default: 'KenoraTech' }, retentionDays: { type: Number, default: 30 }, promptRetention: { type: Boolean, default: false }, globalModel: { type: String, default: '' }, updatedAt: { type: Date, default: Date.now } }, { versionKey: false });
const Setting: any = mongoose.models.PlatformSetting ?? mongoose.model('PlatformSetting', settingSchema);
async function getWorkspaceModel(teamId: string): Promise<string> {
  const setting = await Setting.findOne({ teamId }).select('globalModel').lean();
  return setting?.globalModel ?? '';
}

const createProject = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(1000).optional().default(''), category: z.string().trim().max(60).optional().default('Other'), status: z.enum(['active', 'paused', 'archived']).optional().default('active'), environment: z.enum(['development', 'staging', 'production']).optional().default('development') });
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70) || 'project';
function secretKey(): Buffer { const value = Buffer.from(process.env.SECRETS_ENCRYPTION_KEY ?? '', 'base64'); if (value.length !== 32) throw Object.assign(new Error('SECRETS_ENCRYPTION_KEY must be base64 encoding of exactly 32 bytes. Generate one with node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))".'), { status: 503, code: 'ENCRYPTION_KEY_NOT_CONFIGURED' }); return value; }
function encryptSecret(value: string): string { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secretKey(), iv); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`; }
function decryptSecret(value: string): string { const [iv, tag, encrypted] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64')); decipher.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64')), decipher.final()]).toString('utf8'); }

app.get('/health', (_req, res) => res.json({ status: 'ok', checkedAt: new Date().toISOString(), services: { api: 'healthy', mongodb: mongoose.connection.readyState === 1 ? 'healthy' : 'unavailable' } }));
const authInput = z.object({ email: z.string().trim().email().max(254), password: z.string().min(12).max(256), name: z.string().trim().min(1).max(100).optional() });
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
const getCookie = (req: express.Request, name: string) => req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
async function issueSession(userId: string, res: express.Response) {
  const token = randomBytes(32).toString('base64url'); const csrf = randomBytes(24).toString('base64url');
  await Session.create({ tokenHash: hashToken(token), userId, csrf, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) });
  const production = process.env.NODE_ENV === 'production';
  res.cookie('kenora_session', token, { httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', path: '/', maxAge: 1000 * 60 * 60 * 24 * 7 });
  return csrf;
}
app.get('/api/v1/auth/status', async (_req, res, next) => {
  try { if (mongoose.connection.readyState !== 1) return res.json({ configured: false, database: false }); res.json({ configured: await User.exists({ role: 'owner' }) !== null, database: true }); } catch (error) { next(error); }
});
app.post('/api/v1/auth/bootstrap', async (req, res, next) => {
  try {
    if(!allowRate(`bootstrap:${req.ip}`,5,60*60*1000))return res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many setup attempts. Try again later.'}});
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Connect MongoDB before creating the owner account.' } });
    if (await User.exists({ role: 'owner' })) return res.status(409).json({ error: { code: 'ALREADY_CONFIGURED', message: 'An owner account already exists. Sign in instead.' } });
    const input = authInput.extend({ name: z.string().trim().min(1).max(100) }).parse(req.body);
    const ownerId = new mongoose.Types.ObjectId(); const user = await User.create({ _id: ownerId, teamId: String(ownerId), email: input.email, name: input.name, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }), role: 'owner' });
    const csrf = await issueSession(String(user._id), res); res.status(201).json({ data: { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf } });
  } catch (error) { next(error); }
});
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    if(!allowRate(`login:${req.ip}`,8,15*60*1000))return res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many sign-in attempts. Try again later.'}});
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'MongoDB is not available.' } });
    const input = authInput.omit({ name: true }).parse(req.body);
    const user = await User.findOne({ email: input.email, suspended: false }).select('+passwordHash');
    if (!user || !await argon2.verify(user.passwordHash, input.password)) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    const csrf = await issueSession(String(user._id), res); res.json({ data: { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf } });
  } catch (error) { next(error); }
});
app.get('/api/v1/auth/me', async (req, res, next) => {
  try {
    const token = getCookie(req, 'kenora_session'); if (!token || mongoose.connection.readyState !== 1) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }); if (!session) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Session expired. Sign in again.' } });
    const user = await User.findById(session.userId).lean(); if (!user || user.suspended) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Account unavailable.' } });
    res.json({ data: { user: { id: String(user._id), email: user.email, name: user.name, role: user.role }, csrf: session.csrf } });
  } catch (error) { next(error); }
});
app.post('/api/v1/auth/logout', async (req, res, next) => {
  try {
    const token = getCookie(req, 'kenora_session'); const session = token ? await Session.findOne({ tokenHash: hashToken(token) }) : null;
    if (session && req.get('x-csrf-token') !== session.csrf) return res.status(403).json({ error: { code: 'CSRF_REJECTED', message: 'CSRF token is invalid.' } });
    if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
    const production = process.env.NODE_ENV === 'production';
    res.clearCookie('kenora_session', { httpOnly: true, secure: production, sameSite: production ? 'none' : 'strict', path: '/' }); res.status(204).end();
  } catch (error) { next(error); }
});
app.post('/api/v1/auth/refresh', async (req, res, next) => { try { const token=getCookie(req,'kenora_session');if(!token)return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Sign in to continue.'}});const session=await Session.findOne({tokenHash:hashToken(token),expiresAt:{$gt:new Date()}});if(!session)return res.status(401).json({error:{code:'UNAUTHENTICATED',message:'Session expired.'}});if(req.get('x-csrf-token')!==session.csrf)return res.status(403).json({error:{code:'CSRF_REJECTED',message:'CSRF token is invalid.'}});session.expiresAt=new Date(Date.now()+7*86400000);await session.save();res.json({data:{csrf:session.csrf}});}catch(error){next(error);} });
app.post('/api/v1/auth/accept-invitation', async (req, res, next) => {
  try { const input = z.object({ token: z.string().min(20), name: z.string().trim().min(1).max(100), password: z.string().min(12).max(256) }).parse(req.body); const invite = await Invitation.findOne({ tokenHash: hashToken(input.token), expiresAt: { $gt: new Date() }, acceptedAt: null }); if (!invite) return res.status(400).json({ error: { code: 'INVITATION_INVALID', message: 'Invitation is invalid or expired.' } }); if (await User.exists({ email: invite.email })) return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } }); const user = await User.create({ teamId: invite.teamId, email: invite.email, name: input.name, role: invite.role, passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) }); invite.acceptedAt = new Date(); await invite.save(); const csrf = await issueSession(String(user._id), res); await Audit.create({ teamId: invite.teamId, actorId: String(user._id), action: 'team.invitation.accepted', resourceType: 'user', resourceId: String(user._id) }); res.status(201).json({ data: { user: { id: user.id, email: user.email, name: user.name, role: user.role }, csrf } }); } catch (error) { next(error); }
});
app.use('/api/v1', async (req: AuthenticatedRequest, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'MongoDB is not available.' } });
  const token = getCookie(req, 'kenora_session'); if (!token) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
  try {
    const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }); if (!session) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } });
    const user = await User.findById(session.userId).lean(); if (!user || user.suspended) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Account unavailable.' } });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin'); const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((v) => v.trim());
      if (!req.get('x-csrf-token') || req.get('x-csrf-token') !== session.csrf || (origin && !allowed.includes(origin))) return res.status(403).json({ error: { code: 'CSRF_REJECTED', message: 'Request origin or CSRF token is invalid.' } });
    }
    req.auth = { userId: String(user._id), teamId: String(user.teamId), role: user.role, csrf: session.csrf };
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && ['viewer','analyst'].includes(user.role) && !req.path.startsWith('/playground/')) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This workspace role cannot make changes.' } });
    next();
  } catch (error) { next(error); }
});
app.get('/api/v1/projects', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter: Record<string, unknown> = {};
    if (req.query.status && ['active', 'paused', 'archived'].includes(String(req.query.status))) filter.status = req.query.status;
    if (req.query.q) filter.$text = { $search: String(req.query.q).slice(0, 100) };
    const auth = (req as AuthenticatedRequest).auth!; filter.teamId = auth.teamId;
    const [data, total] = await Promise.all([Project.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Project.countDocuments(filter)]);
    res.json({ data, page, limit, total, configured: true });
  } catch (error) { next(error); }
});
app.post('/api/v1/projects', async (req, res, next) => {
  try {
    const input = createProject.parse(req.body);
    const base = slugify(input.name); let slug = base; let suffix = 2;
    while (await Project.exists({ slug })) slug = `${base}-${suffix++}`;
    const auth = (req as AuthenticatedRequest).auth!;
    const workspaceModel = await getWorkspaceModel(auth.teamId);
    const project = await Project.create({ ...input, ...(workspaceModel ? { provider: 'gemini', model: workspaceModel } : {}), slug, teamId: auth.teamId });
    await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'project.created', resourceType: 'project', resourceId: String(project._id) });
    res.status(201).json({ data: project });
  } catch (error) { next(error); }
});
app.post('/api/v1/projects/apply-model', async (req, res, next) => {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    if (!['owner', 'admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } });
    const input = z.object({ modelId: z.string().trim().min(1).max(150) }).parse(req.body);
    const model = await ModelRecord.findOne({ teamId: auth.teamId, provider: 'gemini', modelId: input.modelId, active: true, verifiedAt: { $ne: null } }).lean();
    if (!model) return res.status(400).json({ error: { code: 'MODEL_NOT_VERIFIED', message: 'Choose an active model verified from the connected provider catalog.' } });
    const provider = await Provider.exists({ teamId: auth.teamId, name: model.provider, enabled: true, status: 'connected' });
    if (!provider) return res.status(409).json({ error: { code: 'PROVIDER_NOT_CONNECTED', message: 'Test the Gemini provider connection before changing project models.' } });
    const result = await Project.updateMany({ teamId: auth.teamId }, { $set: { provider: model.provider, model: model.modelId, updatedAt: new Date() } });
    await Setting.findOneAndUpdate({ teamId: auth.teamId }, { $set: { globalModel: model.modelId, updatedAt: new Date() }, $setOnInsert: { teamId: auth.teamId } }, { upsert: true, new: true });
    await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'projects.model.bulk_assigned', resourceType: 'model', resourceId: String(model._id) });
    res.json({ data: { provider: model.provider, model: model.modelId, matchedCount: result.matchedCount, modifiedCount: result.modifiedCount } });
  } catch (error) { next(error); }
});
app.get('/api/v1/projects/:id', async (req, res, next) => {
  try { const auth = (req as AuthenticatedRequest).auth!; const row = await Project.findOne({ _id: req.params.id, teamId: auth.teamId }).lean(); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); res.json({ data: row }); } catch (error) { next(error); }
});
app.patch('/api/v1/projects/:id', async (req, res, next) => {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const input = createProject.partial().extend({ status: z.enum(['active', 'paused', 'archived']).optional(), environment: z.enum(['development', 'staging', 'production']).optional(), aiEnabled: z.boolean().optional(), provider: z.enum(['gemini','openai','anthropic']).optional(), model: z.string().trim().max(150).optional() }).parse(req.body);
    if (input.aiEnabled === true) {
      if (!input.provider && !(await Project.exists({ _id: req.params.id, teamId: auth.teamId, provider: { $ne: '' } }))) return res.status(400).json({ error: { code: 'PROVIDER_REQUIRED', message: 'Select a provider before enabling AI for this project.' } });
      const existingProject = await Project.findOne({ _id: req.params.id, teamId: auth.teamId }).lean();
      const provider = input.provider ?? existingProject?.provider; const selectedModel = input.model ?? existingProject?.model;
      if (provider !== 'gemini') return res.status(409).json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Only configured Gemini models can be enabled right now.' } });
      const connection = await Provider.exists({ teamId: auth.teamId, name: provider, enabled: true, status: 'connected' }); if (!connection) return res.status(409).json({ error: { code: 'PROVIDER_NOT_CONNECTED', message: 'Test the Gemini provider connection before enabling this project.' } });
      if (!selectedModel || !await ModelRecord.exists({ teamId: auth.teamId, provider, modelId: selectedModel, active: true, verifiedAt: { $ne: null } })) return res.status(400).json({ error: { code: 'MODEL_NOT_VERIFIED', message: 'Choose a model verified from the connected provider catalog.' } });
    }
    const row = await Project.findOneAndUpdate({ _id: req.params.id, teamId: auth.teamId }, { ...input, ...(input.name ? { slug: slugify(input.name) } : {}), updatedAt: new Date() }, { new: true, runValidators: true }).lean();
    if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'project.updated', resourceType: 'project', resourceId: String(row._id) }); res.json({ data: row });
  } catch (error) { next(error); }
});
app.delete('/api/v1/projects/:id', async (req, res, next) => {
  try { const auth = (req as AuthenticatedRequest).auth!; const row = await Project.findOneAndDelete({ _id: req.params.id, teamId: auth.teamId }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'project.deleted', resourceType: 'project', resourceId: String(row._id) }); res.status(204).end(); } catch (error) { next(error); }
});
app.get('/api/v1/providers', async (req: AuthenticatedRequest, res, next) => { try { const rows = await Provider.find({ teamId: req.auth!.teamId }).select('+encryptedApiKey').lean(); res.json({ data: rows.map((row: any) => { const { encryptedApiKey, ...safe } = row; return { ...safe, configured: Boolean(encryptedApiKey) }; }) }); } catch (error) { next(error); } });
app.post('/api/v1/providers', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } });
    const input = z.object({ name: z.enum(['gemini','openai','anthropic']), apiKey: z.string().min(10).max(500) }).parse(req.body);
    if (input.name !== 'gemini') return res.status(501).json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Only Google Gemini connectivity is implemented. Other provider adapters are not configured.' } });
    const encryptedApiKey = encryptSecret(input.apiKey);
    const row = await Provider.findOneAndUpdate({ teamId: req.auth!.teamId, name: input.name }, { $set: { encryptedApiKey, enabled: true, status: 'not_tested', updatedAt: new Date() }, $setOnInsert: { teamId: req.auth!.teamId, name: input.name } }, { upsert: true, new: true, runValidators: true }).select('-encryptedApiKey').lean();
    await Audit.create({ teamId: req.auth!.teamId, actorId: req.auth!.userId, action: 'provider.configured', resourceType: 'provider', resourceId: String(row._id) });
    res.status(201).json({ data: { ...row, configured: true } });
  } catch (error) { next(error); }
});
app.patch('/api/v1/providers/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } });
    const input = z.object({ enabled: z.boolean().optional(), apiKey: z.string().min(10).max(500).optional() }).parse(req.body);
    const update: Record<string, unknown> = { updatedAt: new Date() }; if (input.enabled !== undefined) update.enabled = input.enabled; if (input.apiKey) { update.encryptedApiKey = encryptSecret(input.apiKey); update.status = 'not_tested'; }
    const row = await Provider.findOneAndUpdate({ _id: req.params.id, teamId: req.auth!.teamId }, { $set: update }, { new: true }).select('-encryptedApiKey').lean(); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found.' } }); res.json({ data: { ...row, configured: true } });
  } catch (error) { next(error); }
});
app.post('/api/v1/providers/:id/test', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } });
    const row = await Provider.findOne({ _id: req.params.id, teamId: req.auth!.teamId }).select('+encryptedApiKey'); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Provider not found.' } });
    if (row.name !== 'gemini') return res.status(501).json({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'This provider adapter is not available.' } });
    try { const ai = new GoogleGenAI({ apiKey: decryptSecret(row.encryptedApiKey) }); const page = await ai.models.list({ config: { pageSize: 1 } }); const verified = page.page.length > 0; row.status = verified ? 'connected' : 'error'; row.lastTestedAt = new Date(); await row.save(); res.json({ data: { connected: verified, testedAt: row.lastTestedAt } }); }
    catch { row.status = 'error'; row.lastTestedAt = new Date(); await row.save(); await Notification.create({ teamId: req.auth!.teamId, type: 'provider.error', title: 'Gemini connection failed', message: 'The Gemini provider test failed. Review provider settings.' }); return res.status(502).json({ error: { code: 'PROVIDER_TEST_FAILED', message: 'Gemini connectivity test failed. Check the key and provider access.' } }); }
  } catch (error) { next(error); }
});
app.post('/api/v1/providers/:id/models/sync', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } });
    const row = await Provider.findOne({ _id: req.params.id, teamId: req.auth!.teamId, name: 'gemini', enabled: true, status: 'connected' }).select('+encryptedApiKey'); if (!row) return res.status(409).json({ error: { code: 'PROVIDER_NOT_CONNECTED', message: 'Test and enable Gemini before syncing its model catalog.' } });
    const ai = new GoogleGenAI({ apiKey: decryptSecret(row.encryptedApiKey) }); const page = await ai.models.list(); const now = new Date(); const synced: unknown[] = [];
    for await (const model of page) { const modelId = model.name?.replace(/^models\//, ''); const supportedActions = new Set<string>(['generateContent', 'embedContent']); if (!modelId || !model.supportedActions?.some((action: string) => supportedActions.has(String(action)))) continue; const record = await ModelRecord.findOneAndUpdate({ teamId: req.auth!.teamId, provider: 'gemini', modelId }, { $set: { displayName: model.displayName ?? modelId, description: model.description ?? '', inputTokenLimit: model.inputTokenLimit, outputTokenLimit: model.outputTokenLimit, capabilities: model.supportedActions, active: true, verifiedAt: now } }, { upsert: true, new: true }); synced.push(record); }
    res.json({ data: synced, syncedAt: now });
  } catch (error) { next(error); }
});
app.get('/api/v1/models', async (req: AuthenticatedRequest, res, next) => { try { const filter: Record<string, unknown> = { teamId: req.auth!.teamId }; if (req.query.provider) filter.provider = req.query.provider; res.json({ data: await ModelRecord.find(filter).sort({ displayName: 1 }).lean() }); } catch (error) { next(error); } });
app.patch('/api/v1/models/:id', async (req: AuthenticatedRequest, res, next) => { try { if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); const input = z.object({ active: z.boolean().optional(), inputPricePerMillion: z.number().min(0).max(100000).optional(), outputPricePerMillion: z.number().min(0).max(100000).optional() }).refine((value) => value.active !== undefined || (value.inputPricePerMillion !== undefined && value.outputPricePerMillion !== undefined), 'Set both input and output token prices together.').parse(req.body); const row=await ModelRecord.findOneAndUpdate({_id:req.params.id,teamId:req.auth!.teamId},{$set:{...input,...(input.inputPricePerMillion!==undefined?{pricingUpdatedAt:new Date()}: {})}},{new:true});if(!row)return res.status(404).json({error:{code:'NOT_FOUND',message:'Model not found.'}});if(input.inputPricePerMillion!==undefined&&input.outputPricePerMillion!==undefined)await ModelPricing.create({teamId:req.auth!.teamId,provider:row.provider,modelId:row.modelId,inputPricePerMillion:input.inputPricePerMillion,outputPricePerMillion:input.outputPricePerMillion,effectiveAt:new Date(),enteredBy:req.auth!.userId});await Audit.create({teamId:req.auth!.teamId,actorId:req.auth!.userId,action:'model.updated',resourceType:'model',resourceId:String(row._id)});res.json({data:row});}catch(error){next(error);} });
app.get('/api/v1/models/:id/pricing', async (req: AuthenticatedRequest, res, next) => { try { const model=await ModelRecord.findOne({_id:req.params.id,teamId:req.auth!.teamId}).lean();if(!model)return res.status(404).json({error:{code:'NOT_FOUND',message:'Model not found.'}});res.json({data:await ModelPricing.find({teamId:req.auth!.teamId,provider:model.provider,modelId:model.modelId}).sort({effectiveAt:-1}).lean()});}catch(error){next(error);} });
app.get('/api/v1/projects/:id/credentials', async (req: AuthenticatedRequest, res, next) => { try { const project = await Project.exists({ _id: req.params.id, teamId: req.auth!.teamId }); if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); const rows = await Credential.find({ projectId: req.params.id, teamId: req.auth!.teamId }).select('-secretHash').sort({ createdAt: -1 }).lean(); res.json({ data: rows }); } catch (error) { next(error); } });
app.post('/api/v1/projects/:id/credentials', async (req: AuthenticatedRequest, res, next) => {
  try { const input = z.object({ label: z.string().trim().min(1).max(80), environment: z.enum(['development','staging','production']) }).parse(req.body); const project = await Project.exists({ _id: req.params.id, teamId: req.auth!.teamId }); if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); const secret = `kh_${input.environment}_${randomBytes(32).toString('base64url')}`; const row = await Credential.create({ teamId: req.auth!.teamId, projectId: req.params.id, label: input.label, environment: input.environment, prefix: secret.slice(0, 15), secretHash: hashToken(secret) }); await Audit.create({ teamId: req.auth!.teamId, actorId: req.auth!.userId, action: 'credential.created', resourceType: 'credential', resourceId: String(row._id) }); res.status(201).json({ data: { id: row.id, label: row.label, environment: row.environment, prefix: row.prefix, secret, createdAt: row.createdAt } }); } catch (error) { next(error); }
});
app.post('/api/v1/credentials/:id/rotate', async (req: AuthenticatedRequest, res, next) => { try { const row = await Credential.findOne({ _id: req.params.id, teamId: req.auth!.teamId, active: true }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Credential not found.' } }); const secret = `kh_${row.environment}_${randomBytes(32).toString('base64url')}`; row.secretHash = hashToken(secret); row.prefix = secret.slice(0,15); row.createdAt = new Date(); await row.save(); await Audit.create({ teamId: req.auth!.teamId, actorId: req.auth!.userId, action: 'credential.rotated', resourceType: 'credential', resourceId: String(row._id) }); res.json({ data: { id: row.id, label: row.label, environment: row.environment, prefix: row.prefix, secret, createdAt: row.createdAt } }); } catch (error) { next(error); } });
app.delete('/api/v1/credentials/:id', async (req: AuthenticatedRequest, res, next) => { try { const row = await Credential.findOneAndUpdate({ _id: req.params.id, teamId: req.auth!.teamId, active: true }, { $set: { active: false } }, { new: true }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Credential not found.' } }); await Audit.create({ teamId: req.auth!.teamId, actorId: req.auth!.userId, action: 'credential.revoked', resourceType: 'credential', resourceId: String(row._id) }); res.status(204).end(); } catch (error) { next(error); } });
async function settleBudgetReservation(record: any, state: 'committed'|'released', cost = 0) {
  const transitioned = await BudgetReservation.findOneAndUpdate({ _id: record._id, state: 'reserved' }, { $set: { state } }, { new: true }); if (!transitioned) return;
  const budget = await Budget.findById(record.budgetId).lean(); if (!budget) return;
  const monthKey = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth()+1).padStart(2,'0')}`; const dayKey = new Date().toISOString().slice(0,10);
  if (budget.monthKey !== monthKey) await Budget.updateOne({ _id: budget._id, monthKey: { $ne: monthKey } }, { $set: { monthKey, monthSpentUsd: 0, monthReservedUsd: 0 } });
  if (budget.dayKey !== dayKey) await Budget.updateOne({ _id: budget._id, dayKey: { $ne: dayKey } }, { $set: { dayKey, daySpentUsd: 0, dayReservedUsd: 0 } });
  const current = await Budget.findById(record.budgetId).lean(); if (!current) return; const monthInc: Record<string,number> = {}; const dayInc: Record<string,number> = {};
  if (current.monthKey === record.monthKey) monthInc.monthReservedUsd = -record.amountUsd;
  if (state === 'committed') monthInc.monthSpentUsd = cost;
  if (current.dayKey === record.dayKey) dayInc.dayReservedUsd = -record.amountUsd;
  if (state === 'committed') dayInc.daySpentUsd = cost;
  if (Object.keys(monthInc).length) await Budget.updateOne({ _id: current._id }, { $inc: monthInc });
  if (Object.keys(dayInc).length) await Budget.updateOne({ _id: current._id }, { $inc: dayInc });
}
async function generateForProject(teamId: string, project: any, input: string, modelId?: string, generation?: { temperature?: number; maxOutputTokens?: number }) {
  if (!project.aiEnabled || project.status !== 'active') throw Object.assign(new Error('AI access is disabled for this project.'), { status: 403, code: 'PROJECT_AI_DISABLED' });
  const workspaceModel = await getWorkspaceModel(teamId);
  const selectedModel = workspaceModel || modelId || project.model;
  const selectedProvider = workspaceModel ? 'gemini' : project.provider;
  if (!selectedModel || (!workspaceModel && project.model && selectedModel !== project.model)) throw Object.assign(new Error('Requested model is not configured for this project.'), { status: 400, code: 'MODEL_NOT_ALLOWED' });
  const model = await ModelRecord.findOne({ teamId, provider: selectedProvider, modelId: selectedModel, active: true, verifiedAt: { $ne: null } }).lean(); if (!model) throw Object.assign(new Error('Model is unavailable or has not been verified.'), { status: 409, code: 'MODEL_UNAVAILABLE' });
  const pricing = await ModelPricing.findOne({ teamId, provider: selectedProvider, modelId: selectedModel, effectiveAt: { $lte: new Date() } }).sort({ effectiveAt: -1 }).lean(); const inputPrice = pricing?.inputPricePerMillion ?? model.inputPricePerMillion; const outputPrice = pricing?.outputPricePerMillion ?? model.outputPricePerMillion; const pricingId = pricing?._id ?? null;
  if (selectedProvider !== 'gemini') throw Object.assign(new Error('This provider adapter is not implemented.'), { status: 501, code: 'PROVIDER_UNAVAILABLE' });
  const provider = await Provider.findOne({ teamId, name: 'gemini', enabled: true, status: 'connected' }).select('+encryptedApiKey'); if (!provider) throw Object.assign(new Error('Gemini provider is not connected.'), { status: 409, code: 'PROVIDER_NOT_CONNECTED' });
  const requestId = randomUUID(); const started = Date.now(); let reserved = 0; let budget: any = null; let countedInputTokens = 0; let reservationRecord: any = null;
  try {
    const ai = new GoogleGenAI({ apiKey: decryptSecret(provider.encryptedApiKey), httpOptions: { timeout: 120_000 } });
    budget = await Budget.findOne({ teamId, projectId: project._id });
    const hasPricing = Number.isFinite(inputPrice) && Number.isFinite(outputPrice);
    if (budget?.hardLimit && !hasPricing) throw Object.assign(new Error('Verified model pricing must be configured before a hard budget can be enforced.'), { status: 409, code: 'PRICING_REQUIRED' });
    if (budget && hasPricing) {
      const now = new Date(); const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`; const dayKey = now.toISOString().slice(0,10);
      if (budget.monthKey !== monthKey) await Budget.updateOne({ _id: budget._id, monthKey: { $ne: monthKey } }, { $set: { monthKey, monthSpentUsd: 0, monthReservedUsd: 0 } });
      if (budget.dayKey !== dayKey) await Budget.updateOne({ _id: budget._id, dayKey: { $ne: dayKey } }, { $set: { dayKey, daySpentUsd: 0, dayReservedUsd: 0 } });
      const count = await ai.models.countTokens({ model: selectedModel, contents: input }); countedInputTokens = count.totalTokens ?? 0;
      const maxOut = generation?.maxOutputTokens ?? model.outputTokenLimit ?? 1024;
      reserved = (countedInputTokens * inputPrice + maxOut * outputPrice) / 1_000_000;
      if (budget.hardLimit) {
        const reservation = await Budget.findOneAndUpdate({ _id: budget._id, $expr: { $and: [ { $lte: [{ $add: ['$monthSpentUsd','$monthReservedUsd',reserved] }, '$monthlyLimitUsd'] }, { $or: [ { $lte: ['$dailyLimitUsd',0] }, { $lte: [{ $add: ['$daySpentUsd','$dayReservedUsd',reserved] }, '$dailyLimitUsd'] } ] } ] } }, { $inc: { monthReservedUsd: reserved, dayReservedUsd: reserved } }, { new: true });
        if (!reservation) { await Notification.findOneAndUpdate({ teamId, dedupeKey: `budget-exceeded:${budget._id}:${monthKey}` }, { $setOnInsert: { teamId, dedupeKey: `budget-exceeded:${budget._id}:${monthKey}`, type: 'budget.exceeded', title: 'Project budget exceeded', message: 'A request was blocked because the configured hard budget limit would be exceeded.' } }, { upsert: true }); await Usage.create({ teamId, projectId: project._id, provider: 'gemini', model: selectedModel, inputTokens: countedInputTokens, latencyMs: Date.now() - started, status: 'failed', errorCode: 'BUDGET_EXCEEDED' }); throw Object.assign(new Error('Configured spending limit would be exceeded.'), { status: 429, code: 'BUDGET_EXCEEDED' }); }
        reservationRecord = await BudgetReservation.create({ teamId, budgetId: budget._id, requestId, amountUsd: reserved, monthKey, dayKey, expiresAt: new Date(Date.now()+10*60*1000) });
      }
    }
    const response = await ai.models.generateContent({ model: selectedModel, contents: input, config: { temperature: generation?.temperature, maxOutputTokens: generation?.maxOutputTokens } });
    const meta = response.usageMetadata; const inputTokens = meta?.promptTokenCount ?? 0; const outputTokens = meta?.candidatesTokenCount ?? 0; const totalTokens = meta?.totalTokenCount ?? inputTokens + outputTokens; const latencyMs = Date.now() - started;
    const cost = hasPricing ? (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000 : null;
    if (budget && cost !== null) {
      if (reservationRecord) await settleBudgetReservation(reservationRecord,'committed',cost);
      else await Budget.updateOne({ _id: budget._id }, { $inc: { monthSpentUsd: cost, daySpentUsd: cost } });
      const current = await Budget.findById(budget._id).lean(); const ratio = current.monthlyLimitUsd ? current.monthSpentUsd / current.monthlyLimitUsd : 0; const threshold = [1,.9,.75,.5].find((x)=>ratio>=x); if(threshold){const key=`budget-${Math.round(threshold*100)}:${budget._id}:${current.monthKey}`;await Notification.findOneAndUpdate({teamId,dedupeKey:key},{$setOnInsert:{teamId,dedupeKey:key,type:threshold===1?'budget.exceeded':'budget.threshold',title:threshold===1?'Project budget reached':`Project budget ${Math.round(threshold*100)}% used`,message:`Usage has reached ${Math.round(ratio*100)}% of the monthly project limit.`}},{upsert:true});}
    }
    await Usage.create({ teamId, projectId: project._id, provider: 'gemini', model: selectedModel, pricingId, inputTokens, outputTokens, totalTokens, estimatedCostUsd: cost, latencyMs, status: 'succeeded' });
    return { requestId, text: response.text ?? '', provider: 'gemini', model: selectedModel, usage: { inputTokens, outputTokens, totalTokens, estimatedCostUsd: cost }, latencyMs };
  } catch (error) {
    if (reservationRecord) await settleBudgetReservation(reservationRecord,'released');
    else if (budget && reserved > 0 && budget.hardLimit) await Budget.updateOne({ _id: budget._id }, { $inc: { monthReservedUsd: -reserved, dayReservedUsd: -reserved } });
    const failure = error as { status?: number; code?: string; message?: string };
    if (failure.status && failure.code) throw error;
    await Usage.create({ teamId, projectId: project._id, provider: 'gemini', model: selectedModel, inputTokens: countedInputTokens, latencyMs: Date.now() - started, status: 'failed', errorCode: 'PROVIDER_REQUEST_FAILED' });
    throw Object.assign(new Error('Gemini generation failed. Check the provider status and request limits.'), { status: 502, code: 'PROVIDER_REQUEST_FAILED' });
  }
}
const generateInput = z.object({ projectId: z.string().min(1), model: z.string().trim().max(150).optional(), input: z.string().min(1).max(100_000), temperature: z.number().min(0).max(2).optional(), maxOutputTokens: z.number().int().min(1).max(32768).optional() });
async function gatewayCredential(req:express.Request,res:express.Response){const authHeader=req.get('authorization')??'';const raw=authHeader.startsWith('Bearer ')?authHeader.slice(7):'';if(!raw){res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project bearer credential is required.'}});return null}const credential=await Credential.findOne({secretHash:hashToken(raw),active:true});if(!credential){res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project credential is invalid or revoked.'}});return null}if(!allowRate(`gateway:${credential._id}`,120,60_000)){res.status(429).json({error:{code:'RATE_LIMITED',message:'Project request rate limit exceeded.'}});return null}return credential;}
app.post('/api/v1/playground/generate', async (req: AuthenticatedRequest, res, next) => { try { const input = generateInput.parse(req.body); const project = await Project.findOne({ _id: input.projectId, teamId: req.auth!.teamId }).lean(); if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); const result = await generateForProject(req.auth!.teamId, project, input.input, input.model, { temperature: input.temperature, maxOutputTokens: input.maxOutputTokens }); res.json({ data: result }); } catch (error) { next(error); } });
app.post('/v1/generate', async (req, res, next) => {
  try {
    const credential=await gatewayCredential(req,res);if(!credential)return;
    const input = generateInput.omit({ projectId: true }).parse({ ...req.body, projectId: String(credential.projectId) }); const project = await Project.findOne({ _id: credential.projectId, teamId: credential.teamId }).lean(); if (!project) return res.status(401).json({ error: { code: 'INVALID_CREDENTIAL', message: 'Credential project is unavailable.' } });
    await Credential.updateOne({ _id: credential._id }, { $set: { lastUsedAt: new Date() } }); const result = await generateForProject(credential.teamId, project, input.input, input.model, { temperature: input.temperature, maxOutputTokens: input.maxOutputTokens }); res.json({ data: result });
  } catch (error) { next(error); }
});
app.post('/v1/generate/stream',async(req,res,next)=>{let project:any;let selectedModel='';let teamId='';let started=Date.now();try{const credential=await gatewayCredential(req,res);if(!credential)return;teamId=credential.teamId;const input=generateInput.omit({projectId:true}).parse(req.body);project=await Project.findOne({_id:credential.projectId,teamId}).lean();if(!project)return res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project unavailable.'}});if(!project.aiEnabled||project.status!=='active')return res.status(403).json({error:{code:'PROJECT_AI_DISABLED',message:'AI access is disabled for this project.'}});const workspaceModel=await getWorkspaceModel(teamId);selectedModel=workspaceModel||input.model||project.model;if(!selectedModel||(!workspaceModel&&selectedModel!==project.model))return res.status(400).json({error:{code:'MODEL_NOT_ALLOWED',message:'Requested model is not configured for this project.'}});const model=await ModelRecord.findOne({teamId,provider:workspaceModel?'gemini':project.provider,modelId:selectedModel,active:true,verifiedAt:{$ne:null}}).lean();if(!model)return res.status(409).json({error:{code:'MODEL_UNAVAILABLE',message:'Model is not verified.'}});if(await Budget.exists({teamId,projectId:project._id,hardLimit:true}))return res.status(409).json({error:{code:'STREAM_BUDGET_UNAVAILABLE',message:'Streaming is disabled for projects with hard budgets until streaming reservations are enabled.'}});const provider=await Provider.findOne({teamId,name:'gemini',enabled:true,status:'connected'}).select('+encryptedApiKey');if(!provider)return res.status(409).json({error:{code:'PROVIDER_NOT_CONNECTED',message:'Gemini provider is not connected.'}});await Credential.updateOne({_id:credential._id},{$set:{lastUsedAt:new Date()}});const requestId=randomUUID();const ai=new GoogleGenAI({apiKey:decryptSecret(provider.encryptedApiKey),httpOptions:{timeout:120_000}});const stream=await ai.models.generateContentStream({model:selectedModel,contents:input.input,config:{temperature:input.temperature,maxOutputTokens:input.maxOutputTokens}});res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive'});res.write(`event: request\ndata: ${JSON.stringify({requestId,provider:'gemini',model:selectedModel})}\n\n`);let inputTokens=0;let outputTokens=0;let totalTokens=0;for await(const chunk of stream){if(res.destroyed)break;const text=chunk.text;if(text)res.write(`event: delta\ndata: ${JSON.stringify({text})}\n\n`);if(chunk.usageMetadata){inputTokens=chunk.usageMetadata.promptTokenCount??inputTokens;outputTokens=chunk.usageMetadata.candidatesTokenCount??outputTokens;totalTokens=chunk.usageMetadata.totalTokenCount??inputTokens+outputTokens;}}const latencyMs=Date.now()-started;await Usage.create({teamId,projectId:project._id,provider:'gemini',model:selectedModel,inputTokens,outputTokens,totalTokens,latencyMs,status:'succeeded'});res.write(`event: done\ndata: ${JSON.stringify({requestId,usage:{inputTokens,outputTokens,totalTokens},latencyMs})}\n\n`);res.end();}catch(error){if(project&&teamId)await Usage.create({teamId,projectId:project._id,provider:'gemini',model:selectedModel,latencyMs:Date.now()-started,status:'failed',errorCode:'STREAM_FAILED'}).catch(()=>undefined);if(res.headersSent){res.write(`event: error\ndata: ${JSON.stringify({code:'STREAM_FAILED',message:'Provider stream failed.'})}\n\n`);res.end();return}next(error);}});
app.post('/v1/chat',async(req,res,next)=>{try{const credential=await gatewayCredential(req,res);if(!credential)return;const input=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(50000)})).min(1).max(100),model:z.string().optional()}).parse(req.body);const project=await Project.findOne({_id:credential.projectId,teamId:credential.teamId}).lean();if(!project)return res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project unavailable.'}});const prompt=input.messages.map(m=>`${m.role}: ${m.content}`).join('\n');const result=await generateForProject(credential.teamId,project,prompt,input.model);res.json({data:result});}catch(error){next(error);}});
app.post('/v1/embeddings',async(req,res,next)=>{try{const credential=await gatewayCredential(req,res);if(!credential)return;const input=z.object({input:z.union([z.string().min(1).max(50000),z.array(z.string().min(1).max(50000)).min(1).max(32)]),model:z.string().optional()}).parse(req.body);const project=await Project.findOne({_id:credential.projectId,teamId:credential.teamId}).lean();if(!project)return res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project unavailable.'}});if(!project.aiEnabled||project.status!=='active')return res.status(403).json({error:{code:'PROJECT_AI_DISABLED',message:'AI access is disabled for this project.'}});const workspaceModel=await getWorkspaceModel(credential.teamId);const modelId=workspaceModel||input.model||project.model;const effectiveProvider=workspaceModel?'gemini':project.provider;if(!modelId||(!workspaceModel&&modelId!==project.model))return res.status(400).json({error:{code:'MODEL_NOT_ALLOWED',message:'Requested model is not configured for this project.'}});const model=await ModelRecord.findOne({teamId:credential.teamId,provider:effectiveProvider,modelId,active:true,verifiedAt:{$ne:null}}).lean();if(!model?.capabilities?.includes('embedContent'))return res.status(409).json({error:{code:'MODEL_CAPABILITY_UNAVAILABLE',message:'Project model does not provide verified embedding capability.'}});if(await Budget.exists({teamId:credential.teamId,projectId:project._id,hardLimit:true}))return res.status(409).json({error:{code:'EMBEDDING_BUDGET_UNAVAILABLE',message:'Embedding requests are disabled for projects with hard budgets until token reservations are supported.'}});const provider=await Provider.findOne({teamId:credential.teamId,name:'gemini',enabled:true,status:'connected'}).select('+encryptedApiKey');if(!provider)return res.status(409).json({error:{code:'PROVIDER_NOT_CONNECTED',message:'Gemini provider is not connected.'}});const ai=new GoogleGenAI({apiKey:decryptSecret(provider.encryptedApiKey),httpOptions:{timeout:120_000}});const inputs=Array.isArray(input.input)?input.input:[input.input];const started=Date.now();const counted=await Promise.all(inputs.map((contents)=>ai.models.countTokens({model:modelId,contents})));const inputTokens=counted.reduce((sum,item)=>sum+(item.totalTokens??0),0);const embedded=await ai.models.embedContent({model:modelId,contents:inputs});const pricing=await ModelPricing.findOne({teamId:credential.teamId,provider:effectiveProvider,modelId,effectiveAt:{$lte:new Date()}}).sort({effectiveAt:-1}).lean();const cost=pricing?(inputTokens*pricing.inputPricePerMillion)/1_000_000:null;await Usage.create({teamId:credential.teamId,projectId:project._id,provider:'gemini',model:modelId,pricingId:pricing?._id??null,inputTokens,totalTokens:inputTokens,estimatedCostUsd:cost,latencyMs:Date.now()-started,status:'succeeded'});await Credential.updateOne({_id:credential._id},{$set:{lastUsedAt:new Date()}});res.json({data:{model:modelId,embeddings:embedded.embeddings??[],usage:{inputTokens,estimatedCostUsd:cost}}});}catch(error){next(error);}});
app.get('/v1/models',async(req,res,next)=>{try{const credential=await gatewayCredential(req,res);if(!credential)return;const project=await Project.findOne({_id:credential.projectId,teamId:credential.teamId}).lean();if(!project)return res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project unavailable.'}});const workspaceModel=await getWorkspaceModel(credential.teamId);const rows=await ModelRecord.find({teamId:credential.teamId,provider:workspaceModel?'gemini':project.provider,active:true,modelId:workspaceModel||project.model,verifiedAt:{$ne:null}}).select('provider modelId displayName capabilities inputTokenLimit outputTokenLimit').lean();res.json({data:rows});}catch(error){next(error);}});
app.get('/v1/projects/me',async(req,res,next)=>{try{const credential=await gatewayCredential(req,res);if(!credential)return;const project=await Project.findOne({_id:credential.projectId,teamId:credential.teamId}).select('name slug status environment aiEnabled provider model').lean();if(!project)return res.status(401).json({error:{code:'INVALID_CREDENTIAL',message:'Project unavailable.'}});const workspaceModel=await getWorkspaceModel(credential.teamId);res.json({data:{...project,provider:workspaceModel?'gemini':project.provider,model:workspaceModel||project.model,globalModelOverride:Boolean(workspaceModel)}});}catch(error){next(error);}});
app.get('/v1/usage/me',async(req,res,next)=>{try{const credential=await gatewayCredential(req,res);if(!credential)return;const [data]=await Usage.aggregate([{$match:{teamId:credential.teamId,projectId:credential.projectId}},{$group:{_id:null,requests:{$sum:1},tokens:{$sum:'$totalTokens'},estimatedCostUsd:{$sum:'$estimatedCostUsd'}}}]);res.json({data:data??{requests:0,tokens:0,estimatedCostUsd:null}});}catch(error){next(error);}});
app.get('/api/v1/logs', async (req: AuthenticatedRequest, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25)); const filter: Record<string, unknown> = { teamId: req.auth!.teamId }; if (req.query.projectId) filter.projectId = req.query.projectId; if (req.query.status) filter.status = req.query.status; if (req.query.q) filter.model = { $regex: String(req.query.q).slice(0, 80), $options: 'i' }; const [data, total] = await Promise.all([Usage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Usage.countDocuments(filter)]); res.json({ data, page, limit, total }); } catch (error) { next(error); } });
app.get('/api/v1/analytics/overview', async (req: AuthenticatedRequest, res, next) => { try { const since = new Date(Date.now() - (Number(req.query.days) || 30) * 86400000); const [summary] = await Usage.aggregate([{ $match: { teamId: req.auth!.teamId, createdAt: { $gte: since } } }, { $group: { _id: null, requests: { $sum: 1 }, succeeded: { $sum: { $cond: [{ $eq: ['$status','succeeded'] },1,0] } }, failed: { $sum: { $cond: [{ $eq: ['$status','failed'] },1,0] } }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' }, avgLatencyMs: { $avg: '$latencyMs' }, estimatedCostUsd: { $sum: '$estimatedCostUsd' }, pricedRequests: { $sum: { $cond: [{ $ne: ['$estimatedCostUsd',null] },1,0] } } } }]); res.json({ data: summary ? { ...summary, successRate: summary.requests ? summary.succeeded / summary.requests : 0, estimatedCostUsd: summary.pricedRequests ? summary.estimatedCostUsd : null } : { requests: 0, succeeded: 0, failed: 0, inputTokens: 0, outputTokens: 0, avgLatencyMs: null, successRate: null, estimatedCostUsd: null }, since, source: 'persisted_usage_events' }); } catch (error) { next(error); } });
app.get('/api/v1/analytics/usage', async (req: AuthenticatedRequest, res, next) => { try { const days = Math.min(365, Math.max(1, Number(req.query.days) || 30)); const since = new Date(Date.now() - days * 86400000); const data = await Usage.aggregate([{ $match: { teamId: req.auth!.teamId, createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requests: { $sum: 1 }, tokens: { $sum: '$totalTokens' }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' } } }, { $sort: { _id: 1 } }]); res.json({ data, since }); } catch (error) { next(error); } });
app.get('/api/v1/prompts', async (req: AuthenticatedRequest, res, next) => { try { const q = String(req.query.q ?? '').slice(0,100); const filter: Record<string, unknown> = { teamId: req.auth!.teamId }; if (q) filter.$or = [{ title: { $regex: q, $options: 'i' } },{ body: { $regex: q, $options: 'i' } }]; res.json({ data: await Prompt.find(filter).sort({ updatedAt: -1 }).lean() }); } catch (error) { next(error); } });
app.post('/api/v1/prompts', async (req: AuthenticatedRequest, res, next) => { try { const input = z.object({ title: z.string().trim().min(1).max(160), body: z.string().min(1).max(20000), category: z.string().trim().max(80).optional(), tags: z.array(z.string().trim().max(40)).max(20).optional() }).parse(req.body); const row = await Prompt.create({ ...input, teamId: req.auth!.teamId }); await Audit.create({ teamId: req.auth!.teamId, actorId: req.auth!.userId, action: 'prompt.created', resourceType: 'prompt', resourceId: String(row._id) }); res.status(201).json({ data: row }); } catch (error) { next(error); } });
app.patch('/api/v1/prompts/:id', async (req: AuthenticatedRequest, res, next) => { try { const input = z.object({ title: z.string().trim().min(1).max(160).optional(), body: z.string().min(1).max(20000).optional(), category: z.string().trim().max(80).optional(), tags: z.array(z.string().trim().max(40)).max(20).optional() }).parse(req.body); const row = await Prompt.findOneAndUpdate({ _id: req.params.id, teamId: req.auth!.teamId }, { $set: { ...input, updatedAt: new Date() } }, { new: true }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }); res.json({ data: row }); } catch (error) { next(error); } });
app.delete('/api/v1/prompts/:id', async (req: AuthenticatedRequest, res, next) => { try { const row = await Prompt.findOneAndDelete({ _id: req.params.id, teamId: req.auth!.teamId }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Prompt not found.' } }); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/v1/budgets', async (req: AuthenticatedRequest, res, next) => { try { const rows = await Budget.find({ teamId: req.auth!.teamId }).lean(); const ids = rows.map((row: any) => row.projectId); const projects = await Project.find({ _id: { $in: ids }, teamId: req.auth!.teamId }).select('name slug').lean(); const names = new Map(projects.map((p: any) => [String(p._id), p])); res.json({ data: rows.map((row: any) => ({ ...row, project: names.get(String(row.projectId)) ?? null })) }); } catch (error) { next(error); } });
app.put('/api/v1/projects/:id/budget', async (req: AuthenticatedRequest, res, next) => { try { const auth = req.auth!; if (!['owner','admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); const project = await Project.exists({ _id: req.params.id, teamId: auth.teamId }); if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found.' } }); const input = z.object({ monthlyLimitUsd: z.number().positive().max(10000000), dailyLimitUsd: z.number().min(0).max(1000000).default(0), hardLimit: z.boolean().default(true) }).parse(req.body); const now = new Date(); const row = await Budget.findOneAndUpdate({ teamId: auth.teamId, projectId: req.params.id }, { $set: { ...input, updatedAt: now }, $setOnInsert: { monthSpentUsd: 0, monthReservedUsd: 0, daySpentUsd: 0, dayReservedUsd: 0, monthKey: `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}`, dayKey: now.toISOString().slice(0,10) } }, { upsert: true, new: true, runValidators: true }); await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'budget.updated', resourceType: 'budget', resourceId: String(row._id) }); res.json({ data: row }); } catch (error) { next(error); } });
app.delete('/api/v1/projects/:id/budget', async (req: AuthenticatedRequest, res, next) => { try { const auth = req.auth!; if (!['owner','admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); await Budget.deleteOne({ teamId: auth.teamId, projectId: req.params.id }); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/v1/notifications', async (req: AuthenticatedRequest, res, next) => { try { const rows = await Notification.find({ teamId: req.auth!.teamId }).sort({ createdAt: -1 }).limit(100).lean(); res.json({ data: rows, unreadCount: rows.filter((row: any) => !row.readAt).length }); } catch (error) { next(error); } });
app.patch('/api/v1/notifications/read-all', async (req: AuthenticatedRequest, res, next) => { try { await Notification.updateMany({ teamId: req.auth!.teamId, readAt: null }, { $set: { readAt: new Date() } }); res.status(204).end(); } catch (error) { next(error); } });
app.patch('/api/v1/notifications/:id/read', async (req: AuthenticatedRequest, res, next) => { try { const row = await Notification.findOneAndUpdate({ _id: req.params.id, teamId: req.auth!.teamId }, { $set: { readAt: new Date() } }, { new: true }); if (!row) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Notification not found.' } }); res.json({ data: row }); } catch (error) { next(error); } });
app.delete('/api/v1/notifications/:id', async (req: AuthenticatedRequest, res, next) => { try { await Notification.deleteOne({ _id: req.params.id, teamId: req.auth!.teamId }); res.status(204).end(); } catch (error) { next(error); } });
app.get('/api/v1/audit', async (req: AuthenticatedRequest, res, next) => { try { const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50)); const [data,total]=await Promise.all([Audit.find({ teamId: req.auth!.teamId }).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean(),Audit.countDocuments({ teamId: req.auth!.teamId })]); res.json({ data, page, limit, total }); } catch (error) { next(error); } });
app.get('/api/v1/settings', async (req: AuthenticatedRequest, res, next) => { try { const row = await Setting.findOneAndUpdate({ teamId: req.auth!.teamId }, { $setOnInsert: { teamId: req.auth!.teamId } }, { upsert: true, new: true, setDefaultsOnInsert: true }); res.json({ data: row }); } catch (error) { next(error); } });
app.patch('/api/v1/settings', async (req: AuthenticatedRequest, res, next) => { try { const auth = req.auth!; if (!['owner','admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); const input = z.object({ name: z.string().trim().min(1).max(100).optional(), retentionDays: z.number().int().min(1).max(3650).optional(), promptRetention: z.boolean().optional() }).parse(req.body); const row = await Setting.findOneAndUpdate({ teamId: auth.teamId }, { $set: { ...input, updatedAt: new Date() }, $setOnInsert: { teamId: auth.teamId } }, { upsert: true, new: true }); await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'settings.updated', resourceType: 'settings' }); res.json({ data: row }); } catch (error) { next(error); } });
app.get('/api/v1/team', async (req: AuthenticatedRequest, res, next) => { try { const members = await User.find({ teamId: req.auth!.teamId }).select('-passwordHash').sort({ createdAt: 1 }).lean(); const invitations = await Invitation.find({ teamId: req.auth!.teamId, acceptedAt: null, expiresAt: { $gt: new Date() } }).select('-tokenHash').lean(); res.json({ data: { members, invitations } }); } catch (error) { next(error); } });
app.post('/api/v1/team/invitations', async (req: AuthenticatedRequest, res, next) => { try { const auth = req.auth!; if (!['owner','admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); const input = z.object({ email: z.string().email().max(254), role: z.enum(['admin','developer','analyst','viewer']) }).parse(req.body); if (await User.exists({ email: input.email.toLowerCase() })) return res.status(409).json({ error: { code: 'EMAIL_EXISTS', message: 'This email already belongs to a workspace member.' } }); const token = randomBytes(32).toString('base64url'); const invite = await Invitation.create({ teamId: auth.teamId, email: input.email, role: input.role, tokenHash: hashToken(token), invitedBy: auth.userId, expiresAt: new Date(Date.now()+7*86400000) }); await Audit.create({ teamId: auth.teamId, actorId: auth.userId, action: 'team.invitation.created', resourceType: 'invitation', resourceId: String(invite._id) }); res.status(201).json({ data: { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt, invitationToken: token } }); } catch (error) { next(error); } });
app.delete('/api/v1/team/invitations/:id', async (req: AuthenticatedRequest, res, next) => { try { if (!['owner','admin'].includes(req.auth!.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); await Invitation.deleteOne({ _id: req.params.id, teamId: req.auth!.teamId, acceptedAt: null }); res.status(204).end(); } catch (error) { next(error); } });
app.patch('/api/v1/team/:id', async (req: AuthenticatedRequest, res, next) => { try { const auth=req.auth!; if (!['owner','admin'].includes(auth.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Owner or admin role required.' } }); const input=z.object({ role:z.enum(['admin','developer','analyst','viewer']).optional(),suspended:z.boolean().optional() }).parse(req.body); const row=await User.findOneAndUpdate({ _id:req.params.id,teamId:auth.teamId,role:{ $ne:'owner' } },{ $set:input },{ new:true }).select('-passwordHash'); if(!row)return res.status(404).json({error:{code:'NOT_FOUND',message:'Team member not found or is the owner.'}}); if(input.suspended)await Session.deleteMany({userId:row._id}); await Audit.create({teamId:auth.teamId,actorId:auth.userId,action:'team.member.updated',resourceType:'user',resourceId:String(row._id)});res.json({data:row}); }catch(error){next(error);} });
app.delete('/api/v1/team/:id', async (req: AuthenticatedRequest, res, next) => { try { const auth=req.auth!; if(auth.role!=='owner')return res.status(403).json({error:{code:'FORBIDDEN',message:'Owner role required.'}}); const row=await User.findOneAndDelete({_id:req.params.id,teamId:auth.teamId,role:{$ne:'owner'}});if(!row)return res.status(404).json({error:{code:'NOT_FOUND',message:'Team member not found or is the owner.'}});await Session.deleteMany({userId:row._id});await Audit.create({teamId:auth.teamId,actorId:auth.userId,action:'team.member.removed',resourceType:'user',resourceId:String(row._id)});res.status(204).end();}catch(error){next(error);} });
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.issues.map((i) => i.message).join(', ') } });
  if (error && typeof error === 'object' && 'status' in error) return res.status(Number((error as {status:unknown}).status)).json({ error: { code: 'code' in error ? String((error as {code:unknown}).code) : 'REQUEST_FAILED', message: error instanceof Error ? error.message : 'Request could not be completed.' } });
  if (error instanceof mongoose.Error) return res.status(400).json({ error: { code: 'DATABASE_ERROR', message: error.message } });
  logger.error({ err: error }, 'Request failed'); return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed.' } });
});

const port = Number(process.env.PORT) || 4000;
if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(() => logger.info('MongoDB connected')).catch((err) => logger.error({ err }, 'MongoDB connection failed'));
const reservationCleanup = setInterval(async () => { if (mongoose.connection.readyState !== 1) return; try { const expired = await BudgetReservation.find({ state: 'reserved', expiresAt: { $lte: new Date() } }).limit(100); for (const record of expired) await settleBudgetReservation(record, 'released'); } catch (err) { logger.error({ err }, 'Budget reservation cleanup failed'); } }, 60_000);
reservationCleanup.unref();
const retentionCleanup = setInterval(async () => { if (mongoose.connection.readyState !== 1) return; try { const settings = await Setting.find().lean(); const now = Date.now(); for (const setting of settings) { const cutoff = new Date(now - setting.retentionDays * 86400000); await Usage.deleteMany({ teamId: setting.teamId, createdAt: { $lt: cutoff } }); } } catch (err) { logger.error({ err }, 'Usage retention cleanup failed'); } }, 24 * 60 * 60 * 1000);
retentionCleanup.unref();
const server = app.listen(port, '0.0.0.0', () => logger.info({ port }, 'Kenora AI Hub API listening'));
const shutdown = () => { clearInterval(reservationCleanup); clearInterval(retentionCleanup); server.close(() => { void mongoose.disconnect().finally(() => process.exit(0)); }); };
process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
