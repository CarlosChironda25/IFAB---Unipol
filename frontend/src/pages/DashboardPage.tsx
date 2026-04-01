import { useEffect, useMemo, useState } from 'react';
import { ExposureSummaryPanel } from '../components/operations/ExposureSummaryPanel';
import { OperationalInsightsPanel } from '../components/operations/OperationalInsightsPanel';
import { OperationalMapView } from '../components/operations/OperationalMapView';
import { FilterBar } from '../components/FilterBar';
import { buildCustomerImpactAssessments, buildExposureSummary } from '../features/operations/selectors';
import { useCustomers } from '../hooks/useCustomers';
import { useEvents } from '../hooks/useEvents';
import type { CustomerImpactAssessment, MapLayerMode } from '../types/exposure';
import type { DisasterEvent, EventFilters } from '../types/event';

const initialFilters: EventFilters = {
  search: '',
  eventType: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
  minSeverity: 0.25,
  minConfidence: 0.4,
};

/*
La funzione matchesDateRange verifica se un evento rientra nell'intervallo di date specificato nei filtri. Se l'evento non ha una data di inizio, viene considerato compatibile con qualsiasi intervallo.
Se la data di inizio dell'evento è precedente alla data "from" specificata nei filtri, o successiva alla data "to", la funzione restituisce false, indicando che l'evento non soddisfa il criterio di filtro basato sulla data.
*/

function matchesDateRange(event: DisasterEvent, filters: EventFilters): boolean {
  if (!event.startDate) {
    return true;
  }

  const timestamp = new Date(event.startDate).getTime();
  const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null;

  if (from && timestamp < from) {
    return false;
  }

  if (to && timestamp > to) {
    return false;
  }

  return true;
}

/*
La funzione sortEvents ordina gli eventi in base alla severità (dal più alto al più basso) e, in caso di parità di severità, per data di ultimo aggiornamento (dal più recente al più vecchio). 
Questo garantisce che gli eventi più critici e aggiornati siano mostrati per primi nella lista.
*/

function sortEvents(events: DisasterEvent[]): DisasterEvent[] {
  return [...events].sort((left, right) => {
    const severityDelta = (right.severity ?? 0) - (left.severity ?? 0);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return new Date(right.lastUpdate ?? 0).getTime() - new Date(left.lastUpdate ?? 0).getTime();
  });
}


/*
La DashboardPage è il componente principale che gestisce lo stato dell'applicazione, inclusi i filtri, l'evento selezionato e la logica di filtraggio degli eventi. Utilizza l'hook personalizzato useEvents per recuperare i dati degli eventi e gestire lo stato di caricamento e errori.
La pagina è divisa in diverse sezioni:
- Hero: una sezione introduttiva con un titolo, una descrizione e alcune statistiche chiave sui dati filtrati.
- FilterBar: un componente che consente all'utente di impostare i filtri per gli eventi.
- Status Strip: una barra che mostra lo stato attuale del feed, inclusi eventuali errori o informazioni sul refresh.
- Workspace: la sezione principale che contiene la mappa interattiva (MapView) e la sidebar dei dettagli dell'evento (EventSidebar).

La logica di filtraggio degli eventi è implementata all'interno di un useMemo, che ricalcola la lista degli eventi filtrati ogni volta che cambiano gli eventi o i filtri. La funzione matchesDateRange viene utilizzata per verificare 
se un evento rientra nell'intervallo di date specificato nei filtri. La funzione sortEvents ordina gli eventi filtrati prima di visual
*/

