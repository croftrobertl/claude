/**
 * Price-breakdown fixtures, transcribed from real doracanalcourt.com checkouts.
 *
 * MotoPress nests each accommodation's detail in its own table inside the
 * expander row, which is why the summary rows and the in-block rows can carry
 * the same labels. The figures here are the ones the owner verified on live.
 */

// 4 guests, 2 nights, Cottage 36. Extra Guest Fee $200 (untaxed).
const withService = `
<table>
  <tr class="mphb-price-breakdown-booking">
    <td><a href="#" class="exp">-</a> #1 Cottage 36: Sunshine Suite</td><td>$588.50</td>
  </tr>
  <tr><td>
    <table>
      <tr><td>Rate: Cottage 36: Sunshine Suite</td><td></td></tr>
      <tr><td>Number of Guests</td><td>4</td></tr>
      <tr><td>Nights</td><td>2</td></tr>
      <tr><td>Dates</td><td>Amount</td></tr>
      <tr><td>September 17, 2026</td><td>$175</td></tr>
      <tr><td>September 18, 2026</td><td>$175</td></tr>
      <tr><td>Accommodation Total</td><td>$350</td></tr>
      <tr><td>Accommodation Taxes</td><td>Amount</td></tr>
      <tr><td>Lake County Tourist Development Tax</td><td>$14</td></tr>
      <tr><td>Lake County Discretionary Sales Surtax</td><td>$3.50</td></tr>
      <tr><td>Florida Sales and Use Tax</td><td>$21</td></tr>
      <tr><td>Accommodation Taxes Total</td><td>$38.50</td></tr>
      <tr><td>Services</td><td></td></tr>
      <tr><td>Service</td><td>Amount</td></tr>
      <tr><td>Extra Guest Fee (per guest beyond 2)</td><td>$200</td></tr>
      <tr><td>Services Total</td><td>$200</td></tr>
      <tr><td>Subtotal</td><td>$588.50</td></tr>
    </table>
  </td></tr>
  <tr><td>Subtotal (excluding taxes)</td><td>$550</td></tr>
  <tr><td>Taxes</td><td>$38.50</td></tr>
  <tr><td>Total</td><td>$588.50</td></tr>
</table>`;

// 2 guests, 2 nights, Cottage 36. No services — the owner's target shape.
const noService = `
<table>
  <tr class="mphb-price-breakdown-booking">
    <td><a href="#" class="exp">-</a> #1 Cottage 36: Sunshine Suite</td><td>$388.50</td>
  </tr>
  <tr><td>
    <table>
      <tr><td>Rate: Cottage 36: Sunshine Suite</td><td></td></tr>
      <tr><td>Number of Guests</td><td>2</td></tr>
      <tr><td>Nights</td><td>2</td></tr>
      <tr><td>Dates</td><td>Amount</td></tr>
      <tr><td>September 17, 2026</td><td>$175</td></tr>
      <tr><td>September 18, 2026</td><td>$175</td></tr>
      <tr><td>Accommodation Total</td><td>$350</td></tr>
      <tr><td>Accommodation Taxes</td><td>Amount</td></tr>
      <tr><td>Lake County Tourist Development Tax</td><td>$14</td></tr>
      <tr><td>Lake County Discretionary Sales Surtax</td><td>$3.50</td></tr>
      <tr><td>Florida Sales and Use Tax</td><td>$21</td></tr>
      <tr><td>Accommodation Taxes Total</td><td>$38.50</td></tr>
      <tr><td>Subtotal</td><td>$388.50</td></tr>
    </table>
  </td></tr>
  <tr><td>Subtotal (excluding taxes)</td><td>$350</td></tr>
  <tr><td>Taxes</td><td>$38.50</td></tr>
  <tr><td>Total</td><td>$388.50</td></tr>
</table>`;

