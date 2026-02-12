const { getDb } = require('../../database/connection');
const { ValidationError } = require('../../utils/errors');
const { isoToBr } = require('../../utils/dates');

class ReportDataService {
  constructor() {
    this.db = getDb();
  }

  getSellerReportData(sellerReportId) {
    if (!sellerReportId) throw new ValidationError('sellerReportId é obrigatório');

    const report = this.db.prepare(`
      SELECT sr.*, i.period_ref as period_ref
      FROM seller_reports sr
      JOIN imports i ON i.id = sr.import_id
      WHERE sr.id = ?
    `).get(sellerReportId);

    if (!report) throw new ValidationError('sellerReportId inválido (não encontrado)');

    const sales = this.db.prepare(`
      SELECT store, client_name, os, sale_date, sale_value_cents, commission_cents
      FROM seller_sales
      WHERE seller_report_id = ?
      ORDER BY row_index ASC
    `).all(sellerReportId);

    return {
      sellerReportId,
      importId: report.import_id,
      periodRef: report.period_ref,
      sellerNameRaw: report.seller_name_raw,
      sellerNameNorm: report.seller_name_norm,
      totals: {
        salesTotalCents: report.sales_total_cents,
        commissionTotalCents: report.commission_total_cents,
        ticketAvgCents: report.ticket_avg_cents,
        txCount: report.tx_count,
      },
      sales: sales.map(s => ({
        store: s.store,
        clientName: s.client_name,
        os: s.os,
        saleDate: isoToBr(s.sale_date),
        saleValueCents: s.sale_value_cents,
        commissionCents: s.commission_cents,
      })),
    };
  }
}

module.exports = { ReportDataService };
