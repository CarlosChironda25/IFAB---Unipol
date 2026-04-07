import type { StaffingAssignment, StaffingRecommendation } from '../../types/exposure';
import type { DisasterEvent } from '../../types/event';

/*
StaffingRecommendationPanel presenta la lettura operativa del pre allarme.
Mostra quanti periti servono, quali interni coprono gia il territorio e dove scatta la riallocazione o l outsourcing.
*/

interface StaffingRecommendationPanelProps {
  focusedEvent: DisasterEvent | null;
  recommendation: StaffingRecommendation;
}

function renderAssignments(title: string, assignments: StaffingAssignment[], emptyMessage: string) {
  return (
    <article className="staffing-panel__card">
      <h3>{title}</h3>
      {assignments.length ? (
        <ul className="summary-list">
          {assignments.map((assignment) => (
            <li key={assignment.surveyorId}>
              <span>
                {assignment.name}
                <small className="staffing-panel__meta">
                  {assignment.homeBase} · {Math.round(assignment.distanceKm)} km
                </small>
              </span>
              <strong>{assignment.travelDays} gg</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </article>
  );
}

export function StaffingRecommendationPanel({
  focusedEvent,
  recommendation,
}: StaffingRecommendationPanelProps) {
  const target7 = recommendation.targets.find((target) => target.targetDays === 7);
  const target15 = recommendation.targets.find((target) => target.targetDays === 15);

  return (
    <section className="staffing-panel">
      <div className="staffing-panel__header">
        <div>
          <span className="eyebrow">Pianificazione periti</span>
          <h2>Stima copertura operativa</h2>
        </div>
        <span className="staffing-panel__scope">{focusedEvent ? focusedEvent.title : 'Scenario aggregato'}</span>
      </div>

      <div className="staffing-panel__stats">
        <article>
          <span>Clienti impattati</span>
          <strong>{recommendation.impactedCustomers}</strong>
        </article>
        <article>
          <span>Metratura ponderata</span>
          <strong>{Math.round(recommendation.weightedInspectionAreaSqm)} mq</strong>
        </article>
        <article>
          <span>Periti necessari 7 gg</span>
          <strong>{target7?.requiredSurveyors ?? 0}</strong>
        </article>
        <article>
          <span>Periti necessari 15 gg</span>
          <strong>{target15?.requiredSurveyors ?? 0}</strong>
        </article>
      </div>

      <div className="staffing-panel__targets">
        {[target7, target15].filter(Boolean).map((target) => (
          <article key={target?.targetDays} className="staffing-panel__target">
            <h3>Obiettivo {target?.targetDays} giorni</h3>
            <ul className="summary-list">
              <li>
                <span>Interni in zona</span>
                <strong>{target?.coveredByLocal}</strong>
              </li>
              <li>
                <span>Interni da spostare</span>
                <strong>{target?.coveredByRelocation}</strong>
              </li>
              <li>
                <span>Outsourcing</span>
                <strong>{target?.coveredByOutsourcing}</strong>
              </li>
              <li>
                <span>Gap residuo</span>
                <strong>{target?.shortfall}</strong>
              </li>
            </ul>
          </article>
        ))}
      </div>

      <div className="staffing-panel__body">
        {renderAssignments(
          'Priorita 1 · Interni in zona',
          recommendation.suggestedLocalAssignments,
          'Nessun perito interno gia in zona con i mock attuali.'
        )}
        {renderAssignments(
          'Priorita 2 · Riallocazioni interne',
          recommendation.suggestedRelocationAssignments,
          'Nessuna riallocazione necessaria per il target piu aggressivo.'
        )}
        {renderAssignments(
          'Priorita 3 · Outsourcing',
          recommendation.suggestedOutsourcingAssignments,
          'La copertura mock attuale non richiede outsourcing.'
        )}
      </div>
    </section>
  );
}
