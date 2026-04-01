import type { Customer, CustomerImpactAssessment, ExposureSummary } from '../../types/exposure';
import type { DisasterEvent } from '../../types/event';
import { assetTypeLabels, vulnerabilityLabels } from '../../utils/customerMeta';

/*
ExposureSummaryPanel riassume lo scenario territoriale lato clienti.
Mostra KPI sintetici, distribuzione degli asset impattati e il dettaglio del cliente selezionato sulla mappa.
*/

interface ExposureSummaryPanelProps {
  mode: 'event' | 'customers' | 'combined';
  focusedEvent: DisasterEvent | null;
  customers: Customer[];
  assessments: CustomerImpactAssessment[];
  summary: ExposureSummary;
  selectedCustomer: Customer | null;
  selectedAssessment: CustomerImpactAssessment | null;
  selectedImpactEvent: DisasterEvent | null;
}

function getVulnerabilityExplanation(customer: Customer, assessment: CustomerImpactAssessment): string {
  if (assessment.vulnerabilityHint === 'high') {
    if (customer.hasUndergroundStorage || customer.hasBasement) {
      return 'Colore alto rischio per presenza di cantina o locali interrati.';
    }

    if (customer.assetType === 'warehouse') {
      return 'Colore alto rischio per tipologia magazzino, piu esposta ad allagamenti operativi.';
    }

    return 'Colore alto rischio per posizione a piano strada o livelli bassi.';
  }

  if (assessment.vulnerabilityHint === 'low') {
    return 'Colore a bassa vulnerabilita per piano alto o asset meno esposto al contatto diretto con l acqua.';
  }

  return 'Colore intermedio: il contratto non suggerisce un rischio estremo, ma l asset resta monitorato.';
}

function getImpactExplanation(
  assessment: CustomerImpactAssessment,
  selectedImpactEvent: DisasterEvent | null
): string {
  if (assessment.impactReason === 'within-geojson') {
    return `Cliente marcato come colpito perche interno al perimetro geojson dell evento ${selectedImpactEvent?.title ?? ''}.`.trim();
  }

  if (assessment.impactReason === 'within-radius') {
    const radius = selectedImpactEvent?.impactRadiusKm;
    return `Cliente marcato come colpito perche entro il raggio fallback${typeof radius === 'number' ? ` di ${radius} km` : ''} dall evento selezionato.`.trim();
  }

  return 'Cliente fuori dal perimetro geospaziale stimato, quindi visualizzato come non colpito.';
}

export function ExposureSummaryPanel({
  mode,
  focusedEvent,
  customers,
  assessments,
  summary,
  selectedCustomer,
  selectedAssessment,
  selectedImpactEvent,
}: ExposureSummaryPanelProps) {
  const scopedLabel = focusedEvent ? focusedEvent.title : 'Tutti gli eventi filtrati';
  const topAssetTypes = summary.impactedByAssetType.slice(0, 3);
  const highVulnerabilityLabel = vulnerabilityLabels.high;
  const customerCount = customers.length;
  const impactedAssessmentCount = assessments.filter((assessment) => assessment.isImpacted).length;

  return (
    <section className="exposure-summary">
      <div className="exposure-summary__header">
        <div>
          <span className="eyebrow">Pre-allarme sinistri</span>
          <h2>Vista territoriale clienti</h2>
        </div>
        <span className="exposure-summary__mode">{mode === 'event' ? 'Layer evento' : mode === 'customers' ? 'Layer clienti' : 'Layer combinato'}</span>
      </div>

      <p className="exposure-summary__scope">Scenario attivo: {scopedLabel}</p>

      <div className="exposure-summary__stats">
        <article>
          <span>Clienti monitorati</span>
          <strong>{summary.customersInScope}</strong>
        </article>
        <article>
          <span>Clienti stimati colpiti</span>
          <strong>{summary.impactedCustomers}</strong>
        </article>
        <article>
          <span>Metratura stimata ispezione</span>
          <strong>{summary.impactedInspectionAreaSqm} mq</strong>
        </article>
        <article>
          <span>{highVulnerabilityLabel}</span>
          <strong>{summary.highVulnerabilityCustomers}</strong>
        </article>
      </div>

      <div className="exposure-summary__body">
        <article className="exposure-summary__card">
          <h3>Copertura mock</h3>
          <p>{customerCount} clienti caricati, {impactedAssessmentCount} valutazioni impatto generate lato frontend.</p>
        </article>

        <article className="exposure-summary__card">
          <h3>Tipologie piu esposte</h3>
          {topAssetTypes.length ? (
            <ul className="summary-list">
              {topAssetTypes.map((entry) => (
                <li key={entry.assetType}>
                  <span>{assetTypeLabels[entry.assetType]}</span>
                  <strong>{entry.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>Nessun cliente impattato con i filtri attuali.</p>
          )}
        </article>

        <article className="exposure-summary__card">
          <h3>Dettaglio marker selezionato</h3>
          {mode === 'event' ? (
            <p>Passa a "Clienti nel territorio" o "Entrambi" per selezionare un cliente e capire il significato del colore.</p>
          ) : selectedCustomer && selectedAssessment ? (
            <div className="marker-detail">
              <div className="marker-detail__header">
                <strong>{selectedCustomer.code}</strong>
                <span>{assetTypeLabels[selectedCustomer.assetType]}</span>
              </div>
              <ul className="summary-list">
                <li>
                  <span>Localita</span>
                  <strong>
                    {selectedCustomer.city}, {selectedCustomer.province}
                  </strong>
                </li>
                <li>
                  <span>Vulnerabilita</span>
                  <strong>{vulnerabilityLabels[selectedAssessment.vulnerabilityHint]}</strong>
                </li>
                <li>
                  <span>Ispezione stimata</span>
                  <strong>{selectedCustomer.inspectionAreaSqm} mq</strong>
                </li>
                <li>
                  <span>Evento associato</span>
                  <strong>{selectedImpactEvent?.title ?? 'Nessun impatto attivo'}</strong>
                </li>
              </ul>
              <p>{getVulnerabilityExplanation(selectedCustomer, selectedAssessment)}</p>
              <p>{getImpactExplanation(selectedAssessment, selectedImpactEvent)}</p>
            </div>
          ) : (
            <p>Clicca un punto cliente sulla mappa per vedere perche e stato colorato in quel modo.</p>
          )}
        </article>
      </div>
    </section>
  );
}
