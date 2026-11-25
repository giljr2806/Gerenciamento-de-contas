import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Contract, Entry } from '../types/buddha';
import { formatBRL, formatDateBR } from './format';

export interface ReportSummaryRow {
  grupo: string;
  teto?: number;
  orcado: number;
  realizado: number;
  saldo: number;
  percentual: number;
}

export function exportFilteredEntriesToExcel(entries: Entry[], filename = 'lancamentos_dho_buddha.xlsx') {
  const rows = entries.map((e) => ({
    Competência: e.competencia,
    'Data Pagamento': e.dataPagamento ? formatDateBR(e.dataPagamento) : '',
    Categoria: e.categoria,
    'Linha Opex': e.linhaOpex || '',
    Descrição: e.descricao,
    Fornecedor: e.fornecedor,
    Empresa: e.empresa,
    Departamento: e.departamento,
    Subárea: e.subarea || '',
    'Macro área': e.macroArea || '',
    'Categoria Teto': e.categoriaTeto || '',
    Recorrente: e.recorrente ? 'Sim' : 'Não',
    'Orçado (R$)': e.orcado,
    'Realizado (R$)': e.realizado,
    'Saldo (R$)': e.saldo,
    Status: e.status,
    Contrato: e.contratoId || '',
    Observações: e.obs,
    'Criado por': e.criadoPor,
    'Atualizado por': e.atualizadoPor,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
  XLSX.writeFile(wb, filename);
}

export function exportReportWorkbook(params: {
  filename: string;
  groupLabel: string;
  showTeto: boolean;
  summaryRows: ReportSummaryRow[];
  entries: Entry[];
  contracts: Contract[];
}) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumo
  const resumoData = params.summaryRows.map((r) => {
    const base: Record<string, string | number> = {
      [params.groupLabel]: r.grupo,
    };
    if (params.showTeto) {
      base['Teto Planejado (R$)'] = r.teto ?? 0;
    }
    base['Previsto / Orçado (R$)'] = r.orcado;
    base['Realizado (R$)'] = r.realizado;
    base['Saldo (R$)'] = r.saldo;
    base['% Executado'] = Number(r.percentual.toFixed(2));
    return base;
  });
  const wsResumo = XLSX.utils.json_to_sheet(resumoData);
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  // Sheet 2: Lançamentos
  const entriesData = params.entries.map((e) => ({
    Competência: e.competencia,
    'Data Pagamento': e.dataPagamento ? formatDateBR(e.dataPagamento) : '',
    Categoria: e.categoria,
    Descrição: e.descricao,
    Fornecedor: e.fornecedor,
    Empresa: e.empresa,
    Departamento: e.departamento,
    Recorrente: e.recorrente ? 'Sim' : 'Não',
    'Orçado (R$)': e.orcado,
    'Realizado (R$)': e.realizado,
    'Saldo (R$)': e.saldo,
    Status: e.status,
    Observações: e.obs,
  }));
  const wsEntries = XLSX.utils.json_to_sheet(entriesData);
  XLSX.utils.book_append_sheet(wb, wsEntries, 'Lançamentos');

  // Sheet 3: Contratos
  const contractsData = params.contracts.map((c) => ({
    Fornecedor: c.fornecedor,
    CNPJ: c.cnpj,
    Objeto: c.objeto,
    Categoria: c.categoria,
    Empresa: c.empresa,
    Departamento: c.departamento,
    Responsável: c.responsavel,
    Início: formatDateBR(c.inicio),
    Fim: formatDateBR(c.fim),
    'Aviso Prévio (dias)': c.avisoPrevioDias,
    'Renovação Automática': c.renovacaoAutomatica ? 'Sim' : 'Não',
    'Valor Mensal (R$)': c.valorMensal,
    'Valor Total (R$)': c.valorTotal,
    'Índice Reajuste': c.indiceReajuste,
    'Mês Data-Base': c.mesDataBase,
    Status: c.status,
  }));
  const wsContracts = XLSX.utils.json_to_sheet(contractsData);
  XLSX.utils.book_append_sheet(wb, wsContracts, 'Contratos');

  XLSX.writeFile(wb, params.filename);
}

export function exportReportLandscapePdf(params: {
  filename: string;
  title: string;
  periodLabel: string;
  filterLabel: string;
  columns: string[];
  rows: (string | number)[][];
  totalsRow: (string | number)[];
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Buddha Spa · DHO (Gente & Gestão)', 14, 15);

  doc.setFontSize(11);
  doc.setTextColor(51, 65, 85);
  doc.text(params.title, 14, 22);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Período: ${params.periodLabel}   |   Filtros: ${params.filterLabel}`, 14, 28);
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, 283, 15, { align: 'right' });

  autoTable(doc, {
    startY: 33,
    head: [params.columns],
    body: [...params.rows, params.totalsRow],
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: 255,
      fontStyle: 'bold',
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === params.rows.length && hookData.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [241, 245, 249];
      }
    },
  });

  doc.save(params.filename);
}

export async function copyReportCsvToClipboard(
  columns: string[],
  rows: ReportSummaryRow[],
  showTeto: boolean
): Promise<void> {
  const lines = [columns.join(';')];
  for (const r of rows) {
    const cells: string[] = [r.grupo];
    if (showTeto) cells.push(formatBRL(r.teto ?? 0));
    cells.push(
      formatBRL(r.orcado),
      formatBRL(r.realizado),
      formatBRL(r.saldo),
      `${r.percentual.toFixed(1).replace('.', ',')}%`
    );
    lines.push(cells.join(';'));
  }
  const csv = lines.join('\r\n');
  await navigator.clipboard.writeText(csv);
}
