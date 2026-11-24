/**
 * Backup completo do banco (Firestore) em um arquivo JSON local.
 *
 * Uso:  npm run backup
 * Saída: backups/backup-AAAA-MM-DDTHH-MM-SS.json  (a pasta backups/ não vai para o Git)
 *
 * O arquivo contém dados da empresa (lançamentos, contratos, usuários): guarde em local seguro.
 * Não inclui o hash da chave do desenvolvedor.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const { readDatabase } = await import('../server/store');
  const db = await readDatabase();
  if (!db) {
    console.error('Banco vazio: nada para salvar.');
    process.exit(1);
  }
  const dir = path.resolve('backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf-8');
  console.log(
    `Backup salvo em ${file}\n  lançamentos: ${db.entries.length} | contratos: ${db.contracts.length} | usuários: ${db.users.length} | versão: ${db.version}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
