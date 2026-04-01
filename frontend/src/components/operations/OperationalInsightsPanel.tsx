import { EventSidebar } from '../EventSidebar';

/*
OperationalInsightsPanel incapsula la colonna laterale operativa.
Al momento delega la vista alla sidebar eventi, mantenendo separata la struttura della pagina dal dettaglio del feed.
*/

interface OperationalInsightsPanelProps {
  events: Parameters<typeof EventSidebar>[0]['events'];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
}

export function OperationalInsightsPanel({
  events,
  selectedEventId,
  onSelectEvent,
}: OperationalInsightsPanelProps) {
  return (
    <div className="operations-sidebar">
      <EventSidebar events={events} selectedEventId={selectedEventId} onSelect={onSelectEvent} />
    </div>
  );
}
