import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { DEFAULT_USERS } from '../src/shared/seedBuddha.js';
import { adminAuth } from './firebaseAdmin.js';
import {
  buildFirstRunDatabase,
  loadAuthStore,
  readDatabase,
  readVersion,
  saveAuthStore,
  VersionConflictError,
  writeDatabase,
  type DeveloperAuthStore,
} from './store.js';
import {
  AnnualPlan,
  Contract,
  ContractAdjustment,
  DatabaseState,
  Entry,
  getDefaultPermissionsForRole,
  RegistryItem,
  RegistryType,
  UserPermissions,
  UserProfile,
  UserRole,
} from '../src/types/buddha.js';

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeUsers(usersInput: unknown): UserProfile[] {
  const list = Array.isArray(usersInput) ? (usersInput as Partial<UserProfile>[]) : [];
  if (list.length === 0) {
    return DEFAULT_USERS.map((u) => ({ ...u, permissoes: { ...u.permissoes } }));
  }

  const normalized: UserProfile[] = list.map((u, idx) => {
    const role: UserRole =
      u.role === 'developer' || u.role === 'admin' || u.role === 'editor' || u.role === 'viewer'
        ? u.role
        : 'viewer';
    const defaults = getDefaultPermissionsForRole(role);
    const perms = u.permissoes
      ? {
          painelAnalytics: Boolean(u.permissoes.painelAnalytics ?? defaults.painelAnalytics),
          lancamentos: Boolean(u.permissoes.lancamentos ?? defaults.lancamentos),
          contratos: Boolean(u.permissoes.contratos ?? defaults.contratos),
          planejamento: Boolean(u.permissoes.planejamento ?? defaults.planejamento),
          cadastros: Boolean(u.permissoes.cadastros ?? defaults.cadastros),
          relatorios: Boolean(u.permissoes.relatorios ?? defaults.relatorios),
          gerenciarUsuarios: role === 'developer',
        }
      : defaults;

    return {
      id: typeof u.id === 'string' && u.id.trim() ? u.id : `usr-${idx + 1}`,
      nome: typeof u.nome === 'string' && u.nome.trim() ? u.nome.trim() : 'Usuário DHO',
      email: typeof u.email === 'string' ? u.email.trim().toLowerCase() : '',
      role,
      cargo: typeof u.cargo === 'string' ? u.cargo.trim() : '',
      ativo: u.ativo !== false,
      permissoes: perms,
      criadoPor: u.criadoPor,
      criadoEm: u.criadoEm,
      atualizadoPor: u.atualizadoPor,
      atualizadoEm: u.atualizadoEm,
    };
  });

  if (!normalized.some((u) => u.role === 'developer' && u.ativo)) {
    const devSeed = DEFAULT_USERS[0];
    normalized.unshift({ ...devSeed, permissoes: { ...devSeed.permissoes } });
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Estado em memória + persistência no Firestore
//
// Em ambiente serverless (Vercel) cada requisição pode cair em uma instância
// diferente, então o estado é (re)carregado a cada requisição. Para não ler o
// banco inteiro toda vez, guardamos um cache e só relemos quando a versão no
// Firestore mudou (1 leitura barata do documento "meta").
// ---------------------------------------------------------------------------
let db!: DatabaseState;
let cachedVersion: number | null = null;
let dirty = false;

function saveDatabase() {
  db.version = (db.version || 1) + 1;
  dirty = true;
}

// no-op: o tempo real foi substituído por atualização periódica (polling) no cliente
function broadcastSync(_eventLabel = 'state:updated') {}

async function ensureLoaded() {
  const remoteVersion = await readVersion();
  if (remoteVersion !== null && db && cachedVersion === remoteVersion) return;

  let loaded = await readDatabase();
  if (!loaded) {
    loaded = buildFirstRunDatabase();
    await writeDatabase(loaded, null);
  } else {
    loaded.users = normalizeUsers(loaded.users);
  }
  db = loaded;
  cachedVersion = loaded.version;
}

async function persistIfDirty() {
  if (!dirty) return;
  try {
    await writeDatabase(db, cachedVersion);
    cachedVersion = db.version;
  } catch (err) {
    cachedVersion = null; // força recarga na próxima requisição
    throw err;
  } finally {
    dirty = false;
  }
}

// Serializa as requisições dentro da mesma instância (evita intercalar load/mutate/save).
let lockChain: Promise<void> = Promise.resolve();

// ---------------------------------------------------------------------------
// Chave do desenvolvedor (2º fator) e sessão elevada SEM estado em memória:
// o token é assinado com HMAC (SESSION_SECRET), então funciona em serverless.
// ---------------------------------------------------------------------------
function hashPasscode(passcode: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyScryptPasscode(passcode: string, record: { salt: string; hash: string }): boolean {
  try {
    const derived = crypto.scryptSync(passcode, record.salt, 64);
    const stored = Buffer.from(record.hash, 'hex');
    if (derived.length !== stored.length) return false;
    return crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

function verifyEnvPasscode(passcode: string, envCode: string): boolean {
  const a = crypto.createHash('sha256').update(passcode).digest();
  const b = crypto.createHash('sha256').update(envCode).digest();
  return crypto.timingSafeEqual(a, b);
}

async function getDeveloperAuthStatus(): Promise<{
  configured: boolean;
  source: 'env' | 'local' | 'none';
}> {
  const envCode = process.env.DEVELOPER_ACCESS_CODE?.trim();
  if (envCode) {
    return { configured: true, source: 'env' };
  }
  const store = await loadAuthStore();
  if (store.developerKeyHash?.hash && store.developerKeyHash?.salt) {
    return { configured: true, source: 'local' };
  }
  return { configured: false, source: 'none' };
}

const DEV_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

function issueDeveloperSession(userId: string): string {
  const payload = `${userId}.${Date.now() + DEV_SESSION_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

function extractDevToken(req: Request): string | null {
  const token = String(req.header('x-dev-token') || '').trim();
  return token || null;
}

function verifyDeveloperSession(req: Request): { userId: string } | null {
  const token = extractDevToken(req);
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  let payload: string;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const sep = payload.lastIndexOf('.');
  const userId = payload.slice(0, sep);
  const expiresAt = Number(payload.slice(sep + 1));
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;
  // o token só vale para o MESMO usuário autenticado no Firebase
  const ctx = (req as AuthedRequest).authCtx;
  if (!ctx || ctx.userId !== userId) return null;
  return { userId };
}

// Limite simples de tentativas na chave do desenvolvedor (por usuário, por instância).
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();
function tooManyUnlockAttempts(key: string): boolean {
  const now = Date.now();
  const entry = unlockAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    unlockAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 8;
}

interface AuthContext {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  ativo: boolean;
  permissoes: UserPermissions;
}

interface AuthedRequest extends Request {
  authCtx?: AuthContext;
  firebaseUid?: string;
}

/**
 * A identidade vem EXCLUSIVAMENTE do ID token do Firebase (verificado no servidor).
 * Cabeçalhos como x-user-id enviados pelo cliente são ignorados.
 */
function getAuthContext(req: Request): AuthContext {
  const ctx = (req as AuthedRequest).authCtx;
  if (ctx) return ctx;
  return {
    userId: '',
    role: 'viewer',
    name: 'Anônimo',
    email: '',
    ativo: false,
    permissoes: getDefaultPermissionsForRole('viewer'),
  };
}

function requireRole(allowed: UserRole[], modulePerm?: keyof UserPermissions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = getAuthContext(req);
    if (!ctx.ativo) {
      res.status(403).json({ error: 'Este usuário está desativado. Contate o Desenvolvedor.' });
      return;
    }

    const effectiveAllowed = allowed.includes('admin') && !allowed.includes('developer')
      ? [...allowed, 'developer' as UserRole]
      : allowed;

    if (!effectiveAllowed.includes(ctx.role)) {
      res.status(403).json({
        error:
          ctx.role === 'viewer'
            ? 'Perfil Visualizador (somente leitura) não possui permissão para alterar dados.'
            : 'Seu nível de acesso não possui permissão para esta operação.',
      });
      return;
    }

    if (modulePerm && !ctx.permissoes[modulePerm]) {
      res.status(403).json({
        error: 'Seu usuário não possui permissão habilitada para este módulo.',
      });
      return;
    }

    next();
  };
}

function requireDeveloperPermission(req: Request, res: Response, next: NextFunction) {
  const ctx = getAuthContext(req);
  if (!ctx.ativo || ctx.role !== 'developer') {
    res.status(403).json({
      error: 'Operação exclusiva do perfil Desenvolvedor.',
    });
    return;
  }

  const session = verifyDeveloperSession(req);
  if (!session) {
    res.status(403).json({
      error: 'Permissão do Desenvolvedor bloqueada. Informe a chave de autorização do desenvolvedor.',
    });
    return;
  }

  next();
}


function ensureSupplierInRegistry(fornecedor: string, author: string, now: string) {
  const clean = fornecedor.trim();
  if (!clean) return;
  const exists = db.registries.fornecedores.some(
    (f) => f.nome.toUpperCase() === clean.toUpperCase()
  );
  if (!exists) {
    db.registries.fornecedores.push({
      id: genId('for'),
      nome: clean.toUpperCase(),
      apelidos: [],
      criadoPor: author,
      criadoEm: now,
      atualizadoPor: author,
      atualizadoEm: now,
    });
  }
}

function countRegistryUsage(type: RegistryType, nome: string): number {
  const target = nome.toLowerCase();
  let count = 0;

  if (type === 'categorias') {
    count += db.entries.filter((e) => e.categoria.toLowerCase() === target).length;
    count += db.contracts.filter((c) => c.categoria.toLowerCase() === target).length;
    for (const plan of Object.values(db.plans)) {
      const vals = plan.tetos[nome];
      if (vals && vals.some((v) => v > 0)) count += 1;
    }
  } else if (type === 'empresas') {
    count += db.entries.filter((e) => e.empresa.toLowerCase() === target).length;
    count += db.contracts.filter((c) => c.empresa.toLowerCase() === target).length;
  } else if (type === 'departamentos') {
    count += db.entries.filter((e) => e.departamento.toLowerCase() === target).length;
    count += db.contracts.filter((c) => c.departamento.toLowerCase() === target).length;
  } else if (type === 'fornecedores') {
    count += db.entries.filter((e) => e.fornecedor.toLowerCase() === target).length;
    count += db.contracts.filter((c) => c.fornecedor.toLowerCase() === target).length;
  }

  return count;
}

function propagateRegistryRename(type: RegistryType, oldName: string, newName: string) {
  const oldLower = oldName.toLowerCase();

  if (type === 'categorias') {
    db.entries = db.entries.map((e) =>
      e.categoria.toLowerCase() === oldLower ? { ...e, categoria: newName } : e
    );
    db.contracts = db.contracts.map((c) =>
      c.categoria.toLowerCase() === oldLower ? { ...c, categoria: newName } : c
    );
    for (const plan of Object.values(db.plans)) {
      if (plan.tetos[oldName]) {
        const existingTarget = plan.tetos[newName] || Array(12).fill(0);
        plan.tetos[newName] = existingTarget.map(
          (v, idx) => v + (plan.tetos[oldName][idx] || 0)
        );
        delete plan.tetos[oldName];
      }
    }
  } else if (type === 'empresas') {
    db.entries = db.entries.map((e) =>
      e.empresa.toLowerCase() === oldLower ? { ...e, empresa: newName } : e
    );
    db.contracts = db.contracts.map((c) =>
      c.empresa.toLowerCase() === oldLower ? { ...c, empresa: newName } : c
    );
  } else if (type === 'departamentos') {
    db.entries = db.entries.map((e) =>
      e.departamento.toLowerCase() === oldLower ? { ...e, departamento: newName } : e
    );
    db.contracts = db.contracts.map((c) =>
      c.departamento.toLowerCase() === oldLower ? { ...c, departamento: newName } : c
    );
  } else if (type === 'fornecedores') {
    db.entries = db.entries.map((e) =>
      e.fornecedor.toLowerCase() === oldLower ? { ...e, fornecedor: newName } : e
    );
    db.contracts = db.contracts.map((c) =>
      c.fornecedor.toLowerCase() === oldLower ? { ...c, fornecedor: newName } : c
    );
  }
}

/** Garante a conta no Firebase Auth do usuário cadastrado (e-mail já considerado verificado pelo Desenvolvedor). */
async function syncAuthAccount(opts: { email: string; nome: string; ativo: boolean; previousEmail?: string }) {
  const auth = adminAuth();
  const lookup = opts.previousEmail && opts.previousEmail !== opts.email ? opts.previousEmail : opts.email;
  try {
    const existing = await auth.getUserByEmail(lookup);
    await auth.updateUser(existing.uid, {
      email: opts.email,
      displayName: opts.nome,
      disabled: !opts.ativo,
      emailVerified: true,
    });
  } catch (err) {
    if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    await auth.createUser({
      email: opts.email,
      displayName: opts.nome,
      disabled: !opts.ativo,
      emailVerified: true,
      // senha aleatória: o usuário define a dele pelo link "Primeiro acesso / esqueci a senha"
      password: crypto.randomBytes(24).toString('base64url'),
    });
  }
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // Cabeçalhos de segurança básicos para a API
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Diagnóstico público e SEM segredos: mostra o que o servidor enxerga na configuração.
  app.get('/api/health', async (_req: Request, res: Response) => {
    const env = process.env;
    const key = env.FIREBASE_PRIVATE_KEY || '';
    const info: Record<string, unknown> = {
      node: process.version,
      projectId: env.FIREBASE_PROJECT_ID || null,
      clientEmail: env.FIREBASE_CLIENT_EMAIL || null,
      privateKey: {
        presente: key.length > 0,
        comecaComBegin: key.replace(/^["'\s]+/, '').startsWith('-----BEGIN PRIVATE KEY-----'),
        terminaComEnd: key.replace(/["'\s]+$/, '').replace(/\\n$/, '').trim().endsWith('-----END PRIVATE KEY-----'),
        temQuebrasReais: key.includes('\n'),
        temBarraNLiteral: key.includes('\\n'),
        comAspasNasPontas: /^["']|["']$/.test(key.trim()),
        tamanho: key.length,
      },
      vars: {
        SESSION_SECRET: Boolean(env.SESSION_SECRET && env.SESSION_SECRET.length >= 32),
        DEVELOPER_ACCESS_CODE: Boolean(env.DEVELOPER_ACCESS_CODE),
        BOOTSTRAP_DEVELOPER_EMAIL: env.BOOTSTRAP_DEVELOPER_EMAIL || null,
      },
    };
    try {
      await adminAuth().listUsers(1);
      info.firebaseAuth = 'ok';
    } catch (err) {
      info.firebaseAuth = `ERRO ${(err as { code?: string })?.code || ''}: ${String((err as Error)?.message).slice(0, 200)}`;
    }
    try {
      info.firestoreVersion = await readVersion();
    } catch (err) {
      info.firestore = `ERRO ${(err as { code?: string })?.code || ''}: ${String((err as Error)?.message).slice(0, 200)}`;
    }
    res.json(info);
  });

  // Tudo em /api exige login Firebase válido + usuário ativo cadastrado.
  // Também serializa as requisições, carrega o estado e grava (antes de responder) se houve mudança.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const prev = lockChain;
    let release!: () => void;
    lockChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    res.on('close', release);

    prev
      .then(async () => {
        // 1) autenticação (ID token do Firebase)
        const header = String(req.header('authorization') || '');
        if (!header.toLowerCase().startsWith('bearer ')) {
          res.status(401).json({ error: 'Faça login para continuar.' });
          return;
        }
        let decoded;
        try {
          decoded = await adminAuth().verifyIdToken(header.slice(7).trim());
        } catch (err) {
          const code = String((err as { code?: string })?.code || '');
          console.error('verifyIdToken falhou:', code, (err as Error)?.message);
          if (code.startsWith('auth/')) {
            res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
          } else {
            // credenciais do servidor inválidas/ausentes: não é culpa do usuário
            res.status(500).json({ error: 'Falha de configuração do servidor (credenciais do Firebase).' });
          }
          return;
        }
        const email = String(decoded.email || '').trim().toLowerCase();
        if (!email || decoded.email_verified === false) {
          res.status(403).json({ error: 'E-mail não verificado.' });
          return;
        }

        // 2) estado do banco
        await ensureLoaded();

        // 3) usuário precisa existir no cadastro do sistema e estar ativo
        const matched = db.users.find((u) => u.email.toLowerCase() === email);
        if (!matched || matched.ativo === false) {
          res.status(403).json({
            error: 'Seu e-mail não está autorizado neste sistema. Solicite acesso ao Desenvolvedor.',
          });
          return;
        }
        const authed = req as AuthedRequest;
        authed.firebaseUid = decoded.uid;
        authed.authCtx = {
          userId: matched.id,
          role: matched.role,
          name: matched.nome,
          email: matched.email,
          ativo: matched.ativo,
          permissoes: matched.permissoes,
        };

        // 4) grava no Firestore ANTES de responder, quando o handler alterou algo
        const originalJson = res.json.bind(res);
        res.json = ((body?: unknown) => {
          if (!dirty) return originalJson(body);
          persistIfDirty()
            .then(() => originalJson(body))
            .catch((err) => {
              console.error('Falha ao gravar no Firestore:', err);
              res.status(err instanceof VersionConflictError ? 409 : 500);
              originalJson({
                error:
                  err instanceof VersionConflictError
                    ? err.message
                    : 'Não foi possível salvar os dados. Tente novamente.',
              });
            });
          return res;
        }) as Response['json'];

        next();
      })
      .catch((err) => {
        console.error('Erro no pré-processamento da requisição:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Erro interno do servidor.' });
        }
      });
  });

  // Estado completo compartilhado
  app.get('/api/state', (_req: Request, res: Response) => {
    res.json({ state: db, activeClients: 1 });
  });

  // Developer Authorization & Key Management Routes
  app.get('/api/dev/status', async (req: Request, res: Response) => {
    const status = await getDeveloperAuthStatus();
    const session = verifyDeveloperSession(req);
    res.json({
      configured: status.configured,
      source: status.source,
      unlocked: Boolean(session),
    });
  });

  app.post('/api/dev/setup', async (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    if (!ctx.ativo || ctx.role !== 'developer') {
      res.status(403).json({ error: 'Somente um usuário com nível Desenvolvedor pode configurar a chave.' });
      return;
    }

    const status = await getDeveloperAuthStatus();
    if (status.configured) {
      res.status(409).json({
        error: 'A chave de permissão do desenvolvedor já está configurada. Utilize o desbloqueio.',
      });
      return;
    }

    const { passcode } = req.body as { passcode?: string };
    const cleanPass = String(passcode || '').trim();
    if (cleanPass.length < 10) {
      res.status(400).json({ error: 'A chave de desenvolvedor deve ter pelo menos 10 caracteres.' });
      return;
    }

    const hashed = hashPasscode(cleanPass);
    await saveAuthStore({
      developerKeyHash: {
        ...hashed,
        updatedAt: new Date().toISOString(),
      },
    });

    const token = issueDeveloperSession(ctx.userId);
    res.status(201).json({
      configured: true,
      source: 'local',
      unlocked: true,
      token,
    });
  });

  app.post('/api/dev/unlock', async (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    if (!ctx.ativo || ctx.role !== 'developer') {
      res.status(403).json({
        error: 'Somente usuários com nível Desenvolvedor podem desbloquear estas permissões.',
      });
      return;
    }

    if (tooManyUnlockAttempts(ctx.userId)) {
      res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
      return;
    }

    const { passcode } = req.body as { passcode?: string };
    const cleanPass = String(passcode || '').trim();
    if (!cleanPass) {
      res.status(400).json({ error: 'Informe a chave de permissão do desenvolvedor.' });
      return;
    }

    const envCode = process.env.DEVELOPER_ACCESS_CODE?.trim();
    const status = await getDeveloperAuthStatus();

    if (!status.configured) {
      res.status(400).json({ error: 'Nenhuma chave de desenvolvedor foi configurada ainda.' });
      return;
    }

    let valid = false;
    if (envCode) {
      valid = verifyEnvPasscode(cleanPass, envCode);
    } else {
      const store = await loadAuthStore();
      if (store.developerKeyHash) {
        valid = verifyScryptPasscode(cleanPass, store.developerKeyHash);
      }
    }

    if (!valid) {
      res.status(401).json({ error: 'Chave de permissão do desenvolvedor inválida.' });
      return;
    }

    const token = issueDeveloperSession(ctx.userId);
    res.json({
      configured: true,
      source: status.source,
      unlocked: true,
      token,
    });
  });

  // Sessões do desenvolvedor são tokens assinados e de curta duração; "bloquear" apenas
  // descarta o token no cliente (ele expira sozinho em poucas horas).
  app.post('/api/dev/lock', (_req: Request, res: Response) => {
    res.json({ unlocked: false });
  });

  app.post('/api/dev/change-key', requireDeveloperPermission, async (req: Request, res: Response) => {
    const envCode = process.env.DEVELOPER_ACCESS_CODE?.trim();
    if (envCode) {
      res.status(400).json({
        error: 'A chave está definida na variável de ambiente do servidor (DEVELOPER_ACCESS_CODE) e não pode ser alterada pela interface.',
      });
      return;
    }

    const { currentPasscode, newPasscode } = req.body as {
      currentPasscode?: string;
      newPasscode?: string;
    };
    const curr = String(currentPasscode || '').trim();
    const next = String(newPasscode || '').trim();

    if (!curr || next.length < 10) {
      res.status(400).json({ error: 'Informe a chave atual e uma nova chave com pelo menos 10 caracteres.' });
      return;
    }

    const store: DeveloperAuthStore = await loadAuthStore();
    if (!store.developerKeyHash || !verifyScryptPasscode(curr, store.developerKeyHash)) {
      res.status(401).json({ error: 'A chave atual do desenvolvedor está incorreta.' });
      return;
    }

    const hashed = hashPasscode(next);
    await saveAuthStore({
      developerKeyHash: {
        ...hashed,
        updatedAt: new Date().toISOString(),
      },
    });
    res.json({ message: 'Chave de permissão do desenvolvedor atualizada com sucesso.' });
  });


  // User & Access Level Management (Developer Permission Required)
  app.post('/api/users', requireDeveloperPermission, async (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const body = req.body as Partial<UserProfile>;

    const nome = String(body.nome || '').replace(/\s+/g, ' ').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const cargo = String(body.cargo || '').replace(/\s+/g, ' ').trim();
    const role: UserRole =
      body.role === 'developer' ||
      body.role === 'admin' ||
      body.role === 'editor' ||
      body.role === 'viewer'
        ? body.role
        : 'viewer';

    if (!nome || !email) {
      res.status(400).json({ error: 'Preencha os campos obrigatórios: nome e e-mail do usuário.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
      return;
    }

    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
      return;
    }

    const defaults = getDefaultPermissionsForRole(role);
    const rawPerms = body.permissoes || defaults;
    const permissoes: UserPermissions = {
      painelAnalytics: Boolean(rawPerms.painelAnalytics),
      lancamentos: Boolean(rawPerms.lancamentos),
      contratos: Boolean(rawPerms.contratos),
      planejamento: Boolean(rawPerms.planejamento),
      cadastros: Boolean(rawPerms.cadastros),
      relatorios: Boolean(rawPerms.relatorios),
      gerenciarUsuarios: role === 'developer',
    };

    const user: UserProfile = {
      id: genId('usr'),
      nome,
      email,
      role,
      cargo:
        cargo ||
        `${
          role === 'developer'
            ? 'Desenvolvedor'
            : role === 'admin'
            ? 'Administrador'
            : role === 'editor'
            ? 'Editor'
            : 'Visualizador'
        } · Acesso Buddha DHO`,
      ativo: body.ativo !== false,
      permissoes,
      criadoPor: ctx.name,
      criadoEm: now,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    try {
      await syncAuthAccount({ email, nome, ativo: user.ativo });
    } catch (err) {
      console.error('Falha ao criar conta no Firebase Auth:', err);
      res.status(502).json({ error: 'Não foi possível criar o acesso no Firebase Authentication.' });
      return;
    }

    db.users.push(user);
    saveDatabase();
    broadcastSync('user:created');
    res.status(201).json({ user, state: db });
  });

  app.put('/api/users/:id', requireDeveloperPermission, async (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { id } = req.params;
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const existing = db.users[idx];
    const body = req.body as Partial<UserProfile>;

    const nome = body.nome !== undefined ? String(body.nome).replace(/\s+/g, ' ').trim() : existing.nome;
    const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : existing.email;
    const cargo = body.cargo !== undefined ? String(body.cargo).replace(/\s+/g, ' ').trim() : existing.cargo;
    const nextRole: UserRole =
      body.role === 'developer' ||
      body.role === 'admin' ||
      body.role === 'editor' ||
      body.role === 'viewer'
        ? body.role
        : existing.role;
    const nextAtivo = body.ativo !== undefined ? Boolean(body.ativo) : existing.ativo;

    if (!nome || !email) {
      res.status(400).json({ error: 'Nome e e-mail não podem ficar vazios.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
      return;
    }

    if (db.users.some((u) => u.id !== id && u.email.toLowerCase() === email)) {
      res.status(400).json({ error: 'Já existe outro usuário com este e-mail.' });
      return;
    }

    const otherActiveDevs = db.users.filter(
      (u) => u.id !== id && u.role === 'developer' && u.ativo
    ).length;
    if (existing.role === 'developer' && (nextRole !== 'developer' || !nextAtivo) && otherActiveDevs === 0) {
      res.status(400).json({
        error: 'Não é possível rebaixar ou desativar o único usuário Desenvolvedor ativo do sistema.',
      });
      return;
    }

    const rawPerms = body.permissoes || existing.permissoes;
    const permissoes: UserPermissions = {
      painelAnalytics: Boolean(rawPerms.painelAnalytics),
      lancamentos: Boolean(rawPerms.lancamentos),
      contratos: Boolean(rawPerms.contratos),
      planejamento: Boolean(rawPerms.planejamento),
      cadastros: Boolean(rawPerms.cadastros),
      relatorios: Boolean(rawPerms.relatorios),
      gerenciarUsuarios: nextRole === 'developer',
    };

    const updated: UserProfile = {
      ...existing,
      nome,
      email,
      cargo,
      role: nextRole,
      ativo: nextAtivo,
      permissoes,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    try {
      await syncAuthAccount({ email, nome, ativo: nextAtivo, previousEmail: existing.email });
    } catch (err) {
      console.error('Falha ao atualizar conta no Firebase Auth:', err);
      res.status(502).json({ error: 'Não foi possível atualizar o acesso no Firebase Authentication.' });
      return;
    }

    db.users[idx] = updated;
    saveDatabase();
    broadcastSync('user:updated');
    res.json({ user: updated, state: db });
  });

  app.delete('/api/users/:id', requireDeveloperPermission, async (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const { id } = req.params;
    const target = db.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    if (target.id === ctx.userId) {
      res.status(400).json({ error: 'Não é possível excluir o usuário Desenvolvedor que está em uso.' });
      return;
    }

    const otherActiveDevs = db.users.filter(
      (u) => u.id !== id && u.role === 'developer' && u.ativo
    ).length;
    if (target.role === 'developer' && target.ativo && otherActiveDevs === 0) {
      res.status(400).json({ error: 'Não é possível excluir o único usuário Desenvolvedor ativo.' });
      return;
    }

    try {
      const authUser = await adminAuth().getUserByEmail(target.email);
      await adminAuth().deleteUser(authUser.uid);
    } catch {
      // conta já inexistente no Firebase Auth: segue com a remoção do cadastro
    }

    db.users = db.users.filter((u) => u.id !== id);
    saveDatabase();
    broadcastSync('user:deleted');
    res.json({ state: db });
  });

  // Create Entry
  app.post('/api/entries', requireRole(['admin', 'editor'], 'lancamentos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const body = req.body as Partial<Entry>;

    if (!body.competencia || !body.categoria || !body.descricao || !body.empresa || !body.departamento) {
      res.status(400).json({
        error: 'Preencha os campos obrigatórios: competência, categoria, descrição, empresa e departamento.',
      });
      return;
    }

    const orcado = Math.max(0, Number(body.orcado) || 0);
    const rawReal = Number(body.realizado);
    const realizado = Number.isFinite(rawReal) ? Math.round(rawReal * 100) / 100 : 0;
    const fornecedor = String(body.fornecedor || '').replace(/\s+/g, ' ').trim().toUpperCase();

    if (fornecedor) {
      ensureSupplierInRegistry(fornecedor, ctx.name, now);
    }

    const entry: Entry = {
      id: genId('ent'),
      competencia: body.competencia,
      dataPagamento: body.dataPagamento || '',
      categoria: body.categoria,
      descricao: body.descricao.trim(),
      fornecedor,
      empresa: body.empresa,
      departamento: body.departamento,
      recorrente: Boolean(body.recorrente),
      orcado,
      realizado,
      saldo: Math.round((orcado - realizado) * 100) / 100,
      status: body.status || 'Previsto',
      contratoId: body.contratoId || undefined,
      obs: String(body.obs || '').trim(),
      criadoPor: ctx.name,
      criadoEm: now,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.entries.unshift(entry);
    saveDatabase();
    broadcastSync('entry:created');
    res.status(201).json({ entry, state: db });
  });

  // Update Entry
  app.put('/api/entries/:id', requireRole(['admin', 'editor'], 'lancamentos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { id } = req.params;
    const idx = db.entries.findIndex((e) => e.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Lançamento não encontrado.' });
      return;
    }

    const body = req.body as Partial<Entry>;
    const existing = db.entries[idx];
    const orcado = body.orcado !== undefined ? Math.max(0, Number(body.orcado) || 0) : existing.orcado;
    const rawRealUpdate = body.realizado !== undefined ? Number(body.realizado) : existing.realizado;
    const realizado = Number.isFinite(rawRealUpdate) ? Math.round(rawRealUpdate * 100) / 100 : existing.realizado;
    const fornecedor =
      body.fornecedor !== undefined
        ? String(body.fornecedor).replace(/\s+/g, ' ').trim().toUpperCase()
        : existing.fornecedor;

    if (fornecedor) {
      ensureSupplierInRegistry(fornecedor, ctx.name, now);
    }

    const updated: Entry = {
      ...existing,
      ...body,
      id: existing.id,
      fornecedor,
      orcado,
      realizado,
      saldo: Math.round((orcado - realizado) * 100) / 100,
      criadoPor: existing.criadoPor,
      criadoEm: existing.criadoEm,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.entries[idx] = updated;
    saveDatabase();
    broadcastSync('entry:updated');
    res.json({ entry: updated, state: db });
  });

  // Delete Entry
  app.delete('/api/entries/:id', requireRole(['admin', 'editor'], 'lancamentos'), (req: Request, res: Response) => {
    const { id } = req.params;
    const before = db.entries.length;
    db.entries = db.entries.filter((e) => e.id !== id);
    if (db.entries.length === before) {
      res.status(404).json({ error: 'Lançamento não encontrado.' });
      return;
    }
    saveDatabase();
    broadcastSync('entry:deleted');
    res.json({ state: db });
  });

  // Generate Recurring Entries from sourceCompetencia to targetCompetencia
  app.post('/api/entries/recurring', requireRole(['admin', 'editor'], 'lancamentos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { sourceCompetencia, targetCompetencia } = req.body as {
      sourceCompetencia?: string;
      targetCompetencia?: string;
    };

    if (!sourceCompetencia || !targetCompetencia) {
      res.status(400).json({ error: 'Informe a competência de origem e a de destino.' });
      return;
    }
    if (sourceCompetencia === targetCompetencia) {
      res.status(400).json({ error: 'A competência de destino deve ser diferente da origem.' });
      return;
    }

    const sourceRows = db.entries.filter(
      (e) => e.competencia === sourceCompetencia && e.recorrente && e.status !== 'Cancelado'
    );
    const targetRows = db.entries.filter((e) => e.competencia === targetCompetencia);

    let createdCount = 0;
    let skippedCount = 0;

    for (const src of sourceRows) {
      const duplicate = targetRows.some(
        (t) =>
          t.descricao.toLowerCase() === src.descricao.toLowerCase() &&
          t.fornecedor.toLowerCase() === src.fornecedor.toLowerCase() &&
          t.empresa.toLowerCase() === src.empresa.toLowerCase() &&
          t.categoria.toLowerCase() === src.categoria.toLowerCase()
      );
      if (duplicate) {
        skippedCount++;
        continue;
      }

      const newEntry: Entry = {
        ...src,
        id: genId('ent'),
        competencia: targetCompetencia,
        dataPagamento: '',
        realizado: 0,
        saldo: src.orcado,
        status: 'Previsto',
        criadoPor: ctx.name,
        criadoEm: now,
        atualizadoPor: ctx.name,
        atualizadoEm: now,
      };
      db.entries.unshift(newEntry);
      createdCount++;
    }

    saveDatabase();
    broadcastSync('entries:recurring');
    res.json({ createdCount, skippedCount, state: db });
  });

  // Bulk Import Entries (with automatic registration of new official registry items)
  app.post('/api/entries/import', requireRole(['admin', 'editor'], 'lancamentos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { entries: incomingEntries } = req.body as {
      entries: Array<
        Omit<Entry, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoPor' | 'atualizadoEm'>
      >;
    };

    if (!Array.isArray(incomingEntries) || incomingEntries.length === 0) {
      res.status(400).json({ error: 'Nenhum lançamento válido selecionado para importação.' });
      return;
    }

    const addIfMissing = (type: RegistryType, nome: string) => {
      const clean = nome.trim();
      if (!clean) return;
      const list = db.registries[type];
      if (!list.some((i) => i.nome.toLowerCase() === clean.toLowerCase())) {
        list.push({
          id: genId(type.slice(0, 3)),
          nome: clean,
          apelidos: [],
          criadoPor: ctx.name,
          criadoEm: now,
          atualizadoPor: ctx.name,
          atualizadoEm: now,
        });
      }
    };

    let importedCount = 0;
    for (const item of incomingEntries) {
      addIfMissing('categorias', item.categoria);
      addIfMissing('empresas', item.empresa);
      addIfMissing('departamentos', item.departamento);
      if (item.fornecedor) addIfMissing('fornecedores', item.fornecedor);

      const orcado = Math.max(0, Number(item.orcado) || 0);
      const rawRealImport = Number(item.realizado);
      const realizado = Number.isFinite(rawRealImport) ? Math.round(rawRealImport * 100) / 100 : 0;

      db.entries.unshift({
        id: genId('ent'),
        competencia: item.competencia,
        dataPagamento: item.dataPagamento || '',
        categoria: item.categoria,
        descricao: item.descricao,
        fornecedor: item.fornecedor || '',
        empresa: item.empresa,
        departamento: item.departamento,
        recorrente: Boolean(item.recorrente),
        orcado,
        realizado,
        saldo: Math.round((orcado - realizado) * 100) / 100,
        status: item.status || (realizado !== 0 ? 'Pago' : 'Previsto'),
        contratoId: item.contratoId || undefined,
        obs: item.obs || '',
        criadoPor: ctx.name,
        criadoEm: now,
        atualizadoPor: ctx.name,
        atualizadoEm: now,
      });
      importedCount++;
    }

    saveDatabase();
    broadcastSync('entries:imported');
    res.status(201).json({ importedCount, state: db });
  });

  // Create Contract
  app.post('/api/contracts', requireRole(['admin', 'editor'], 'contratos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const body = req.body as Partial<Contract>;

    if (!body.fornecedor || !body.objeto || !body.empresa || !body.departamento) {
      res.status(400).json({
        error: 'Preencha os campos obrigatórios do contrato: fornecedor, objeto, empresa e departamento.',
      });
      return;
    }

    const fornecedor = String(body.fornecedor).replace(/\s+/g, ' ').trim().toUpperCase();
    ensureSupplierInRegistry(fornecedor, ctx.name, now);

    const valorMensal = Math.max(0, Number(body.valorMensal) || 0);
    const valorTotal =
      body.valorTotal !== undefined && Number(body.valorTotal) > 0
        ? Number(body.valorTotal)
        : Math.round(valorMensal * 12 * 100) / 100;

    const contract: Contract = {
      id: genId('ctr'),
      fornecedor,
      cnpj: String(body.cnpj || '').trim(),
      objeto: String(body.objeto).trim(),
      categoria: body.categoria || db.registries.categorias[0]?.nome || 'Sistemas & HRTech',
      empresa: body.empresa,
      departamento: body.departamento,
      responsavel: String(body.responsavel || ctx.name).trim(),
      inicio: body.inicio || now.slice(0, 10),
      fim: body.fim || `${new Date().getFullYear() + 1}-12-31`,
      renovacaoAutomatica: Boolean(body.renovacaoAutomatica),
      avisoPrevioDias: Math.max(0, Number(body.avisoPrevioDias) || 30),
      valorMensal,
      valorTotal,
      indiceReajuste: body.indiceReajuste || 'IPCA',
      mesDataBase: Math.min(12, Math.max(1, Number(body.mesDataBase) || 1)),
      formaPagamento: String(body.formaPagamento || 'Boleto bancário').trim(),
      diaVencimento: Math.min(31, Math.max(1, Number(body.diaVencimento) || 10)),
      linkDocumento: String(body.linkDocumento || '').trim(),
      status: body.status || 'Ativo',
      obs: String(body.obs || '').trim(),
      reajustes: Array.isArray(body.reajustes) ? body.reajustes : [],
      criadoPor: ctx.name,
      criadoEm: now,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.contracts.unshift(contract);
    saveDatabase();
    broadcastSync('contract:created');
    res.status(201).json({ contract, state: db });
  });

  // Update Contract
  app.put('/api/contracts/:id', requireRole(['admin', 'editor'], 'contratos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { id } = req.params;
    const idx = db.contracts.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Contrato não encontrado.' });
      return;
    }

    const existing = db.contracts[idx];
    const body = req.body as Partial<Contract>;
    const fornecedor =
      body.fornecedor !== undefined
        ? String(body.fornecedor).replace(/\s+/g, ' ').trim().toUpperCase()
        : existing.fornecedor;

    if (fornecedor) {
      ensureSupplierInRegistry(fornecedor, ctx.name, now);
    }

    const updated: Contract = {
      ...existing,
      ...body,
      id: existing.id,
      fornecedor,
      criadoPor: existing.criadoPor,
      criadoEm: existing.criadoEm,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.contracts[idx] = updated;
    saveDatabase();
    broadcastSync('contract:updated');
    res.json({ contract: updated, state: db });
  });

  // Apply Contract Readjustment
  app.post('/api/contracts/:id/adjust', requireRole(['admin', 'editor'], 'contratos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { id } = req.params;
    const idx = db.contracts.findIndex((c) => c.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Contrato não encontrado.' });
      return;
    }

    const { percentual, data, indice } = req.body as {
      percentual?: number;
      data?: string;
      indice?: string;
    };

    const pct = Number(percentual);
    if (!Number.isFinite(pct)) {
      res.status(400).json({ error: 'Informe um percentual de reajuste válido.' });
      return;
    }

    const existing = db.contracts[idx];
    const valorAnterior = existing.valorMensal;
    const valorNovo = Math.round(valorAnterior * (1 + pct / 100) * 100) / 100;

    const adjustment: ContractAdjustment = {
      id: genId('reaj'),
      data: data || now.slice(0, 10),
      indice: indice || existing.indiceReajuste,
      percentual: pct,
      valorAnterior,
      valorNovo,
      aplicadoPor: ctx.name,
    };

    const updated: Contract = {
      ...existing,
      valorMensal: valorNovo,
      valorTotal: Math.round(valorNovo * 12 * 100) / 100,
      reajustes: [adjustment, ...existing.reajustes],
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.contracts[idx] = updated;
    saveDatabase();
    broadcastSync('contract:adjusted');
    res.json({ contract: updated, state: db });
  });

  // Link unlinked entries matching contract's supplier
  app.post(
    '/api/contracts/:id/link-entries',
    requireRole(['admin', 'editor'], 'contratos'),
    (req: Request, res: Response) => {
      const ctx = getAuthContext(req);
      const now = new Date().toISOString();
      const { id } = req.params;
      const contract = db.contracts.find((c) => c.id === id);
      if (!contract) {
        res.status(404).json({ error: 'Contrato não encontrado.' });
        return;
      }

      const { entryIds } = req.body as { entryIds?: string[] };
      let linkedCount = 0;

      db.entries = db.entries.map((e) => {
        const matchesSupplier =
          e.fornecedor.toUpperCase() === contract.fornecedor.toUpperCase() && !e.contratoId;
        const selectedByUser = entryIds ? entryIds.includes(e.id) : true;
        if (matchesSupplier && selectedByUser) {
          linkedCount++;
          return {
            ...e,
            contratoId: contract.id,
            atualizadoPor: ctx.name,
            atualizadoEm: now,
          };
        }
        return e;
      });

      saveDatabase();
      broadcastSync('contract:entries_linked');
      res.json({ linkedCount, state: db });
    }
  );

  // Delete Contract (unlinks associated entries)
  app.delete('/api/contracts/:id', requireRole(['admin', 'editor'], 'contratos'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const { id } = req.params;
    const before = db.contracts.length;
    db.contracts = db.contracts.filter((c) => c.id !== id);
    if (db.contracts.length === before) {
      res.status(404).json({ error: 'Contrato não encontrado.' });
      return;
    }

    db.entries = db.entries.map((e) =>
      e.contratoId === id
        ? { ...e, contratoId: undefined, atualizadoPor: ctx.name, atualizadoEm: now }
        : e
    );

    saveDatabase();
    broadcastSync('contract:deleted');
    res.json({ state: db });
  });

  // Save Annual Plan (ADMIN ONLY)
  app.put('/api/plans/:year', requireRole(['admin'], 'planejamento'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const yearNum = parseInt(String(req.params.year), 10);
    const currentYear = new Date().getFullYear();
    const minPlanYear = currentYear - 2;
    const maxPlanYear = currentYear + 5;
    if (!Number.isFinite(yearNum) || yearNum < minPlanYear || yearNum > maxPlanYear) {
      res.status(400).json({
        error: `Ano de planejamento inválido. Selecione entre ${minPlanYear} e ${maxPlanYear}.`,
      });
      return;
    }

    const { tetos } = req.body as { tetos: Record<string, number[]> };
    if (!tetos || typeof tetos !== 'object') {
      res.status(400).json({ error: 'Estrutura de tetos mensais inválida.' });
      return;
    }

    const existing = db.plans[String(yearNum)];
    const plan: AnnualPlan = {
      year: yearNum,
      tetos,
      criadoPor: existing?.criadoPor || ctx.name,
      criadoEm: existing?.criadoEm || now,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.plans[String(yearNum)] = plan;
    saveDatabase();
    broadcastSync('plan:updated');
    res.json({ plan, state: db });
  });

  // Create Registry Item (Admin/Developer for categorias/empresas/departamentos; Admin+Editor+Developer for fornecedores)
  app.post('/api/registries/:type', requireRole(['admin', 'editor'], 'cadastros'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const type = req.params.type as RegistryType;
    if (!['categorias', 'empresas', 'departamentos', 'fornecedores'].includes(type)) {
      res.status(400).json({ error: 'Tipo de cadastro inválido.' });
      return;
    }
    if (type !== 'fornecedores' && ctx.role !== 'admin' && ctx.role !== 'developer') {
      res.status(403).json({
        error: 'Somente o Administrador ou Desenvolvedor pode criar categorias, empresas ou departamentos.',
      });
      return;
    }

    const { nome, apelidos } = req.body as { nome?: string; apelidos?: string[] };
    const cleanNome =
      type === 'fornecedores'
        ? String(nome || '').replace(/\s+/g, ' ').trim().toUpperCase()
        : String(nome || '').replace(/\s+/g, ' ').trim();

    if (!cleanNome) {
      res.status(400).json({ error: 'Informe o nome oficial do item.' });
      return;
    }

    if (db.registries[type].some((i) => i.nome.toLowerCase() === cleanNome.toLowerCase())) {
      res.status(400).json({ error: 'Já existe um item com esse nome neste cadastro.' });
      return;
    }

    const now = new Date().toISOString();
    const item: RegistryItem = {
      id: genId(type.slice(0, 3)),
      nome: cleanNome,
      apelidos: Array.isArray(apelidos) ? apelidos.map((a) => a.trim()).filter(Boolean) : [],
      criadoPor: ctx.name,
      criadoEm: now,
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.registries[type].push(item);
    saveDatabase();
    broadcastSync('registry:created');
    res.status(201).json({ item, state: db });
  });

  // Rename / Edit Registry Item (Admin only) - propagates rename & saves old name as alias
  app.put('/api/registries/:type/:id', requireRole(['admin'], 'cadastros'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const type = req.params.type as RegistryType;
    const { id } = req.params;
    const list = db.registries[type];
    if (!list) {
      res.status(400).json({ error: 'Tipo de cadastro inválido.' });
      return;
    }

    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }

    const existing = list[idx];
    const { nome, apelidos } = req.body as { nome?: string; apelidos?: string[] };
    const cleanNome =
      nome !== undefined
        ? type === 'fornecedores'
          ? String(nome).replace(/\s+/g, ' ').trim().toUpperCase()
          : String(nome).replace(/\s+/g, ' ').trim()
        : existing.nome;

    if (!cleanNome) {
      res.status(400).json({ error: 'O nome não pode ficar vazio.' });
      return;
    }

    const nextApelidos = new Set(
      (apelidos !== undefined ? apelidos : existing.apelidos).map((a) => a.trim()).filter(Boolean)
    );

    if (cleanNome !== existing.nome) {
      if (
        list.some((i) => i.id !== id && i.nome.toLowerCase() === cleanNome.toLowerCase())
      ) {
        res.status(400).json({ error: 'Já existe outro item com este nome. Use a opção Mesclar.' });
        return;
      }
      nextApelidos.add(existing.nome);
      propagateRegistryRename(type, existing.nome, cleanNome);
    }

    list[idx] = {
      ...existing,
      nome: cleanNome,
      apelidos: Array.from(nextApelidos),
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    saveDatabase();
    broadcastSync('registry:updated');
    res.json({ item: list[idx], state: db });
  });

  // Merge Registry Items (Admin only) - propagates target name and registers source as alias
  app.post('/api/registries/:type/merge', requireRole(['admin'], 'cadastros'), (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();
    const type = req.params.type as RegistryType;
    const list = db.registries[type];
    if (!list) {
      res.status(400).json({ error: 'Tipo de cadastro inválido.' });
      return;
    }

    const { sourceId, targetId } = req.body as { sourceId?: string; targetId?: string };
    if (!sourceId || !targetId || sourceId === targetId) {
      res.status(400).json({ error: 'Selecione dois itens diferentes para mesclar.' });
      return;
    }

    const source = list.find((i) => i.id === sourceId);
    const targetIdx = list.findIndex((i) => i.id === targetId);
    if (!source || targetIdx === -1) {
      res.status(404).json({ error: 'Itens selecionados não encontrados.' });
      return;
    }

    const target = list[targetIdx];
    propagateRegistryRename(type, source.nome, target.nome);

    const mergedAliases = new Set([
      ...target.apelidos,
      source.nome,
      ...source.apelidos,
    ]);
    mergedAliases.delete(target.nome);

    list[targetIdx] = {
      ...target,
      apelidos: Array.from(mergedAliases),
      atualizadoPor: ctx.name,
      atualizadoEm: now,
    };

    db.registries[type] = list.filter((i) => i.id !== sourceId);
    saveDatabase();
    broadcastSync('registry:merged');
    res.json({ state: db });
  });

  // Delete Registry Item (Admin only, only if unused)
  app.delete('/api/registries/:type/:id', requireRole(['admin'], 'cadastros'), (req: Request, res: Response) => {
    const type = req.params.type as RegistryType;
    const { id } = req.params;
    const list = db.registries[type];
    if (!list) {
      res.status(400).json({ error: 'Tipo de cadastro inválido.' });
      return;
    }

    const item = list.find((i) => i.id === id);
    if (!item) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }

    const usage = countRegistryUsage(type, item.nome);
    if (usage > 0) {
      res.status(400).json({
        error: `Não é possível excluir "${item.nome}" pois está vinculado a ${usage} registro(s). Use Renomear ou Mesclar.`,
      });
      return;
    }

    db.registries[type] = list.filter((i) => i.id !== id);
    saveDatabase();
    broadcastSync('registry:deleted');
    res.json({ state: db });
  });

  // Clear all data (DEVELOPER only, requires unlocked developer session)
  app.post('/api/admin/clear-data', requireDeveloperPermission, (req: Request, res: Response) => {
    const ctx = getAuthContext(req);
    const now = new Date().toISOString();

    db.entries = [];
    db.contracts = [];
    db.registries.fornecedores = [];

    for (const year of Object.keys(db.plans)) {
      const plan = db.plans[year];
      for (const cat of Object.keys(plan.tetos)) {
        plan.tetos[cat] = Array(12).fill(0);
      }
      plan.atualizadoPor = ctx.name;
      plan.atualizadoEm = now;
    }

    saveDatabase();
    broadcastSync('data:cleared');
    res.json({ message: 'Todos os dados fictícios foram apagados com sucesso.', state: db });
  });

  // Erros não tratados nas rotas
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Erro não tratado:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}