// Two cottages. Nothing here duplicates: each Accommodation Total is a real
// per-cottage figure, and no single line item's pre-tax amount is knowable
// from the shared Subtotal.
const twoAccommodations = `
<table>
  <tr class="mphb-price-breakdown-booking">
    <td><a href="#" class="exp">-</a> #1 Cottage 36: Sunshine Suite</td><td>$388.50</td>
  </tr>
  <tr><td>
    <table>
      <tr><td>Accommodation Total</td><td>$350</td></tr>
      <tr><td>Accommodation Taxes</td><td>Amount</td></tr>
      <tr><td>Florida Sales and Use Tax</td><td>$38.50</td></tr>
      <tr><td>Accommodation Taxes Total</td><td>$38.50</td></tr>
    </table>
  </td></tr>
  <tr class="mphb-price-breakdown-booking">
    <td><a href="#" class="exp">-</a> #2 Cottage 22: Palm Cottage</td><td>$222</td>
  </tr>
  <tr><td>
    <table>
      <tr><td>Accommodation Total</td><td>$200</td></tr>
      <tr><td>Accommodation Taxes Total</td><td>$22</td></tr>
    </table>
  </td></tr>
  <tr><td>Subtotal (excluding taxes)</td><td>$550</td></tr>
  <tr><td>Taxes</td><td>$60.50</td></tr>
  <tr><td>Total</td><td>$610.50</td></tr>
</table>`;

// Every label renamed (a translation, or a MotoPress change). Nothing should
// be recognised, and therefore nothing should be touched.
const renamedLabels = `
<table>
  <tr class="mphb-price-breakdown-booking">
    <td><a href="#" class="exp">-</a> #1 Cottage 36: Sunshine Suite</td><td>$388.50</td>
  </tr>
  <tr><td>
    <table>
      <tr><td>Lodging Sum</td><td>$350</td></tr>
      <tr><td>Levies Applied</td><td>Amount</td></tr>
      <tr><td>Lake County Tourist Development Levy</td><td>$14</td></tr>
      <tr><td>Florida Sales and Use Levy</td><td>$24.50</td></tr>
      <tr><td>Levies Applied Sum</td><td>$38.50</td></tr>
      <tr><td>Running Sum</td><td>$388.50</td></tr>
    </table>
  </td></tr>
  <tr><td>Net Of Levies</td><td>$350</td></tr>
  <tr><td>Levies</td><td>$38.50</td></tr>
  <tr><td>Amount Due</td><td>$388.50</td></tr>
</table>`;

// The checkout form as MotoPress actually renders it on this site: the guest
// chooser and "Choose Additional Services" live in the SAME
// .mphb-checkout-section. That is why hiding the ancestor section could never
// work — the guard protecting the chooser protected the services with it.
const sharedSection = `
<div class="mphb-checkout-section">
  <h3>Accommodation Details</h3>
  <input type="hidden" name="mphb_check_in_date" value="2026-09-17">
  <input type="hidden" name="mphb_check_out_date" value="2026-09-19">
  <p>Accommodation: <a href="#">Cottage 36: Sunshine Suite</a></p>
  <p class="mphb-adults-chooser">
    <label>Number of Guests</label>
    <select name="mphb_room_details[0][adults]" class="mphb_sc_checkout-guests-chooser">
      <option value="">— Select —</option>
      <option>1</option><option>2</option><option>3</option><option selected>4</option>
    </select>
  </p>
  <h3 class="services-heading">Choose Additional Services</h3>
  <ul class="mphb_sc_checkout-services-list">
    <li class="mphb_sc_checkout-service">
      <label>
        <input type="checkbox" checked
               name="mphb_room_details[0][services][0][id]" value="18063">
        Extra Guest Fee (per guest beyond 2) ($50 / Per Day) for
      </label>
      <select name="mphb_room_details[0][services][0][adults]">
        <option>1</option><option selected>2</option>
      </select>
      guest(s)
    </li>
  </ul>
</div>`;

module.exports = {
    withService, noService, twoAccommodations, renamedLabels, sharedSection
};
