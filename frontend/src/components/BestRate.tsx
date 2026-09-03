import { MapPin, Star, Trophy } from 'lucide-react';
import type { SearchResult } from '../api/contract';
import { dateRange, money, plural } from '../lib/format';
import styles from './BestRate.module.css';

interface BestRateProps {
  result: SearchResult;
}

export function BestRate({ result }: BestRateProps) {
  const best = result.best;
  if (!best) return null;

  const runnerUp = result.offers.find((offer) => offer !== best && offer.price > best.price);
  const saving = runnerUp ? runnerUp.price - best.price : 0;

  return (
    <article className={styles.card} aria-labelledby="best-rate-name">
      <span className={styles.chip}>
        <Trophy size={11} aria-hidden />
        Best rate
      </span>

      <div className={styles.headline}>
        <div className={styles.hotel}>
          <h3 className={styles.name} id="best-rate-name">
            {best.name}
          </h3>
          <p className={styles.where}>
            <span className={styles.rating}>
              <Star size={12} className={styles.star} fill="currentColor" aria-hidden />
              {best.rating.toFixed(1)}
            </span>
            <span className={styles.dot} aria-hidden />
            <span>
              <MapPin size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {best.neighbourhood}, {result.request.city}
            </span>
          </p>
        </div>

        <div className={styles.price}>
          <div className={`${styles.total} tabular`}>{money(best.price, best.currency)}</div>
          <div className={`${styles.perNight} tabular`}>
            {money(best.pricePerNight, best.currency)} × {plural(best.nights, 'night')}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerItem}>
          <span className={styles.supplierMark} aria-hidden>
            {best.supplier}
          </span>
          via {best.supplierName}
        </span>
        <span className={styles.footerItem}>
          {dateRange(result.request.checkIn, result.request.checkOut)}
        </span>
        {saving > 0 ? (
          <span className={`${styles.footerItem} ${styles.savings}`}>
            <span className="tabular">{money(saving, best.currency)}</span> below the next rate
          </span>
        ) : null}
      </footer>
    </article>
  );
}
