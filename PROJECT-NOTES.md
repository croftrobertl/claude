# PROJECT NOTES — shared across the DCC plugins

Specs that more than one DCC plugin must implement identically. Each plugin
keeps its own copy of the code. This file holds the spec, so change it here
first, then in every plugin that implements it.

## Dropdown list (the site's own, in place of the operating system's)

**Who implements it**
- DCC Custom Checkout 0.34.1, on the guest checkout (/submit-booking/), every visible dropdown: `assets/select-list.js`, with CSS in `assets/checkout.css`.
- The Availability Calendar, on the staff board (its own session).

**Why** (Rob, 2026-10-12, via the Website Director)
- A native `<select>` list is drawn by the operating system: fully left-aligned on iPhone, off-centre to the right on desktop. No CSS can centre it.
- Rob chose a list drawn by the site that "drops down under the field" on phones and computers alike.
- The CLOSED field stays exactly as it was.

### Look
| Part | Value |
|---|---|
| Position | Directly under the field, a **4px** gap, the field's own width and left edge. **Upward** (ending 4px above the field) when the room below is less than the list needs and there is more room above. |
| Box | White `#FFFFFF`; border **2px solid `#F4DA62`**; the field's own border-radius (checkout: 30px); `padding: 6px 0`; a soft shadow `0 6px 18px rgba(0,0,0,0.12)`; above everything (`z-index: 100000`, over the site's 99999 datepicker / Places dropdown). |
| Height | Scrolls inside a **max height of 320px** (never less than 132px, three rows); opens scrolled to the current choice, centred where it can be. |
| Text | The field's own font family, size and weight (checkout: Raleway 18px). Never under **16px**, or iPhone Safari zooms the page. |
| Rows | **Centred** text; each row **at least 44px** tall (`padding: 10px 16px; line-height: 1.3`); black text. |
| Current choice | **Bold (700), `#0A50B2`, on `#E7EEF7`**. |
| Hover / keyboard focus | `#E7EEF7` background. Hover only under `@media (hover: hover) and (pointer: fine)`, because on iOS a first tap's `:hover` sticks. |
| Disabled option | `#9AA0A6`, not choosable. An option hidden by the page (`hidden`) is left out. |
| Focus ring | On the list itself: `3px solid #006BCF`, offset 2px (`:focus-visible`). |

### Behaviour
- **The real `<select>` is the source of truth.**
  - It stays in the form and submits.
  - It is hidden **visually only** (clipped to 1px, opacity 0, never `display:none` or `visibility:hidden`), with `tabindex="-1"` and `aria-hidden="true"`.
  - A choice sets its value and fires its real `input` and `change` events.
  - The field and list follow later changes to the select's options, value text and `disabled` (a MutationObserver).
  - A select that is replaced gets a new field, and one that is removed takes its field with it.
- **The field** is a `<button type="button">` with `aria-haspopup="listbox"` and `aria-expanded`.
  - It is named by its label then its value (`aria-labelledby="<label> <button>"`), and shows the selected option's text.
  - A click on the label focuses the field, never the hidden select. On iOS, focusing the select could raise the native picker.
- **The list** is a `role="listbox"` (named by the label), with `role="option"` items carrying `aria-selected`. Focus moves into it, and `aria-activedescendant` names the active option.
- **Opens** on a click or tap of the field, ArrowDown or ArrowUp, Enter or Space, or by typing a letter on the field.
- **Keys:**
  - arrows move; Home and End go to the first and last;
  - Enter or Space chooses;
  - Escape closes without choosing;
  - Tab closes without choosing.
- **Type-ahead:** letters typed within 700ms build a prefix. The same letter repeated cycles through its matches.
- **Closes** on a choice, Escape, a tap or click outside, focus leaving, or a width change. A height-only resize (the iOS URL bar) is ignored.
- Focus **returns to the field** on a choice, Escape and Tab. A tap outside does not take focus back from what was tapped.
- One list open at a time.

### Validation (Rob's rule: an error appears only after the error is made)
- A hidden required select cannot show the browser's bubble, so its `invalid` event is handled:
  - the message goes **under the field** in the error style (checkout: `#BC003E`, 16px, 600, centred);
  - the field is marked invalid (`aria-invalid`, `aria-describedby` → the message);
  - the **first** invalid control of the attempt takes focus.
- **Only after a submit attempt** (the press of a submit control), never at load, not even for a script's `checkValidity()`.
- When the first invalid control is one of these fields, a later native control's report is held back for that attempt. Natively, a browser reports one control per attempt.
- The guest-count message is **"Please select the number of guests."**
- A choice that satisfies the select clears its message.

### Tap rules (the checkout's, worth keeping anywhere)
- Nothing is written to the page on `touchstart` or `pointerdown` except closing a list that is open.
- The list opens on `click`.
- No timers: type-ahead uses timestamps.
- Every write compares first.