export function DashboardPage() {
  const { events, isLoading, isRefreshing, error, lastUpdated } = useEvents();
  const { customers, isLoading: areCustomersLoading, error: customersError } = useCustomers();
  const [filters, setFilters] = useState<EventFilters>(initialFilters);
  const [focusedEventId, setFocusedEventId] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapLayerMode>('event');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const filteredEvents = useMemo(() => {
    const searchTerm = filters.search.trim().toLowerCase();

    return sortEvents(
      events.filter((event) => {
        const matchesSearch =
          !searchTerm ||
          event.title.toLowerCase().includes(searchTerm) ||
          event.mainLocation.toLowerCase().includes(searchTerm) ||
          event.articles.some((article) => article.title.toLowerCase().includes(searchTerm));

        const matchesType = filters.eventType === 'all' || event.eventType === filters.eventType;
        const matchesStatus = filters.status === 'all' || event.status === filters.status;
        const matchesSeverity = (event.severity ?? 0) >= filters.minSeverity;
        const matchesConfidence = (event.confidence ?? 0) >= filters.minConfidence;

        return (
          matchesSearch &&
          matchesType &&
          matchesStatus &&
          matchesSeverity &&
          matchesConfidence &&
          matchesDateRange(event, filters)
        );
      })
    );
  }, [events, filters]);

  useEffect(() => {
    if (!filteredEvents.length) {
      setFocusedEventId(null);
      return;
    }

    const selectedStillVisible = filteredEvents.some((event) => event.id === focusedEventId);
    if (!selectedStillVisible) {
      setFocusedEventId(filteredEvents[0].id);
    }
  }, [filteredEvents, focusedEventId]);

  useEffect(() => {
    if (mapMode === 'event') {
      setSelectedCustomerId(null);
    }
  }, [mapMode]);

  useEffect(() => {
    if (selectedCustomerId && !customers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(null);
    }
  }, [customers, selectedCustomerId]);

  const focusedEvents = useMemo(
    () => (focusedEventId ? filteredEvents.filter((event) => event.id === focusedEventId) : filteredEvents),
    [filteredEvents, focusedEventId]
  );

  const assessments = useMemo(
    () => buildCustomerImpactAssessments(customers, focusedEvents),
    [customers, focusedEvents]
  );

  const exposureSummary = useMemo(
    () => buildExposureSummary(customers, assessments),
    [customers, assessments]
  );

  const focusedEvent = useMemo(
    () => filteredEvents.find((event) => event.id === focusedEventId) ?? null,
    [filteredEvents, focusedEventId]
  );

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const selectedAssessment = useMemo<CustomerImpactAssessment | null>(
    () => assessments.find((assessment) => assessment.customerId === selectedCustomerId) ?? null,
    [assessments, selectedCustomerId]
  );

  const selectedImpactEvent = useMemo<DisasterEvent | null>(() => {
    if (!selectedAssessment?.eventId) {
      return null;
    }

    return filteredEvents.find((event) => event.id === selectedAssessment.eventId) ?? null;
  }, [filteredEvents, selectedAssessment]);

  const confirmedCount = filteredEvents.filter((event) => event.status === 'confirmed').length;
  const totalSources = filteredEvents.reduce((sum, event) => sum + event.sourcesCount, 0);
  const highestSeverity = filteredEvents[0]?.severity ?? 0;
  const isInitialLoading = isLoading || areCustomersLoading;
  const combinedError = error || customersError;

  return (
    <main className="dashboard">
      <section className="hero">
        <div>
          <span className="eyebrow">Climate event intelligence</span>
          <h1>Dashboard geospaziale di pre-allarme sinistri</h1>
          <p>
            Eventi climatici, clienti sul territorio e una prima stima geospaziale delle esposizioni per organizzare il territorio prima delle denunce.
          </p>
        </div>

        <div className="hero-stats">
          <article>
            <span>Eventi attivi</span>
            <strong>{filteredEvents.length}</strong>
          </article>
          <article>
            <span>Confermati</span>
            <strong>{confirmedCount}</strong>
          </article>
          <article>
            <span>Fonti aggregate</span>
            <strong>{totalSources}</strong>
          </article>
          <article>
            <span>Picco severita</span>
            <strong>{Math.round(highestSeverity * 100)}%</strong>
          </article>
        </div>
      </section>

      <FilterBar filters={filters} onChange={setFilters} />

      <section className="status-strip">
        <span>{isInitialLoading ? 'Caricamento iniziale scenario...' : 'Eventi e clienti mock sincronizzati.'}</span>
        <span>{isRefreshing ? 'Refresh periodico in corso.' : 'Polling simulato ogni 45 secondi.'}</span>
        <span>
          {lastUpdated
            ? `Ultimo refresh: ${new Date(lastUpdated).toLocaleTimeString('it-IT')}`
            : 'In attesa del primo refresh.'}
        </span>
        <span>{combinedError ? `Errore feed: ${combinedError}` : 'Scenario clienti ed eventi pronto per il focus operativo.'}</span>
      </section>

      <section className="workspace">
        <div className="operations-main">
          <OperationalMapView
            mode={mapMode}
            events={focusedEvents}
            allEvents={filteredEvents}
            customers={customers}
            assessments={assessments}
            focusedEventId={focusedEventId}
            selectedCustomerId={selectedCustomerId}
            onModeChange={setMapMode}
            onFocusedEventChange={setFocusedEventId}
            onSelectedCustomerChange={setSelectedCustomerId}
          />
          <ExposureSummaryPanel
            mode={mapMode}
            focusedEvent={focusedEvent}
            customers={customers}
            assessments={assessments}
            summary={exposureSummary}
            selectedCustomer={selectedCustomer}
            selectedAssessment={selectedAssessment}
            selectedImpactEvent={selectedImpactEvent}
          />
        </div>
        <OperationalInsightsPanel
          events={filteredEvents}
          selectedEventId={focusedEventId}
          onSelectEvent={setFocusedEventId}
        />
      </section>
    </main>
  );
}
