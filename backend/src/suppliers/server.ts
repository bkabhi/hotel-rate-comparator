import { config } from '../config';
import { createSupplierApp } from './app';
import { SUPPORTED_CITIES } from './catalog';

const app = createSupplierApp();

app.listen(config.suppliers.port, () => {
  console.log(`[suppliers] mock supplier APIs on http://localhost:${config.suppliers.port}`);
  console.log(`[suppliers]   GET /supplierA/hotels?city=&checkIn=&checkOut=[&behavior=]`);
  console.log(`[suppliers]   GET /supplierB/hotels?city=&checkIn=&checkOut=[&behavior=]`);
  console.log(`[suppliers]   cities: ${SUPPORTED_CITIES.join(', ')}`);
});
