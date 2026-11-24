import { AlertItem, DatabaseState, isProposal } from '../types/buddha';
import {
  daysUntil,
  daysUntilDataBase,
  formatBRL,
  formatDateBR,
  MONTH_LABELS,
  subtractDaysISO,
  sumArray,
} from './format';

export function computeSystemAlerts(
  state: DatabaseState,
  activeYear: number,
  empresaFilter = 'all',
  deptoFilter = 'all',
  refDate = new Date()
): AlertItem[] {
  const alerts: AlertItem[] = [];

  const filteredContracts = state.contracts.filter((c) => {
    if (isProposal(c)) return false; // propostas não geram alertas de vigência/reajuste
    if (empresaFilter !== 'all' && c.empresa !== empresaFilter) return false;
    if (deptoFilter !== 'all' && c.departamento !== deptoFilter) return false;
    return true;
  });

  const filteredEntries = state.entries.filter((e) => {
    if (!e.competencia.startsWith(`${activeYear}-`)) return false;
    if (e.status === 'Cancelado') return false;
    if (empresaFilter !== 'all' && e.empresa !== empresaFilter) return false;
    if (deptoFilter !== 'all' && e.departamento !== deptoFilter) return false;
    return true;
  });

  // 1. Contratos vencidos ou vencendo em 30 / 60 / 90 dias
  for (const c of filteredContracts) {
    if (c.status === 'Encerrado' || c.status === 'Suspenso') continue;
    const daysLeft = daysUntil(c.fim, refDate);
    if (daysLeft < 0) {
      alerts.push({
        id: `alt-exp-${c.id}`,
        severity: 'critico',
        categoryLabel: 'Contrato vencido',
        title: `${c.fornecedor} (${c.empresa})`,
        detail: `Vigência encerrada em ${formatDateBR(c.fim)} (há ${Math.abs(daysLeft)} dias).`,
        targetTab: 'contracts',
        targetId: c.id,
      });
    } else if (daysLeft <= 30) {
      alerts.push({
        id: `alt-exp-${c.id}`,
        severity: 'critico',
        categoryLabel: 'Vence em ≤30d',
        title: `${c.fornecedor} (${c.empresa})`,
        detail: `Vence em ${formatDateBR(c.fim)} (faltam ${daysLeft} dias).`,
        targetTab: 'contracts',
        targetId: c.id,
      });
    } else if (daysLeft <= 60) {
      alerts.push({
        id: `alt-exp-${c.id}`,
        severity: 'atencao',
        categoryLabel: 'Vence em ≤60d',
        title: `${c.fornecedor} (${c.empresa})`,
        detail: `Vence em ${formatDateBR(c.fim)} (faltam ${daysLeft} dias).`,
        targetTab: 'contracts',
        targetId: c.id,
      });
    } else if (daysLeft <= 90) {
      alerts.push({
        id: `alt-exp-${c.id}`,
        severity: 'atencao',
        categoryLabel: 'Vence em ≤90d',
        title: `${c.fornecedor} (${c.empresa})`,
        detail: `Vence em ${formatDateBR(c.fim)} (faltam ${daysLeft} dias).`,
        targetTab: 'contracts',
        targetId: c.id,
      });
    }

    // 2. Prazo de aviso prévio terminando em 30 dias ou menos
    if (c.avisoPrevioDias > 0 && daysLeft >= 0) {
      const noticeCutoff = subtractDaysISO(c.fim, c.avisoPrevioDias);
      const daysToNotice = daysUntil(noticeCutoff, refDate);
      if (daysToNotice <= 30) {
        alerts.push({
          id: `alt-notice-${c.id}`,
          severity: daysToNotice <= 7 ? 'critico' : 'atencao',
          categoryLabel: 'Aviso prévio',
          title: `${c.fornecedor} · Aviso de ${c.avisoPrevioDias}d`,
          detail:
            daysToNotice < 0
              ? `Prazo de aviso prévio expirou em ${formatDateBR(noticeCutoff)}.`
              : `Prazo para notificação termina em ${formatDateBR(noticeCutoff)} (${daysToNotice}d).`,
          targetTab: 'contracts',
          targetId: c.id,
        });
      }
    }

    // 3. Reajuste (data-base) nos próximos 60 dias
    if (c.indiceReajuste !== 'Sem reajuste') {
      const daysToBase = daysUntilDataBase(c.mesDataBase, refDate);
      if (daysToBase <= 60) {
        alerts.push({
          id: `alt-reaj-${c.id}`,
          severity: daysToBase <= 15 ? 'atencao' : 'ok',
          categoryLabel: 'Reajuste próximo',
          title: `${c.fornecedor} · ${c.indiceReajuste}`,
          detail: `Data-base em ${MONTH_LABELS[(c.mesDataBase - 1) % 12]} (em ${daysToBase} dias).`,
          targetTab: 'contracts',
          targetId: c.id,
        });
      }
    }

    // 4. Contratos com status "A completar"
    if (c.status === 'A completar') {
      alerts.push({
        id: `alt-inc-${c.id}`,
        severity: 'atencao',
        categoryLabel: 'A completar',
        title: `${c.fornecedor} (${c.departamento})`,
        detail: 'Cadastro contratual pendente de CNPJ, vigência ou anexo.',
        targetTab: 'contracts',
        targetId: c.id,
      });
    }
  }

  // 5. Categoria acima do teto, ou com gasto sem teto planejado
  const plan = state.plans[String(activeYear)];
  const actualByCat = new Map<string, number>();
  for (const e of filteredEntries) {
    actualByCat.set(e.categoria, (actualByCat.get(e.categoria) || 0) + e.realizado);
  }

  const allCategories = new Set<string>([
    ...actualByCat.keys(),
    ...(plan ? Object.keys(plan.tetos) : []),
  ]);

  for (const cat of allCategories) {
    const realized = actualByCat.get(cat) || 0;
    const teto = plan?.tetos[cat] ? sumArray(plan.tetos[cat]) : 0;
    if (realized > 0 && teto === 0) {
      alerts.push({
        id: `alt-noteto-${cat}`,
        severity: 'critico',
        categoryLabel: 'Sem teto planejado',
        title: cat,
        detail: `Realizado de ${formatBRL(realized)} sem teto definido no planejamento ${activeYear}.`,
        targetTab: 'planning',
      });
    } else if (teto > 0 && realized > teto) {
      alerts.push({
        id: `alt-overteto-${cat}`,
        severity: 'critico',
        categoryLabel: 'Teto estourado',
        title: cat,
        detail: `Realizado (${formatBRL(realized)}) excedeu o teto anual (${formatBRL(teto)}).`,
        targetTab: 'planning',
      });
    }
  }

  // 6. Lançamentos realizados sem valor orçado
  const unbudgeted = filteredEntries.filter((e) => e.realizado > 0 && e.orcado === 0);
  if (unbudgeted.length > 0) {
    const sumUnbudgeted = unbudgeted.reduce((s, e) => s + e.realizado, 0);
    alerts.push({
      id: 'alt-unbudgeted-entries',
      severity: 'atencao',
      categoryLabel: 'Sem orçamento',
      title: `${unbudgeted.length} lançamento(s) realizados sem valor orçado`,
      detail: `Total realizado sem previsão: ${formatBRL(sumUnbudgeted)}. Clique para filtrar.`,
      targetTab: 'entries',
      specialFilter: 'sem_orcamento',
    });
  }

  const order = { critico: 0, atencao: 1, ok: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
