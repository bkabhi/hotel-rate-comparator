import { useCallback, useEffect, useState } from 'react';
import { AppShell, type HealthState } from './components/AppShell';
import { SearchPanel, DEFAULT_FORM, type SearchForm } from './components/SearchPanel';
import {
  SimulationPanel,
  DEFAULT_SIMULATION,
  toSimulationConfig,
  type SimulationState,
} from './components/SimulationPanel';
import { RunPane } from './components/RunPane';
import { useHotelSearch } from './hooks/useHotelSearch';
import { api } from './api/client';

export default function App() {
  const { state, search, cancel, reset } = useHotelSearch();
  const [form, setForm] = useState<SearchForm>(DEFAULT_FORM);
  const [simulation, setSimulation] = useState<SimulationState>(DEFAULT_SIMULATION);
  const [cities, setCities] = useState<string[]>([]);
  const [health, setHealth] = useState<HealthState>('checking');
  const [taskQueue, setTaskQueue] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    void api
      .getHealth()
      .then((result) => {
        if (!live) return;
        setHealth(result.ok ? 'connected' : 'down');
        setTaskQueue(result.taskQueue);
      })
      .catch(() => live && setHealth('down'));

    void api
      .getCities()
      .then((result) => live && setCities(result.cities))
      .catch(() => undefined);

    return () => {
      live = false;
    };
  }, []);

  const submit = useCallback(() => {
    void search({
      city: form.city.trim(),
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      ...(toSimulationConfig(simulation) ? { simulation: toSimulationConfig(simulation) } : {}),
    });
  }, [form, search, simulation]);

  const busy = state.phase === 'starting' || state.phase === 'running' || state.phase === 'cancelling';

  // Validation errors belong on the form, not in the run pane.
  const formLevelError =
    state.error?.code === 'INVALID_REQUEST' && Object.keys(state.fieldErrors).length === 0
      ? state.error.message
      : undefined;

  return (
    <AppShell
      health={health}
      taskQueue={taskQueue}
      rail={
        <>
          <SearchPanel
            form={form}
            onChange={setForm}
            onSubmit={submit}
            onCancel={() => void cancel()}
            busy={busy}
            cancelling={state.phase === 'cancelling'}
            cities={cities}
            fieldErrors={state.fieldErrors}
            {...(formLevelError ? { formError: formLevelError } : {})}
          />
          <SimulationPanel value={simulation} onChange={setSimulation} disabled={busy} />
        </>
      }
    >
      <RunPane
        state={state.error?.code === 'INVALID_REQUEST' ? { ...state, phase: 'idle' } : state}
        onRetry={submit}
        onReset={reset}
      />
    </AppShell>
  );
}
