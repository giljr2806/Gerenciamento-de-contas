import { createInitialDatabase } from '../src/shared/seedBuddha';
import type { DatabaseState } from '../src/types/buddha';
import { adminDb } from './firebaseAdmin';

/**
 * Persistência no Firestore.
 *
 * Coleção "buddha":
 *   meta            -> { version, users, registries, plans, entriesChunks, contractsChunks }
 *   entries_<n>     -> { items: Entry[] }     (até CHUNK_SIZE itens por documento)
 *   contracts_<n>   -> { items: Contract[] }
 *   auth            -> { developerKeyHash }   (chave do desenvolvedor, só hash scrypt)
 *
 * Os lançamentos/contratos são fatiados porque um documento do Firestore tem limite de 1 MB.
 * Nenhum acesso direto do navegador: as Security Rules bloqueiam tudo e só este servidor
 * (Admin SDK) lê e escreve.
 */

const COLLECTION = 'buddha';
const CHUNK_SIZE = 400;

export class VersionConflictError extends Error {
  constructor() {
    super('Os dados foram alterados por outro usuário. Atualize a página e tente novamente.');
    this.name = 'VersionConflictError';
  }
}

interface MetaDoc {
  version: number;
  users: DatabaseState['users'];
  registries: DatabaseState['registries'];
  plans: DatabaseState['plans'];
  entriesChunks: number;
  contractsChunks: number;
}

function col() {
  return adminDb().collection(COLLECTION);
}

function chunk<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK_SIZE) out.push(list.slice(i, i + CHUNK_SIZE));
  return out;
}

export async function readVersion(): Promise<number | null> {
  const snap = await col().doc('meta').get();
  if (!snap.exists) return null;
  return (snap.data() as MetaDoc).version;
}

export async function readDatabase(): Promise<DatabaseState | null> {
  const metaSnap = await col().doc('meta').get();
  if (!metaSnap.exists) return null;
  const meta = metaSnap.data() as MetaDoc;

  const refs = [
    ...Array.from({ length: meta.entriesChunks }, (_, i) => col().doc(`entries_${i}`)),
    ...Array.from({ length: meta.contractsChunks }, (_, i) => col().doc(`contracts_${i}`)),
  ];
  const docs = refs.length > 0 ? await adminDb().getAll(...refs) : [];

  const entries: DatabaseState['entries'] = [];
  const contracts: DatabaseState['contracts'] = [];
  docs.forEach((d, idx) => {
    const items = ((d.data() as { items?: unknown[] } | undefined)?.items || []) as never[];
    if (idx < meta.entriesChunks) entries.push(...items);
    else contracts.push(...items);
  });

  return {
    version: meta.version,
    users: meta.users || [],
    registries: meta.registries,
    plans: meta.plans || {},
    entries,
    contracts,
  };
}

/**
 * Grava o estado inteiro numa transação, com controle otimista de versão:
 * se outro processo gravou entre a nossa leitura e a nossa escrita, falha com
 * VersionConflictError em vez de sobrescrever os dados dele.
 */
export async function writeDatabase(next: DatabaseState, expectedVersion: number | null) {
  const metaRef = col().doc('meta');
  const entryChunks = chunk(next.entries);
  const contractChunks = chunk(next.contracts);

  await adminDb().runTransaction(async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const current = metaSnap.exists ? (metaSnap.data() as MetaDoc) : null;

    if (expectedVersion !== null && current && current.version !== expectedVersion) {
      throw new VersionConflictError();
    }

    const meta: MetaDoc = {
      version: next.version,
      users: next.users,
      registries: next.registries,
      plans: next.plans,
      entriesChunks: entryChunks.length,
      contractsChunks: contractChunks.length,
    };

    tx.set(metaRef, meta);
    entryChunks.forEach((items, i) => tx.set(col().doc(`entries_${i}`), { items }));
    contractChunks.forEach((items, i) => tx.set(col().doc(`contracts_${i}`), { items }));

    // remove fatias que sobraram (ex.: lançamentos excluídos)
    for (let i = entryChunks.length; i < (current?.entriesChunks || 0); i++) {
      tx.delete(col().doc(`entries_${i}`));
    }
    for (let i = contractChunks.length; i < (current?.contractsChunks || 0); i++) {
      tx.delete(col().doc(`contracts_${i}`));
    }
  });
}

/** Primeira execução: cria a base inicial com UM desenvolvedor (e-mail vindo do ambiente). */
export function buildFirstRunDatabase(): DatabaseState {
  const seeded = createInitialDatabase();
  const bootstrapEmail = process.env.BOOTSTRAP_DEVELOPER_EMAIL?.trim().toLowerCase();
  if (!bootstrapEmail) {
    throw new Error(
      'Banco vazio: defina BOOTSTRAP_DEVELOPER_EMAIL com o e-mail do primeiro usuário Desenvolvedor.'
    );
  }
  const dev = seeded.users.find((u) => u.role === 'developer') || seeded.users[0];
  // Em produção NÃO se cria usuários de demonstração: apenas o desenvolvedor inicial.
  seeded.users = [{ ...dev, email: bootstrapEmail, permissoes: { ...dev.permissoes } }];
  return seeded;
}

export interface DeveloperAuthStore {
  developerKeyHash?: { salt: string; hash: string; updatedAt: string };
}

export async function loadAuthStore(): Promise<DeveloperAuthStore> {
  const snap = await col().doc('auth').get();
  return snap.exists ? (snap.data() as DeveloperAuthStore) : {};
}

export async function saveAuthStore(store: DeveloperAuthStore) {
  await col().doc('auth').set(store);
}
