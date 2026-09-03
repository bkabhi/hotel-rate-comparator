import { useMemo } from 'react';
import { AlertCircle, CalendarDays, MapPin, Search, X } from 'lucide-react';
import { Panel } from './ui/Panel';
import { Field } from './ui/Field';
import { Button } from './ui/Button';
import { isoDate, nightsBetween, plural } from '../lib/format';
import styles from './SearchPanel.module.css';

export interface SearchForm {
  city: string;
  checkIn: string;
  checkOut: string;
}

export const DEFAULT_FORM: SearchForm = {
  city: 'Mumbai',
  checkIn: isoDate(14),
  checkOut: isoDate(17),
};

interface SearchPanelProps {
  form: SearchForm;
  onChange: (form: SearchForm) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  cancelling: boolean;
  cities: string[];
  fieldErrors: Record<string, string>;
  formError?: string;
}

export function SearchPanel({
  form,
  onChange,
  onSubmit,
  onCancel,
  busy,
  cancelling,
  cities,
  fieldErrors,
  formError,
}: SearchPanelProps) {
  const nights = useMemo(
    () => nightsBetween(form.checkIn, form.checkOut),
    [form.checkIn, form.checkOut],
  );

  const set = (patch: Partial<SearchForm>) => onChange({ ...form, ...patch });

  // Moving check-in past check-out drags the stay along instead of breaking it.
  const handleCheckIn = (checkIn: string) => {
    if (checkIn && form.checkOut && nightsBetween(checkIn, form.checkOut) <= 0) {
      const shifted = new Date(`${checkIn}T00:00:00Z`);
      shifted.setUTCDate(shifted.getUTCDate() + Math.max(1, nights));
      set({ checkIn, checkOut: shifted.toISOString().slice(0, 10) });
      return;
    }
    set({ checkIn });
  };

  return (
    <Panel title="Search" icon={<Search size={14} />}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onSubmit();
        }}
        noValidate
      >
        <div>
          <Field
            label="City"
            name="city"
            value={form.city}
            onChange={(event) => set({ city: event.target.value })}
            placeholder="Where are you going?"
            icon={<MapPin size={14} />}
            list="supported-cities"
            autoComplete="off"
            error={fieldErrors.city}
            disabled={busy}
          />
          <datalist id="supported-cities">
            {cities.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>

          {cities.length > 0 ? (
            <div className={styles.cityChips} style={{ marginTop: 'var(--s3)' }}>
              {cities.map((city) => (
                <button
                  key={city}
                  type="button"
                  disabled={busy}
                  onClick={() => set({ city })}
                  className={[
                    styles.chip,
                    city.toLowerCase() === form.city.trim().toLowerCase() ? styles.chipActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {city}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.dates}>
          <Field
            label="Check-in"
            type="date"
            name="checkIn"
            value={form.checkIn}
            min={isoDate(0)}
            onChange={(event) => handleCheckIn(event.target.value)}
            error={fieldErrors.checkIn}
            disabled={busy}
          />
          <Field
            label="Check-out"
            type="date"
            name="checkOut"
            value={form.checkOut}
            min={form.checkIn || isoDate(1)}
            onChange={(event) => set({ checkOut: event.target.value })}
            error={fieldErrors.checkOut}
            disabled={busy}
          />
        </div>

        <p className={styles.summary}>
          <CalendarDays size={12} aria-hidden />
          <span>
            {nights > 0
              ? `${plural(nights, 'night')} · rates shown for the whole stay`
              : 'Pick a check-out date'}
          </span>
        </p>

        {formError ? (
          <p className={styles.formError} role="alert">
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
            {formError}
          </p>
        ) : null}

        <div className={styles.submitRow}>
          {busy ? (
            <div className={styles.cancelRow}>
              <Button type="submit" variant="primary" block loading>
                Searching…
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={onCancel}
                disabled={cancelling}
                icon={<X size={14} />}
                aria-label="Cancel this search"
              >
                {cancelling ? 'Stopping' : 'Cancel'}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              variant="primary"
              block
              icon={<Search size={15} />}
              disabled={nights <= 0}
            >
              Compare rates
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
