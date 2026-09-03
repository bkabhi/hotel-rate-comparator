import { Star } from 'lucide-react';
import type { HotelOffer } from '../api/contract';
import { money } from '../lib/format';
import styles from './OfferTable.module.css';

interface OfferTableProps {
  offers: HotelOffer[];
  best: HotelOffer | null;
}

export function OfferTable({ offers, best }: OfferTableProps) {
  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="srOnly">
          Every rate returned by both suppliers, cheapest first
        </caption>
        <thead>
          <tr>
            <th scope="col">Hotel</th>
            <th scope="col">Supplier</th>
            <th scope="col" className={styles.numeric}>
              Per night
            </th>
            <th scope="col" className={styles.numeric}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const isBest = best !== null && offer.hotelId === best.hotelId && offer.supplier === best.supplier;
            return (
              <tr
                key={`${offer.supplier}-${offer.hotelId}`}
                className={isBest ? styles.best : undefined}
              >
                <td className={styles.hotel}>
                  <div className={styles.hotelName}>
                    {offer.name}
                    {isBest ? <span className={styles.bestChip}>Best</span> : null}
                  </div>
                  <div className={styles.hotelMeta}>
                    <span className={styles.rating}>
                      <Star size={10} className={styles.star} fill="currentColor" aria-hidden />
                      {offer.rating.toFixed(1)}
                    </span>
                    {' · '}
                    {offer.neighbourhood}
                  </div>
                </td>
                <td data-label="Supplier">
                  <span className={styles.supplier}>
                    <span className={styles.supplierMark} aria-hidden>
                      {offer.supplier}
                    </span>
                    <span className={styles.supplierName}>{offer.supplierName}</span>
                  </span>
                </td>
                <td data-label="Per night" className={`${styles.numeric} tabular`}>
                  {money(offer.pricePerNight, offer.currency)}
                </td>
                <td data-label="Total" className={`${styles.numeric} ${styles.total} tabular`}>
                  {money(offer.price, offer.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
