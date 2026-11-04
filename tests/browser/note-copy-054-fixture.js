'use strict';
/**
 * 0.54.0 — the booking pop-up's NOTES, as the server sends them
 * (Staff_Data::section_notes / entry_rows: label "date · author", value the
 * note's text with tags stripped and line breaks kept). Sample bookings on
 * board-fixture.js's board; invented guests and notes.
 *
 *   booking 1  (Ann Smith, #22)   ONE note, three lines, the middle one
 *                                 ending in spaces (they must not be copied)
 *   booking 7  (Gus Long, #22)    TWO notes, newest first, and the guest's
 *                                 own Customer Note above them
 * Both carry a Phone line, so its "Text" pill is on the same pop-up as the
 * Copy buttons it is measured against.
 */
const F = require('./board-fixture.js');

const NOTE_1 = 'Early check-in OK from 1pm.\nGate code 4417   \nBoat key on the hook by the door.';
const NOTE_2A = 'Tony: towels for 4, crib in the bedroom.';
const NOTE_2B = 'Guest asked about kayaks.\n\nTold them: life jackets in the shed.';
const CUSTOMER = 'Arriving late, around 9pm.';

const DETAILS = JSON.parse(JSON.stringify(F.DETAILS));
DETAILS[1].sections.notes = [{ label: 'Aug 4, 2026, 3:15 pm · Rob Croft', value: NOTE_1 }];
DETAILS[7] = { id: 7, imported: false, source: { imported: false, key: 'direct', ota: '' },
  sections: { booking: [{ label: 'Accommodation Type', value: 'Cottage 22' }],
    customer: [{ label: 'First Name', value: 'Gus' }, { label: 'Phone', value: '+1 (555) 010-7788', tel: '+15550107788' }],
    // `guest: true` as the server marks the guest's own note since 0.56.0.
    notes: [{ label: 'Customer Note', value: CUSTOMER, guest: true },
            { label: 'Oct 7, 2026, 9:02 am · Rob Croft', value: NOTE_2A },
            { label: 'Oct 1, 2026, 4:40 pm · Dana Admin', value: NOTE_2B }] } };

module.exports = { F, DETAILS, NOTE_1, NOTE_2A, NOTE_2B, CUSTOMER };
